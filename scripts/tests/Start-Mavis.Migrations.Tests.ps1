$ErrorActionPreference='Stop'
$repo=Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$launcher=Join-Path $repo 'scripts/Start-Mavis.ps1'
# Execute the actual environment/migration block, with test settings only.
$tokens=$null; $errors=$null
$ast=[Management.Automation.Language.Parser]::ParseFile($launcher,[ref]$tokens,[ref]$errors)
if ($errors.Count) { throw 'Launcher contains parse errors.' }
$statements=$ast.EndBlock.Statements
$start=@($statements | Where-Object { $_.Extent.Text -eq '$environment=@{}' })[0].Extent.StartOffset
$end=@($statements | Where-Object { $_.Extent.Text.StartsWith("`$environment.MAVIS_WORKER_ENABLED=") })[0].Extent.StartOffset
$block=[scriptblock]::Create($ast.Extent.Text.Substring($start,$end-$start))
foreach ($setting in @($null,'false')) {
    $values=@{}
    if ($setting) { $values.MAVIS_DB_MIGRATIONS_ENABLED=$setting }
    . $block
    if ($environment.MAVIS_DB_MIGRATIONS_ENABLED -ne 'false') { throw 'Shared DB migration default changed.' }
}
$values=@{MAVIS_DB_MIGRATIONS_ENABLED='true'}
. $block
if ($environment.MAVIS_DB_MIGRATIONS_ENABLED -ne 'true') { throw 'Explicit migration setting was overwritten.' }
# Test a conflicting checkout using an isolated filesystem fixture, never a database.
$originalRepo=$repo
$repo=Join-Path $repo ('.artifacts/migration-tests/' + [guid]::NewGuid().ToString('N'))
$fixture=Join-Path $repo 'MAVIS-Platform/mavis-be/mavis-bootstrap/src/main/resources/db/migration'
$null=New-Item -ItemType Directory -Path $fixture -Force
Set-Content (Join-Path $fixture 'V10__First.sql') '-- fixture'
Set-Content (Join-Path $fixture 'V10__Second.sql') '-- fixture'
$caught=$false
try { . $block } catch {
    if ($_.Exception.Message -notmatch 'Duplicate Flyway versions') { throw }
    $caught=$true
}
if (-not $caught) { throw 'Duplicate migrations must fail before launching Java.' }
$repo=$originalRepo
$values=@{MAVIS_DB_MIGRATIONS_ENABLED='invalid'}
$caught=$false
try { . $block } catch {
    if ($_.Exception.Message -notmatch 'must be true or false') { throw }
    $caught=$true
}
if (-not $caught) { throw 'Invalid migration setting was accepted.' }
Write-Output 'PASS: migration default, explicit override, duplicate preflight and invalid setting; no database connections.'
