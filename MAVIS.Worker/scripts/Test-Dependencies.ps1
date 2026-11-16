#requires -Version 7.0
param()
$ErrorActionPreference = 'Stop'
$workerRoot = Split-Path $PSScriptRoot -Parent
$artifactRoot = Join-Path $workerRoot '.artifacts'
New-Item -ItemType Directory -Force $artifactRoot | Out-Null
Push-Location $workerRoot
try {
    $content = & dotnet list MAVIS.Worker.slnx package --vulnerable --include-transitive --format json
    if ($LASTEXITCODE -ne 0) { throw 'NuGet vulnerability query failed; audit is inconclusive.' }
    $report = ($content -join "`n") | ConvertFrom-Json
    if (!$report.projects -or @($report.logs | Where-Object { $_.level -in @('Warning','Error') }).Count -gt 0) {
        throw 'NuGet returned no projects or diagnostic warnings/errors; audit is inconclusive.'
    }
    [IO.File]::WriteAllText((Join-Path $artifactRoot 'dependency-audit.json'),($report | ConvertTo-Json -Depth 30)+"`r`n",[Text.UTF8Encoding]::new($false))
    $vulnerable = @()
    foreach ($project in $report.projects) {
        foreach ($framework in $project.frameworks) {
            foreach ($package in @($framework.topLevelPackages) + @($framework.transitivePackages)) {
                if ($package -and $package.vulnerabilities) { $vulnerable += $package.id }
            }
        }
    }
    if ($vulnerable.Count -gt 0) { throw ('Vulnerable NuGet packages reported: ' + (($vulnerable | Sort-Object -Unique) -join ', ')) }
    Write-Output "NuGet audit: $(@($report.projects).Count) projects queried, no known vulnerable packages reported (including transitive)."
} finally { Pop-Location }
