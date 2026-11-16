#requires -Version 7.0
param([string]$Image = 'mavis-worker:n01', [switch]$UpdateFixtures,
    [ValidateRange(0,20)][int]$BenchmarkIterations = 0)
$ErrorActionPreference = 'Stop'
$workerRoot = Split-Path $PSScriptRoot -Parent
$fixtures = Join-Path $workerRoot 'contracts/n01'
$scopeRoot = Join-Path $workerRoot '.artifacts/n01-scope'
$artifactPath = Join-Path $scopeRoot ('a' * 64)
New-Item -ItemType Directory -Force $artifactPath | Out-Null
Copy-Item -LiteralPath (Join-Path $fixtures 'source/App.cs'),(Join-Path $fixtures 'source/App.csproj') -Destination $artifactPath
$containerName = 'mavis-worker-n01-' + [Guid]::NewGuid().ToString('N')
function To-Base64Url([byte[]]$Bytes) { [Convert]::ToBase64String($Bytes).TrimEnd('=').Replace('+','-').Replace('/','_') }
function Response-Text($Response) {
    if ($Response.Content -is [byte[]]) { return [Text.Encoding]::UTF8.GetString($Response.Content) }
    return [string]$Response.Content
}
try {
    $null = docker run -d --name $containerName --read-only --cap-drop ALL --security-opt no-new-privileges --memory 512m --cpus 1 --tmpfs /tmp:rw,noexec,size=64m -p '127.0.0.1::8080' -e 'WorkerAccess__ApiKey=test-service-key' -e 'ArtifactScope__Root=/artifacts' -e 'ArtifactScope__GrantKeys__test=fixture-only-not-for-production-32-byte-key' --mount "type=bind,source=$scopeRoot,target=/artifacts,readonly" $Image
    if ($LASTEXITCODE -ne 0) { throw 'Container startup failed' }
    $port = (docker port $containerName '8080/tcp').Trim().Split(':')[-1]
    $baseUrl = "http://127.0.0.1:$port"
    $ready = $false
    for ($i=0; $i -lt 30; $i++) {
        try { $null = Invoke-RestMethod "$baseUrl/api/health/ready" -TimeoutSec 2; $ready = $true; break }
        catch { Start-Sleep -Milliseconds 250 }
    }
    if (!$ready) { throw 'Readiness failed' }
    $claims = Get-Content -Raw (Join-Path $fixtures 'claims.json') | ConvertFrom-Json -AsHashtable
    $claims.deadlineUtc = [DateTimeOffset]::UtcNow.AddMinutes(2).ToString('O')
    $signed = 'test.' + (To-Base64Url ([Text.Encoding]::UTF8.GetBytes(($claims | ConvertTo-Json -Compress))))
    $token = $signed + '.' + (To-Base64Url ([Security.Cryptography.HMACSHA256]::HashData([Text.Encoding]::UTF8.GetBytes('fixture-only-not-for-production-32-byte-key'), [Text.Encoding]::ASCII.GetBytes($signed))))
    $headers = @{'X-Mavis-Worker-Key'='test-service-key'}
    $body = @{schemaVersion='1.0';artifactGrant=$token} | ConvertTo-Json -Compress
    $firstRequest = [Diagnostics.Stopwatch]::StartNew()
    $response = Invoke-WebRequest "$baseUrl/api/v1/dotnet/analyze" -Method Post -Headers $headers -ContentType 'application/json' -Body $body
    $firstRequest.Stop()
    $result = (Response-Text $response) | ConvertFrom-Json
    if ($result.attemptId -ne 'a1' -or $result.inputDigest -ne $claims.expectedInputDigest) { throw 'Result provenance mismatch' }
    if ($BenchmarkIterations -gt 0) {
        $warm = @()
        for ($iteration=0; $iteration -lt $BenchmarkIterations; $iteration++) {
            $clock = [Diagnostics.Stopwatch]::StartNew()
            $repeat = Invoke-RestMethod "$baseUrl/api/v1/dotnet/analyze" -Method Post -Headers $headers -ContentType 'application/json' -Body $body -TimeoutSec 60
            $clock.Stop()
            if ($repeat.inputDigest -ne $claims.expectedInputDigest -or $repeat.attemptId -ne 'a1') { throw 'Benchmark response provenance mismatch' }
            $warm += [Math]::Round($clock.Elapsed.TotalMilliseconds,2)
        }
        $imageId = (& docker inspect $containerName --format '{{.Image}}').Trim()
        if ($LASTEXITCODE -ne 0) { throw 'Benchmark image inspection failed' }
        $memory = (& docker stats --no-stream --format '{{.MemUsage}}' $containerName).Trim()
        if ($LASTEXITCODE -ne 0) { throw 'Benchmark memory sample failed' }
        $measurement = [ordered]@{
            measuredAtUtc=[DateTimeOffset]::UtcNow.ToString('O'); imageId=$imageId
            scope='Tiny N01 fixture, one fresh container, HTTP wall time; no acceptance threshold'
            firstAnalysisMs=[Math]::Round($firstRequest.Elapsed.TotalMilliseconds,2)
            warmAnalysisMs=$warm; warmMeanMs=[Math]::Round(($warm | Measure-Object -Average).Average,2)
            memorySampleAfterRequests=$memory
            limitations=@('First request includes JIT; filesystem/OS caches are not cleared','Memory is a single Docker sample, not peak RSS','Not representative of large repositories or concurrent tenants')
        }
        $outputPath = Join-Path $workerRoot '.artifacts/n01-benchmark.json'
        [IO.File]::WriteAllText($outputPath,($measurement | ConvertTo-Json -Depth 5)+"`r`n",[Text.UTF8Encoding]::new($false))
        Write-Output "Benchmark written: $outputPath"
    }
    $bad = Invoke-WebRequest "$baseUrl/api/v1/dotnet/analyze" -Method Post -Headers $headers -ContentType 'application/json' -Body '{"schemaVersion":"1.0","artifactGrant":"test.invalid.invalid"}' -SkipHttpErrorCheck
    $errorBody = (Response-Text $bad) | ConvertFrom-Json -AsHashtable
    if ([int]$bad.StatusCode -ne 403 -or $errorBody['code'] -ne 'ARTIFACT_SCOPE_DENIED' -or !$errorBody['traceId']) { throw 'Invalid grant error contract mismatch' }
    $anonymous = Invoke-WebRequest "$baseUrl/api/v1/dotnet/analyze" -Method Post -ContentType 'application/json' -Body $body -SkipHttpErrorCheck
    if ([int]$anonymous.StatusCode -ne 401) { throw 'Anonymous request was not denied' }
    $legacy = Invoke-WebRequest "$baseUrl/api/jobs/missing" -SkipHttpErrorCheck
    if ([int]$legacy.StatusCode -ne 404) { throw 'Legacy API enabled unexpectedly' }
    if ($UpdateFixtures) {
        [IO.File]::WriteAllText((Join-Path $fixtures 'result.json'), (Response-Text $response) + "`r`n", [Text.UTF8Encoding]::new($false))
        $errorBody['traceId'] = 'fixture-trace'
        [IO.File]::WriteAllText((Join-Path $fixtures 'error.json'), ($errorBody | ConvertTo-Json) + "`r`n", [Text.UTF8Encoding]::new($false))
    }
    docker inspect $containerName --format 'User={{.Config.User}} ReadOnly={{.HostConfig.ReadonlyRootfs}} Memory={{.HostConfig.Memory}}'
    if ($LASTEXITCODE -ne 0) { throw 'Container inspection failed' }
    Write-Output 'N01 image smoke: PASS (ready, scoped analysis, provenance, 401/403, legacy 404)'
}
finally {
    $null = docker rm -f $containerName
    if ($LASTEXITCODE -ne 0) { throw "Cleanup failed for $containerName" }
}
