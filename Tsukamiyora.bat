@echo off
setlocal DisableDelayedExpansion
cd /d "%~dp0"
if errorlevel 1 (
  echo [ERROR] Cannot access project directory.
  pause
  exit /b 1
)
where node.exe >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js 22.13 or newer is required.
  echo Install Node.js LTS and run this file again.
  pause
  exit /b 1
)
node -e "const v=process.versions.node.split('.').map(Number);process.exit(v[0]>22||(v[0]===22&&v[1]>=13)?0:1)"
if errorlevel 1 (
  echo [ERROR] Node.js 22.13 or newer is required.
  node --version
  pause
  exit /b 1
)
echo Starting Tsukamiyora Core...
node src\server.js
echo.
echo Core stopped. Check logs\core.jsonl for details.
pause
