$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath($env:TSUKA_ROOT)
Set-Location -LiteralPath $root
$logs = Join-Path $root 'logs'
New-Item -ItemType Directory -Force -Path $logs | Out-Null
$log = Join-Path $logs 'launcher.log'
function Log([string]$message) {
  $line = "[$(Get-Date -Format o)] $message"
  Write-Host $line
  Add-Content -LiteralPath $log -Value $line -Encoding UTF8
}
function Healthy([int]$port) {
  try {
    $r = Invoke-RestMethod -Uri "http://127.0.0.1:$port/health" -TimeoutSec 2
    return ($r.service -eq 'tsukamiyora-core' -and $r.status -eq 'ok')
  } catch { return $false }
}
function Find-Node {
  $portable = Join-Path $root '.runtime\node\node.exe'
  if (Test-Path -LiteralPath $portable) { return $portable }
  $cmd = Get-Command node.exe -ErrorAction SilentlyContinue
  if ($cmd) {
    $v = & $cmd.Source -p 'process.versions.node'
    if ($LASTEXITCODE -eq 0 -and [version]$v -ge [version]'22.13.0') { return $cmd.Source }
  }
  Log 'Installing portable Node.js from official nodejs.org distribution'
  $index = Invoke-RestMethod -Uri 'https://nodejs.org/dist/index.json' -TimeoutSec 25
  $release = $index | Where-Object { $_.lts -and $_.lts -ne $false -and ([version]$_.version.TrimStart('v') -ge [version]'22.13.0') -and ($_.files -contains 'win-x64-zip') } | Select-Object -First 1
  if (-not $release) { throw 'No compatible Windows x64 LTS Node.js release found' }
  $version = $release.version
  $filename = "node-$version-win-x64.zip"
  $base = "https://nodejs.org/dist/$version"
  $temp = Join-Path $root '.runtime\download'
  New-Item -ItemType Directory -Force -Path $temp | Out-Null
  $zip = Join-Path $temp $filename
  Invoke-WebRequest -Uri "$base/$filename" -OutFile $zip -TimeoutSec 180 -UseBasicParsing
  $sums = (Invoke-WebRequest -Uri "$base/SHASUMS256.txt" -TimeoutSec 25 -UseBasicParsing).Content
  $entry = ($sums -split "`n" | Where-Object { $_ -match ("^([0-9a-fA-F]{64})\s+" + [regex]::Escape($filename) + "$") } | Select-Object -First 1)
  if (-not $entry) { throw 'SHA256 entry not found for downloaded Node.js' }
  $expected = ($entry -split '\s+')[0].ToLowerInvariant()
  $actual = (Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($expected -ne $actual) { throw 'Node.js archive SHA256 mismatch' }
  $stage = Join-Path $temp 'extract'
  if (Test-Path -LiteralPath $stage) { Remove-Item -LiteralPath $stage -Recurse -Force }
  Expand-Archive -LiteralPath $zip -DestinationPath $stage -Force
  $source = Join-Path $stage "node-$version-win-x64"
  $target = Join-Path $root '.runtime\node'
  if (Test-Path -LiteralPath $target) { Remove-Item -LiteralPath $target -Recurse -Force }
  Move-Item -LiteralPath $source -Destination $target
  return (Join-Path $target 'node.exe')
}
$mutex = New-Object System.Threading.Mutex($false, 'Local\TsukamiyoraCoreLauncher')
$locked = $false
try {
  $locked = $mutex.WaitOne(0)
  if (-not $locked) { Log 'Another launcher is already starting. Wait and retry.'; exit 0 }
  $node = Find-Node
  $version = (& $node -p 'process.versions.node').Trim()
  if ($LASTEXITCODE -ne 0 -or [version]$version -lt [version]'22.13.0') { throw "Node.js 22.13+ required, found $version" }
  $npm = Join-Path (Split-Path -Parent $node) 'npm.cmd'
  if (-not (Test-Path -LiteralPath $npm)) {
    $npmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue
    if ($npmCommand) { $npm = $npmCommand.Source }
    else { throw 'npm.cmd missing; install full Node.js distribution' }
  }
  if (-not (Test-Path -LiteralPath (Join-Path $root 'node_modules\\fastify'))) {
    Log 'Installing npm dependencies'
    & $npm install --no-audit --no-fund --prefix $root
    if ($LASTEXITCODE -ne 0) { throw 'npm install failed' }
  }
  $port = 4177
  if ($env:TSUKAMIYORA_PORT) {
    $port = [int]$env:TSUKAMIYORA_PORT
    if ($port -lt 1 -or $port -gt 65535) { throw 'Invalid TSUKAMIYORA_PORT' }
  }
  $explicit = [bool]$env:TSUKAMIYORA_PORT
  if (Healthy $port) {
    Log "Existing server healthy on port $port"
    Start-Process "http://127.0.0.1:$port/"
    exit 0
  }
  if (-not $explicit) {
    foreach ($candidate in 4178..4277) {
      if (Healthy $candidate) {
        Log "Existing Tsukamiyora instance found on port $candidate"
        Start-Process "http://127.0.0.1:$candidate/"
        exit 0
      }
    }
  }
  $used = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty LocalPort
  if ($port -in $used) {
    if ($explicit) { throw "Requested port $port is occupied" }
    $free = 4178..4277 | Where-Object { $_ -notin $used } | Select-Object -First 1
    if (-not $free) { throw 'No free port in range 4177-4277' }
    $port = $free
  }
  $env:TSUKAMIYORA_PORT = [string]$port
  $server = Join-Path $root 'src\supervisor.js'
  if (-not (Test-Path -LiteralPath $server)) { throw 'Missing src\supervisor.js' }
  Log "Starting Node.js $version, port $port"
  $proc = Start-Process -FilePath $node -ArgumentList @($server) -WorkingDirectory $root -PassThru -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logs 'server-stdout.log') -RedirectStandardError (Join-Path $logs 'server-stderr.log')
  Log "Server PID=$($proc.Id)"
  $ready = $false
  for ($i=0; $i -lt 30; $i++) {
    Start-Sleep -Milliseconds 500
    if (Healthy $port) { $ready = $true; break }
    if ($proc.HasExited) { break }
  }
  if (-not $ready) { throw 'Server failed health check; inspect logs/server-stderr.log' }
  Log 'Health check passed'
  Start-Process "http://127.0.0.1:$port/"
  exit 0
} catch {
  Log "ERROR: $($_.Exception.Message)"
  exit 1
} finally {
  if ($locked) { $mutex.ReleaseMutex() }
  $mutex.Dispose()
}
