param(
    [ValidateSet('All','Java','Worker','Frontend','Check')][string]$Service = 'Check',
    [switch]$Initialize,
    [switch]$Build,
    [switch]$WaitReady,
    [switch]$OpenBrowser,
    [string]$SettingsPath
)
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
if (-not $SettingsPath) { $SettingsPath = Join-Path $repo '.env.backend.local' }
$example = Join-Path $repo '.env.backend.example'
if ($Initialize) {
    if (Test-Path -LiteralPath $SettingsPath) { throw 'Local settings already exist; edit them rather than overwriting keys/passwords.' }
    $template = [IO.File]::ReadAllText($example)
    foreach ($name in @('MAVIS_JWT_SECRET','MAVIS_RUNNER_SERVICE_KEY','MAVIS_WORKER_SERVICE_KEY','MAVIS_WORKER_GRANT_KEY')) {
        $bytes = New-Object byte[] 48
        $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
        try { $generator.GetBytes($bytes) } finally { $generator.Dispose() }
        $template = $template.Replace("$name=<GENERATED_BY_INITIALIZE>", "$name=$([Convert]::ToBase64String($bytes))")
    }
    [IO.File]::WriteAllText($SettingsPath,$template,[Text.UTF8Encoding]::new($false))
    Write-Host 'Created .env.backend.local with stable local service keys. Fill DB URL/user/password before starting. Do not commit or send this file in chat.'
    return
}
if (-not (Test-Path -LiteralPath $SettingsPath)) { throw 'Missing .env.backend.local. Run ./scripts/Start-Mavis.ps1 -Initialize, then fill the database credentials.' }
$values = @{}
foreach ($line in [IO.File]::ReadAllLines($SettingsPath)) {
    if ($line.Trim() -eq '' -or $line.TrimStart().StartsWith('#')) { continue }
    if ($line -notmatch '^([A-Z][A-Z0-9_]*)=(.*)$') { throw 'Invalid local settings line; use NAME=value without shell commands.' }
    $name = $Matches[1]; $value = $Matches[2].Trim()
    if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) { $value=$value.Substring(1,$value.Length-2) }
    $values[$name]=$value
}
foreach ($name in @('MAVIS_DB_URL','MAVIS_DB_USERNAME','MAVIS_DB_PASSWORD','MAVIS_JWT_SECRET','MAVIS_RUNNER_SERVICE_KEY','MAVIS_WORKER_SERVICE_KEY','MAVIS_WORKER_GRANT_KEY')) {
    if (-not $values[$name] -or $values[$name] -match '^<|jdbc:postgresql://<') { throw "Missing real setting: $name. Local secrets are intentionally not included in a Git clone." }
}
if ($values.MAVIS_DB_URL -notmatch '^jdbc:postgresql://') { throw 'MAVIS_DB_URL must be a JDBC PostgreSQL URL.' }
foreach ($name in @('MAVIS_JWT_SECRET','MAVIS_WORKER_GRANT_KEY')) { if ($values[$name].Length -lt 32) { throw "$name must be at least 32 characters." } }
function Read-Port([string]$Name,[int]$Default) {
    if (-not $values[$Name]) { return $Default }
    $number=0
    if (-not [int]::TryParse($values[$Name],[ref]$number) -or $number -lt 1 -or $number -gt 65535) { throw "Invalid port setting: $Name" }
    return $number
}
$javaPort=Read-Port 'MAVIS_JAVA_PORT' 8081
$workerPort=Read-Port 'MAVIS_WORKER_PORT' 5082
$fePort=Read-Port 'MAVIS_FE_PORT' 3000
$logs=Join-Path $repo '.artifacts\local-run'
$dataRoot=if($values.MAVIS_DATA_ROOT){$values.MAVIS_DATA_ROOT}else{Join-Path $repo '.artifacts\dev-storage'}
$uploads=Join-Path $dataRoot 'uploads'
$artifacts=Join-Path $dataRoot 'worker-artifacts' 
$null=New-Item -ItemType Directory -Force -Path $logs,$uploads,$artifacts
$environment=@{}
foreach($entry in $values.GetEnumerator()) { if ($entry.Key -match '^(MAVIS_|MAIL_)' -or $entry.Key -in @('DOTNET_CLI_HOME','NUGET_PACKAGES')) { $environment[$entry.Key]=$entry.Value } }
$environment.SPRING_PROFILES_ACTIVE='cloud'
if ($values.MAVIS_GOOGLE_CLIENT_ID) { $environment.APP_GOOGLE_CLIENT_ID=$values.MAVIS_GOOGLE_CLIENT_ID }
$environment.SERVER_PORT=[string]$javaPort
$environment.MAVIS_DB_MIGRATIONS_ENABLED='false'
$environment.MAVIS_WORKER_ENABLED='true'
$environment.MAVIS_WORKER_DOTNET_URL="http://127.0.0.1:$workerPort"
$environment.MAVIS_WORKER_GRANT_KEY_ID=if($values.MAVIS_WORKER_GRANT_KEY_ID){$values.MAVIS_WORKER_GRANT_KEY_ID}else{'local'}
$environment.MAVIS_WORKER_SNAPSHOT_ROOT=$uploads
$environment.MAVIS_WORKER_ARTIFACT_ROOT=$artifacts
$environment.MAVIS_STORAGE_UPLOAD_DIR=$uploads
$environment.SPRING_JPA_SHOW_SQL='false'
$environment.WorkerAccess__ApiKey=$values.MAVIS_WORKER_SERVICE_KEY
$environment.ArtifactScope__Root=$artifacts
$environment["ArtifactScope__GrantKeys__$($environment.MAVIS_WORKER_GRANT_KEY_ID)"]=$values.MAVIS_WORKER_GRANT_KEY
$environment.ASPNETCORE_ENVIRONMENT='Development'
$environment.ASPNETCORE_URLS="http://127.0.0.1:$workerPort"
$environment.MAVIS_NEXT_DIST_DIR=if($values.MAVIS_NEXT_DIST_DIR){$values.MAVIS_NEXT_DIST_DIR}else{'.artifacts/next-local'}
$environment.MAVIS_API_MODE='backend'
$environment.MAVIS_JAVA_URL="http://127.0.0.1:$javaPort"
$toolPaths=@()
if ($values.MAVIS_JAVA_HOME) {
    if (-not (Test-Path -LiteralPath (Join-Path $values.MAVIS_JAVA_HOME 'bin\java.exe'))) { throw 'MAVIS_JAVA_HOME must contain bin\java.exe (JDK 21).' }
    $environment.JAVA_HOME=$values.MAVIS_JAVA_HOME
    $toolPaths+=Join-Path $values.MAVIS_JAVA_HOME 'bin'
}
if ($values.MAVIS_DOTNET_ROOT) {
    if (-not (Test-Path -LiteralPath (Join-Path $values.MAVIS_DOTNET_ROOT 'dotnet.exe'))) { throw 'MAVIS_DOTNET_ROOT must contain dotnet.exe (see MAVIS.Worker/global.json).' }
    $environment.DOTNET_ROOT=$values.MAVIS_DOTNET_ROOT
    $toolPaths+=$values.MAVIS_DOTNET_ROOT
}
if ($toolPaths.Count) { $environment.PATH=(@($toolPaths)+@($env:PATH)) -join [IO.Path]::PathSeparator }
function Is-Listening([int]$Port) { return [bool](Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue) }
function Start-Hidden([string]$Name,[string]$File,[string[]]$Arguments,[string]$Directory) {
    $process=Start-Process -FilePath $File -ArgumentList $Arguments -WorkingDirectory $Directory -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logs "$Name.log") -RedirectStandardError (Join-Path $logs "$Name-error.log")
    @{name=$Name;pid=$process.Id;directory=$Directory} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $logs "$Name-process.json")
    Write-Host "$Name started (PID $($process.Id))."
}
$previous=@{}
try {
    foreach($entry in $environment.GetEnumerator()) { $previous[$entry.Key]=[Environment]::GetEnvironmentVariable($entry.Key,'Process'); [Environment]::SetEnvironmentVariable($entry.Key,$entry.Value,'Process') }
    if ($Service -in @('All','Java')) {
        if (Is-Listening $javaPort) { Write-Host "Java port $javaPort already in use; leaving the running service unchanged." }
        else {
            $java=if($env:JAVA_HOME -and (Test-Path -LiteralPath (Join-Path $env:JAVA_HOME 'bin\java.exe'))){Join-Path $env:JAVA_HOME 'bin\java.exe'}else{(Get-Command java.exe -ErrorAction Stop).Source}
            $be=Join-Path $repo 'MAVIS-Platform\mavis-be'
            $jar=Join-Path $be 'mavis-bootstrap\target\mavis-bootstrap-0.0.1-SNAPSHOT.jar'
            if ($Build -or -not (Test-Path -LiteralPath $jar)) { Push-Location $be; try { & '.\mvnw.cmd' '-DskipTests' 'package'; if ($LASTEXITCODE -ne 0) { throw 'Java build failed.' } } finally { Pop-Location } }
            Start-Hidden 'java' $java @('-jar',('"'+$jar+'"')) $be
        }
    }
    if ($Service -in @('All','Worker')) {
        if (Is-Listening $workerPort) { Write-Host "Worker port $workerPort already in use; leaving the running service unchanged." }
        else {
            $dotnet=(Get-Command dotnet.exe -ErrorAction Stop).Source
            $project=Join-Path $repo 'MAVIS.Worker\src\MAVIS.Worker.Api\MAVIS.Worker.Api.csproj'
            $workerArguments=@('run','--project',('"'+$project+'"'),'--no-launch-profile')
            $binary=Join-Path $repo 'MAVIS.Worker\src\MAVIS.Worker.Api\bin\Debug\net10.0\MAVIS.Worker.Api.dll'
            if ((Test-Path -LiteralPath $binary) -and -not $Build) { $workerArguments+='--no-build' }
            Start-Hidden 'worker' $dotnet $workerArguments $repo
        }
    }
    if ($Service -in @('All','Frontend')) {
        if (Is-Listening $fePort) { Write-Host "FE port $fePort already in use; leaving the running service unchanged." }
        else {
            $node=(Get-Command node.exe -ErrorAction Stop).Source
            $fe=Join-Path $repo 'MAVIS-Frontend'
            if (-not (Test-Path -LiteralPath (Join-Path $fe 'node_modules\next\dist\bin\next'))) { Push-Location $fe; try { & npm.cmd ci --no-audit --no-fund; if ($LASTEXITCODE -ne 0) { throw 'FE dependency install failed.' } } finally { Pop-Location } }
            Start-Hidden 'frontend' $node @(('"'+(Join-Path $fe 'node_modules\next\dist\bin\next')+'"'),'dev','--hostname','127.0.0.1','--port',[string]$fePort) $fe
        }
    }
} finally { foreach($entry in $previous.GetEnumerator()) { [Environment]::SetEnvironmentVariable($entry.Key,$entry.Value,'Process') } }
if ($Service -eq 'Check') {
    foreach ($probe in @(@('Java',"http://127.0.0.1:$javaPort/v3/api-docs"),@('Worker',"http://127.0.0.1:$workerPort/api/health/ready"),@('FE',"http://127.0.0.1:$fePort/login"))) {
        try { $response=Invoke-WebRequest $probe[1] -UseBasicParsing -TimeoutSec 10; Write-Host "$($probe[0]): HTTP $($response.StatusCode)" } catch { Write-Host "$($probe[0]): unavailable; inspect .artifacts/local-run logs." }
    }
    try { $spec=Invoke-RestMethod "http://127.0.0.1:$javaPort/v3/api-docs" -TimeoutSec 10; if (-not $spec.paths.'/api/v1/auth/me') { Write-Warning 'Java is older than the integrated FE: /auth/me is missing. Pull matching source and rebuild Java.' } } catch {}
} else {
    Write-Host "Starting services. Check logs in .artifacts/local-run, then run ./scripts/Start-Mavis.ps1 -Service Check."
}
Write-Host "FE: http://127.0.0.1:$fePort/login | Java: http://127.0.0.1:$javaPort/swagger-ui/index.html | Worker: http://127.0.0.1:$workerPort/swagger"

if ($WaitReady) {
    $probes=@()
    if ($Service -in @('All','Java')) { $probes+=,@('Java',"http://127.0.0.1:$javaPort/v3/api-docs") }
    if ($Service -in @('All','Worker')) { $probes+=,@('Worker',"http://127.0.0.1:$workerPort/api/health/ready") }
    if ($Service -in @('All','Frontend')) { $probes+=,@('FE',"http://127.0.0.1:$fePort/login") }
    foreach($probe in $probes) {
        Write-Host "Waiting for $($probe[0])..."
        $ready=$false
        for($attempt=0;$attempt -lt 120;$attempt++) {
            try { $null=Invoke-WebRequest $probe[1] -UseBasicParsing -TimeoutSec 30; $ready=$true; break } catch { Start-Sleep -Seconds 1 }
        }
        if (-not $ready) { throw "$($probe[0]) failed to become ready. Inspect .artifacts/local-run/$($probe[0].ToLower())*.log." }
        Write-Host "$($probe[0]) ready."
    }
}
if ($OpenBrowser) { Start-Process "http://127.0.0.1:$fePort/login" }
