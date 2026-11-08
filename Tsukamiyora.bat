@echo off
setlocal DisableDelayedExpansion
set "TSUKA_ROOT=%~dp0"
echo Tsukamiyora - checking local website and starting services...
echo If the browser does not open, see Tsukamiyora.url or logs\launcher.log
echo.
if not exist "%TSUKA_ROOT%scripts\launch.ps1" (
  echo [ERROR] Launcher script missing: scripts\launch.ps1
  if not defined CI pause
  exit /b 1
)
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%TSUKA_ROOT%scripts\launch.ps1"
set "TSUKA_EXIT=%ERRORLEVEL%"
if not "%TSUKA_EXIT%"=="0" (
  echo.
  echo [ERROR] Startup failed. See logs\launcher.log
  if not defined CI pause
)
exit /b %TSUKA_EXIT%
