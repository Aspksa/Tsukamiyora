@echo off
setlocal DisableDelayedExpansion
set "TSUKA_ROOT=%~dp0"
if not exist "%TSUKA_ROOT%scripts\launch.ps1" (
  echo [ERROR] Launcher script missing: scripts\launch.ps1
  pause
  exit /b 1
)
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%TSUKA_ROOT%scripts\launch.ps1"
set "TSUKA_EXIT=%ERRORLEVEL%"
if not "%TSUKA_EXIT%"=="0" (
  echo.
  echo [ERROR] Startup failed. See logs\launcher.log
  pause
)
exit /b %TSUKA_EXIT%
