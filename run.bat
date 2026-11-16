@echo off
setlocal
cd /d "%~dp0"
title MAVIS - Java + Worker + Frontend
if /i "%~1"=="--check" goto check
if not "%~1"=="" goto usage
where powershell.exe >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Windows PowerShell is required but was not found.
  goto failed
)
if not exist "%~dp0scripts\Start-Mavis.ps1" (
  echo [ERROR] scripts\Start-Mavis.ps1 is missing. Pull the complete repository.
  goto failed
)
if not exist "%~dp0.env.backend.local" (
  powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Start-Mavis.ps1" -Initialize
  if errorlevel 1 goto failed
  echo.
  echo [SETUP] Open .env.backend.local and fill the database URL, user and password.
  echo Then double-click run.bat again. Service keys have been generated automatically.
  goto finished
)
echo Starting Java backend, C# Worker and the latest frontend source...
echo First startup can take several minutes while dependencies are built.
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Start-Mavis.ps1" -Service All -Build -WaitReady -OpenBrowser
if errorlevel 1 goto failed
echo.
echo [OK] All three services are ready. They continue running after this window closes.
goto finished
:check
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Start-Mavis.ps1" -Service Check
exit /b %errorlevel%
:usage
echo Usage: run.bat          Start Java, Worker and FE.
echo        run.bat --check  Check existing services without restarting.
exit /b 2
:failed
echo.
echo [ERROR] MAVIS could not start. Read the error above and .artifacts\local-run logs.
if not defined MAVIS_RUN_NO_PAUSE pause
exit /b 1
:finished
if not defined MAVIS_RUN_NO_PAUSE pause
exit /b 0
