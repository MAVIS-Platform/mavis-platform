#requires -Version 7.0
param([switch]$Database, [string]$TestFilter = '')
$ErrorActionPreference = 'Stop'
$workerRoot = Split-Path $PSScriptRoot -Parent
$repoRoot = Split-Path $workerRoot -Parent
$publish = Join-Path $workerRoot '.artifacts/worker-publish'
if (!(Test-Path -LiteralPath (Join-Path $publish 'MAVIS.Worker.Api.dll'))) { throw 'Publish the Worker API into .artifacts/worker-publish first.' }
$shared = Join-Path $workerRoot '.artifacts/java-worker-shared'
$cache = Join-Path $workerRoot '.artifacts/integration-m2'
New-Item -ItemType Directory -Force $shared,$cache | Out-Null
$suffix = [Guid]::NewGuid().ToString('N')
$network = "mavis-static-it-$suffix"
$worker = "mavis-worker-it-$suffix"
$java = "mavis-java-it-$suffix"
$postgres = "mavis-db-it-$suffix"
function Checked([string]$Command, [string[]]$Arguments) {
    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Command failed ($LASTEXITCODE)" }
}
try {
    Checked docker @('network','create',$network)
    Checked docker @('run','-d','--name',$worker,'--network',$network,'--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--memory','768m','--cpus','2','--tmpfs','/tmp:rw,noexec,size=64m',
        '-e','ASPNETCORE_HTTP_PORTS=8080','-e','WorkerAccess__ApiKey=test-service-key','-e','ArtifactScope__Root=/artifacts','-e','ArtifactScope__GrantKeys__test=fixture-only-not-for-production-32-byte-key',
        '--mount',"type=bind,source=$shared,target=/artifacts,readonly",'--mount',"type=bind,source=$publish,target=/app,readonly",'--workdir','/app','--user','1654','--entrypoint','dotnet',
        'mcr.microsoft.com/dotnet/aspnet@sha256:d5633778c754e89a386882eddf8dbee6942447a8a4b8267c19cf1e1158d0b0ac','MAVIS.Worker.Api.dll')
    $tests = 'ClientContractTest,LiveWorkerIntegrationTest,DotnetWorkerClientServiceImplTest,WorkerOrchestrationTest,GraphBuilderServiceTest,ServiceBindingIndexTest,CrossLanguageServiceLinkerTest,JobAnalysisStateTest'
    $dbArgs = @()
    if ($Database) {
        Checked docker @('run','-d','--name',$postgres,'--network',$network,'--memory','512m','--cpus','1','-e','POSTGRES_DB=mavis_it','-e','POSTGRES_USER=mavis','-e','POSTGRES_PASSWORD=fixture-only-password','postgres@sha256:721873c34ceb9f8d8fc265984940dc982404c105f19ad51be9fdc5970a6080ea')
        $ready=$false
        for($i=0;$i -lt 40;$i++){ & docker exec $postgres pg_isready -U mavis -d mavis_it 2>$null | Out-Null; if($LASTEXITCODE -eq 0){$ready=$true;break}; Start-Sleep -Milliseconds 250 }
        if(!$ready){throw 'Integration DB readiness failed'}
        $tests += ',WorkerPublicationIntegrationTest,UploadWorkerApiIntegrationTest'
        $dbArgs = @('-e',"MAVIS_TEST_JDBC_URL=jdbc:postgresql://${postgres}:5432/mavis_it",'-e','MAVIS_TEST_JDBC_USER=mavis','-e','MAVIS_TEST_JDBC_PASSWORD=fixture-only-password')
    }
    if ($TestFilter) { $tests = $TestFilter }
    $command = @'
set -eu
mkdir -p /tmp/work/MAVIS.Worker/integration /tmp/work/MAVIS-Platform
cp -a /src/MAVIS.Worker/integration/java-client /tmp/work/MAVIS.Worker/integration/java-client
cp -a /src/MAVIS.Worker/contracts /tmp/work/MAVIS.Worker/contracts
cp -a /src/MAVIS-Platform/mavis-be /tmp/work/MAVIS-Platform/mavis-be
cd /tmp/work/MAVIS-Platform/mavis-be
mvn -B -ntp -Dmaven.repo.local=/m2 -pl mavis-analyzer -am test -Dsurefire.failIfNoSpecifiedTests=false "-Dtest=$MAVIS_IT_TESTS"
'@
    $dockerArgs = @('run','--rm','--name',$java,'--network',$network,'--entrypoint','sh','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--memory','2g','--cpus','2','--tmpfs','/tmp:rw,exec,size=2g',
        '-e',"MAVIS_WORKER_TEST_URL=http://${worker}:8080",'-e','MAVIS_WORKER_TEST_ARTIFACT_ROOT=/shared','-e',"MAVIS_IT_TESTS=$tests",'--mount',"type=bind,source=$repoRoot,target=/src,readonly",'--mount',"type=bind,source=$shared,target=/shared",'--mount',"type=bind,source=$cache,target=/m2")
    $dockerArgs += $dbArgs
    $dockerArgs += @('maven:3.9.9-eclipse-temurin-21','-c',$command)
    & docker @dockerArgs
    if($LASTEXITCODE -ne 0){throw 'Java/Worker integration tests failed'}
}
finally {
    & docker rm -f $java $worker 2>$null | Out-Null
    if($Database){& docker rm -f $postgres 2>$null | Out-Null}
    & docker network rm $network 2>$null | Out-Null
}
