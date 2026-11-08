$ErrorActionPreference = 'Stop'
$root = [System.IO.Path]::GetFullPath($env:TSUKA_ROOT)
Set-Location -LiteralPath $root
$logs = Join-Path $root 'logs'
New-Item -ItemType Directory -Force -Path $logs | Out-Null
$log = Join-Path $logs 'launcher.log'
function Write-Log([string]$message) {
  $line = "[$(Get-Date -Format o)] $message"
  Write-Host $line
  Add-Content -LiteralPath $log -Value $line -Encoding UTF8
}
function Test-Health([int]$port) {
  try {
    $r = Invoke-RestMethod -Uri "http://127.0.0.1:$port/health" -TimeoutSec 2 -ErrorAction Stop
    return ($r.service -eq 'tsukamiyora-core' -and $r.status -eq 'ok')
  } catch { return $false }
}
try {
  $port = 4177
  if ($env:TSUKAMIYORA_PORT) {
    $port = [int]$env:TSUKAMIYORA_PORT
  }
  if ($port -lt 1 -or $port -gt 65535) { throw 'Invalid TSUKAMIYORA_PORT' }
  $node = Join-Path $root '.runtime\node\node.exe'
  if (-not (Test-Path -LiteralPath $node)) {
    $cmd = Get-Command node.exe -ErrorAction SilentlyContinue
    if ($cmd) { $node = $cmd.Source }
    else { throw 'Node.js missing. Install Node.js 22.13+ or place node.exe in .runtime\node\' }
  }
  $version = & $node -p 'process.versions.node'
  if ($LASTEXITCODE -ne 0) { throw 'Unable to run Node.js' }
  $parts = $version.Trim().Split('.')
  if ([int]$parts[0] -lt 22 -or ([int]$parts[0] -eq 22 -and [int]$parts[1] -lt 13)) { throw "Node.js 22.13+ required; found $version" }
  Write-Log "Node.js $version; root=$root; port=$port"
  if (Test-Health $port) {
    Write-Log 'Existing Tsukamiyora server detected. Opening browser.'
    Start-Process "http://127.0.0.1:$port/"
    exit 0
  }
  $listener = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  if ($listener) { throw "Port $port is occupied by another service. Set TSUKAMIYORA_PORT to a free port." }
  $env:TSUKAMIYORA_PORT = [string]$port
  $server = Join-Path $root 'src\server.js'
  if (-not (Test-Path -LiteralPath $server)) { throw 'Missing src\server.js' }
  $proc = Start-Process -FilePath $node -ArgumentList @($server) -WorkingDirectory $root -PassThru -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logs 'server-stdout.log') -RedirectStandardError (Join-Path $logs 'server-stderr.log')
  Write-Log "Started server PID=$($proc.Id)"
  $ready = $false
  for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Milliseconds 500
    if (Test-Health $port) { $ready = $true; break }
    if ($proc.HasExited) { break }
  }
  if (-not $ready) { throw 'Server did not become healthy within 15 seconds. Check logs\server-stderr.log' }
  Write-Log 'Health check passed. Opening browser.'
  Start-Process "http://127.0.0.1:$port/"
  exit 0
} catch {
  Write-Log "ERROR: $($_.Exception.Message)"
  exit 1
}
