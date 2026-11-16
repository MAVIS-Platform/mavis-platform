#requires -Version 7.0
param([ValidateSet('Success','Failure','StartupFailure','Timeout','Cancel','SecondProject')][string]$Case = 'Success')
$ErrorActionPreference = 'Stop'
$artifactRoot = Join-Path $PSScriptRoot 'artifacts'
$manifest = Get-Content (Join-Path $artifactRoot 'manifest.json') -Raw | ConvertFrom-Json
$second = $Case -eq 'SecondProject'
$entry = if ($second) { 'gateway' } else { 'orders' }
$peer = if ($second) { 'catalog' } else { 'payment' }
$entryImage = $manifest.images.$entry
$peerImage = $manifest.images.$peer
$setting = if ($second) { 'CATALOG_URL' } else { 'PAYMENT_URL' }
$entryRuntime = if ($second) { 'java' } else { 'dotnet8-linux-x64-glibc' }
$peerRuntime = if ($second) { 'dotnet8-linux-x64-glibc' } else { 'java' }
$session = 'poc-' + $Case.ToLowerInvariant() + '-' + [Guid]::NewGuid().ToString('N').Substring(0,8)
$compose = "services:`n  ${entry}:`n    image: $entryImage`n    environment:`n      ${setting}: http://${peer}:8080`n  ${peer}:`n    image: $peerImage`n"
if ($Case -eq 'StartupFailure') { $compose = $compose.Replace("  ${peer}:`n", "  ${peer}:`n    entrypoint: /bin/false`n") }
$path = if ($second) { '/checkout' } elseif ($Case -eq 'Failure') { '/failed-order' } else { '/orders' }
$apps = @{}; $apps[$entry] = @{runtime=$entryRuntime;containerPort=8080;readinessPath='/health'}; $apps[$peer] = @{runtime=$peerRuntime;containerPort=8080;readinessPath='/health'}
$mappings = @{}; $mappings[$entry] = 'model-' + $entry; $mappings[$peer] = 'model-' + $peer
$definition = @{
    sessionId=$session;modelVersionId='poc-model-'+$entry;sourceSnapshotId='poc-source-'+$entry;profileVersionId='poc-profile-v1';runConfigurationVersionId='poc-config-v1';scenarioVersionId='poc-scenario-'+$Case;
    composeYaml=$compose;confirmedServiceMappings=$mappings;
    profile=@{collectorImage=$manifest.collectorImage;instrumentationVolume=$manifest.instrumentationVolume;scenarioRunnerImage=$manifest.images.runner;applications=$apps;memoryMiB=512;cpus=1;timeoutSeconds=$(if($Case -eq 'Timeout'){1}else{120});approvedForLocalPoc=$true};
    scenario=@{sessionId=$session;timeoutSeconds=60;steps=@(@{id='request';service=$entry;method='GET';path=$path;expectedStatus=200})}
}
$inputPath = Join-Path $artifactRoot "session-$Case.json"; $resultPath = Join-Path $artifactRoot "result-$Case.json"
[IO.File]::WriteAllText($inputPath,($definition|ConvertTo-Json -Depth 20),[Text.UTF8Encoding]::new($false))
$env:MAVIS_RUNNER_ALLOW_LOCAL_POC = '1'
if ($Case -eq 'Cancel') {
    $start = [Diagnostics.ProcessStartInfo]::new((Get-Command dotnet).Source)
    $start.UseShellExecute=$false; $start.CreateNoWindow=$true; $start.RedirectStandardOutput=$true; $start.RedirectStandardError=$true
    foreach($argument in @((Join-Path $artifactRoot 'runner-publish/MAVIS.Runner.dll'),'run',$inputPath,(Join-Path $PSScriptRoot 'collector.yaml'),(Join-Path $artifactRoot 'sessions'))){$start.ArgumentList.Add($argument)}
    $process = [Diagnostics.Process]::Start($start)
    $output = $process.StandardOutput.ReadToEndAsync()
    $resource = [regex]::Match($process.StandardError.ReadLine(),'mavisrun-[a-f0-9]{32}').Value
    if (!$resource) { throw 'No session resource ID returned.' }
    $watch = [Diagnostics.Stopwatch]::StartNew(); $active=$false
    while ($watch.Elapsed.TotalSeconds -lt 15 -and !$process.HasExited) {
        $ids = & docker ps -q --filter "label=com.docker.compose.project=$resource"
        if ($ids) { $active=$true; break }
        Start-Sleep -Milliseconds 250
    }
    if (!$active) { throw 'No active workload available for cancellation test.' }
    [IO.File]::WriteAllText((Join-Path (Join-Path (Join-Path $artifactRoot 'sessions') $resource) 'cancel.request'),'cancel')
    if (!$process.WaitForExit(45000)) { throw 'Cancellation did not settle within the test bound; use recover for this resource project.' }
    [IO.File]::WriteAllText($resultPath,$output.GetAwaiter().GetResult(),[Text.UTF8Encoding]::new($false))
    $process.Dispose()
} else {
    & dotnet (Join-Path $artifactRoot 'runner-publish/MAVIS.Runner.dll') run $inputPath (Join-Path $PSScriptRoot 'collector.yaml') (Join-Path $artifactRoot 'sessions') > $resultPath
}
$result = Get-Content $resultPath -Raw | ConvertFrom-Json
$expected = switch ($Case) { 'Failure' { 'Completed' } 'StartupFailure' { 'Failed' } 'Timeout' { 'TimedOut' } 'Cancel' { 'Cancelled' } default { 'Completed' } }
if ($result.outcome.executionStatus -ne $expected -or $result.outcome.cleanupStatus -ne 'Confirmed') { throw 'Execution/cleanup acceptance failed. Inspect redacted result artifact.' }
if ($Case -in @('Success','SecondProject','Failure')) {
    $scenarioExpected = if ($Case -eq 'Failure') { 'Failed' } else { 'Passed' }
    if ($result.outcome.scenarioStatus -ne $scenarioExpected -or $result.outcome.evidenceStatus -ne 'Available' -or !$result.sandboxEnforcementConfirmed) { throw 'Scenario/evidence/sandbox acceptance failed.' }
    $spans=@{};foreach($span in $result.outcome.trace.spans){$spans[$span.traceId+':'+$span.spanId]=$span}
    $cross=@($result.outcome.trace.causalEdges | Where-Object {$spans[$_.traceId+':'+$_.parentSpanId].runtimeService -eq $entry -and $spans[$_.traceId+':'+$_.childSpanId].runtimeService -eq $peer})
    if($cross.Count -lt 1){throw 'Expected causal service interaction not observed.'}
}
[pscustomobject]@{case=$Case;session=$result.sessionId;execution=$result.outcome.executionStatus;scenario=$result.outcome.scenarioStatus;evidence=$result.outcome.evidenceStatus;cleanup=$result.outcome.cleanupStatus;spans=$result.outcome.trace.spans.Count;resultFile=$resultPath} | ConvertTo-Json
