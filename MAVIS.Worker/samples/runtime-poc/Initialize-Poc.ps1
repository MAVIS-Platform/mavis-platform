#requires -Version 7.0
param()
$ErrorActionPreference = 'Stop'
$artifactRoot = Join-Path $PSScriptRoot 'artifacts'
New-Item -ItemType Directory -Force -Path $artifactRoot | Out-Null
$workerRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$runtime = 'mcr.microsoft.com/dotnet/aspnet@sha256:1601380775673021a23ea5985669f1daf03719faaa684f839da1752fb48cfc7f'
$runnerRuntime = 'mcr.microsoft.com/dotnet/aspnet@sha256:d5633778c754e89a386882eddf8dbee6942447a8a4b8267c19cf1e1158d0b0ac'
$collector = 'otel/opentelemetry-collector-contrib@sha256:1175b03003053962012f5a231f5567f66a3e8fdb960c7835c0e48f7aa1555806'

function Invoke-Checked([string]$Command, [string[]]$Arguments) {
    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Command failed with exit code $LASTEXITCODE" }
}

if ((& docker info --format '{{.OSType}}').Trim() -ne 'linux') { throw 'Docker Linux Engine is required.' }
Invoke-Checked docker @('pull', $runtime)
Invoke-Checked docker @('pull', $collector)
Invoke-Checked docker @('pull', $runnerRuntime)
foreach ($sample in @('orders','catalog','route-controller')) {
    $project = switch ($sample) { 'orders' { 'Orders.csproj' } 'catalog' { 'Catalog.csproj' } 'route-controller' { 'RouteController.csproj' } }
    $directory = Join-Path $PSScriptRoot $sample
    Invoke-Checked dotnet @('publish',(Join-Path $directory $project),'-c','Release','-p:UseAppHost=false','-o',(Join-Path $directory 'publish'),'--verbosity','minimal')
    Invoke-Checked docker @('build','--quiet','--build-arg',"RUNTIME_IMAGE=$runtime",'-t',"mavis-poc-${sample}:1",$directory)
}
foreach ($sample in @('payment','gateway')) {
    Invoke-Checked docker @('build','--quiet','-t',"mavis-poc-${sample}:1",(Join-Path $PSScriptRoot $sample))
}
Invoke-Checked dotnet @('publish',(Join-Path $workerRoot 'src/MAVIS.Runner/MAVIS.Runner.csproj'),'-c','Release','-p:UseAppHost=false','-o',(Join-Path $artifactRoot 'runner-publish'),'--verbosity','minimal')
Invoke-Checked docker @('build','--quiet','--file',(Join-Path $PSScriptRoot 'Runner.Dockerfile'),'--build-arg',"RUNTIME_IMAGE=$runnerRuntime",'-t','mavis-poc-runner:1',$PSScriptRoot)

$agents = @(
    @{name='dotnet.zip';url='https://github.com/open-telemetry/opentelemetry-dotnet-instrumentation/releases/download/v1.17.0/opentelemetry-dotnet-instrumentation-linux-glibc-x64.zip';sha='cc56878f0155e28b6554924fbd420fcb8bec7108cd9d41836dc530764ac923f8'},
    @{name='opentelemetry-javaagent.jar';url='https://github.com/open-telemetry/opentelemetry-java-instrumentation/releases/download/v2.32.0/opentelemetry-javaagent.jar';sha='f787eb6c7f3d18e69a431e108a15278d25ee37f83d68b678f621e063f3988f82'}
)
foreach ($agent in $agents) {
    $path = Join-Path $artifactRoot $agent.name
    if (!(Test-Path -LiteralPath $path) -or (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash -ine $agent.sha) {
        Invoke-WebRequest -Uri $agent.url -OutFile $path
    }
    if ((Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash -ine $agent.sha) { throw 'OpenTelemetry artifact checksum mismatch.' }
}
$bundle = Join-Path $artifactRoot 'bundle'
New-Item -ItemType Directory -Force -Path (Join-Path $bundle 'dotnet'),(Join-Path $bundle 'java') | Out-Null
Expand-Archive -LiteralPath (Join-Path $artifactRoot 'dotnet.zip') -DestinationPath (Join-Path $bundle 'dotnet') -Force
Copy-Item -LiteralPath (Join-Path $artifactRoot 'opentelemetry-javaagent.jar') -Destination (Join-Path $bundle 'java/opentelemetry-javaagent.jar')
$volumeFile = Join-Path $artifactRoot 'agent-volume.txt'
$volume = if (Test-Path -LiteralPath $volumeFile) { [IO.File]::ReadAllText($volumeFile).Trim() } else { '' }
if ($volume -notmatch '^mavis-poc-agents-[a-f0-9]{8}$') { $volume = '' }
if ($volume) {
    $labels = & docker volume inspect --format '{{json .Labels}}' $volume 2>$null
    if ($LASTEXITCODE -ne 0 -or !($labels -match '1.17.0') -or !($labels -match '2.32.0')) { $volume = '' }
}
if (!$volume) {
    $volume = 'mavis-poc-agents-' + [Guid]::NewGuid().ToString('N').Substring(0,8)
    Invoke-Checked docker @('volume','create','--label','mavis.poc.managed=true','--label','mavis.dotnet.version=1.17.0','--label','mavis.java.version=2.32.0',$volume)
    Invoke-Checked docker @('run','--rm','--network','none','--cap-drop','ALL','--security-opt','no-new-privileges:true','--read-only','--volume',"${bundle}:/bundle:ro",'--volume',"${volume}:/agents",'--entrypoint','/bin/sh',$runtime,'-c','cp -R /bundle/. /agents/')
    [IO.File]::WriteAllText($volumeFile,$volume)
}
$images = @{}
foreach ($sample in @('orders','payment','catalog','gateway','runner','route-controller')) {
    $images[$sample] = (& docker image inspect --format '{{.Id}}' "mavis-poc-${sample}:1").Trim()
    if ($LASTEXITCODE -ne 0) { throw 'Missing PoC image.' }
}
Invoke-Checked docker @('run','--rm','--network','none','--cap-drop','ALL','--security-opt','no-new-privileges:true','--volume',"$(Join-Path $PSScriptRoot 'collector.yaml'):/etc/collector.yaml:ro",$collector,'validate','--config=/etc/collector.yaml')
$manifest = @{images=$images;collectorImage=$collector;runtimeImage=$runtime;runnerRuntimeImage=$runnerRuntime;instrumentationVolume=$volume;dotnetAgent='1.17.0';javaAgent='2.32.0';agentChecksums=$agents | Select-Object name,sha}
[IO.File]::WriteAllText((Join-Path $artifactRoot 'manifest.json'),($manifest|ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false))
Write-Output 'PoC initialized. Images and agent bundle are reusable profile artifacts, not per-session resources.'
