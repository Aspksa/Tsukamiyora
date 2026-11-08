$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath($env:TSUKA_ROOT)
Set-Location -LiteralPath $root
# Stable, non-secret instance identifier avoids opening an unrelated old copy.
$rootIdText = $root.TrimEnd([char[]]@('\','/')).ToLowerInvariant()
$hashProvider = [Security.Cryptography.SHA256]::Create()
try { $instanceId = [BitConverter]::ToString($hashProvider.ComputeHash([Text.Encoding]::UTF8.GetBytes($rootIdText))).Replace('-','').ToLowerInvariant().Substring(0,16) }
finally { $hashProvider.Dispose() }
$env:TSUKAMIYORA_INSTANCE_ID = $instanceId
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
    return ($r.service -eq 'tsukamiyora-core' -and $r.status -eq 'ok' -and $r.instanceId -eq $instanceId)
  } catch { return $false }
}
function ChatReady([int]$port) {
  try {
    $r = Invoke-WebRequest -Uri "http://127.0.0.1:$port/chat" -UseBasicParsing -TimeoutSec 4
    return ($r.StatusCode -eq 200 -and $r.Content -match 'id="form"' -and $r.Content -match 'id="message"')
  } catch { return $false }
}
function OpenChat([int]$port) {
  $url = "http://127.0.0.1:$port/chat"
  Log "Open this address in your browser: $url"
  try {
    # A desktop shortcut remains usable if the browser association is broken.
    Set-Content -LiteralPath (Join-Path $root 'Открыть Tsukamiyora.url') -Value @('[InternetShortcut]',"URL=$url") -Encoding ASCII -ErrorAction Stop
  } catch { Log "Could not create browser shortcut: $($_.Exception.Message)" }
  if ($env:CI) { Log 'CI mode: browser launch skipped'; return }
  try {
    $startInfo = New-Object System.Diagnostics.ProcessStartInfo
    $startInfo.FileName = $url
    $startInfo.UseShellExecute = $true
    [System.Diagnostics.Process]::Start($startInfo) | Out-Null
    Log "Browser open requested: $url"
  } catch {
    Log "Default browser failed: $($_.Exception.Message); trying Explorer"
    try { Start-Process -FilePath 'explorer.exe' -ArgumentList $url -ErrorAction Stop; Log 'Explorer fallback requested' }
    catch { Log "Automatic browser opening failed: $($_.Exception.Message). Open $url manually" }
  }
}
function Find-Node {
  $portable = Join-Path $root '.runtime\node\node.exe'
  if (Test-Path -LiteralPath $portable) {
    try {
      $portableVersion = (& $portable -p 'process.versions.node').Trim()
      if ($LASTEXITCODE -eq 0 -and [version]$portableVersion -ge [version]'22.13.0') { return $portable }
      Log "Outdated portable Node.js: $portableVersion"
    } catch { Log 'Portable Node.js validation failed; searching another runtime' }
  }
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
  $entry = ($sums -split "`n" | ForEach-Object { $_.Trim() } | Where-Object { $_ -match ("^([0-9a-fA-F]{64})\s+" + [regex]::Escape($filename) + "$") } | Select-Object -First 1)
  if (-not $entry) { throw 'SHA256 entry not found for downloaded Node.js' }
  $expected = ($entry -split '\s+')[0].ToLowerInvariant()
  $actual = (Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($expected -ne $actual) { throw 'Node.js archive SHA256 mismatch' }
  $stage = Join-Path $temp 'extract'
  if (Test-Path -LiteralPath $stage) { Remove-Item -LiteralPath $stage -Recurse -Force }
  Expand-Archive -LiteralPath $zip -DestinationPath $stage -Force
  $source = Join-Path $stage "node-$version-win-x64"
  if (-not (Test-Path -LiteralPath (Join-Path $source 'node.exe'))) { throw 'Node.js archive layout invalid' }
  $target = Join-Path $root '.runtime\node'
  if (Test-Path -LiteralPath $target) { Remove-Item -LiteralPath $target -Recurse -Force }
  Move-Item -LiteralPath $source -Destination $target
  $installed = Join-Path $target 'node.exe'
  $installedVersion = (& $installed -p 'process.versions.node').Trim()
  if ($LASTEXITCODE -ne 0 -or [version]$installedVersion -lt [version]'22.13.0') { throw 'Downloaded Node.js failed runtime verification' }
  return $installed
}
$mutex = New-Object System.Threading.Mutex($false, 'Local\TsukamiyoraCoreLauncher')
$locked = $false
try {
  Log "Tsukamiyora startup | root=$root | instance=$instanceId"
  $locked = $mutex.WaitOne(0)
  if (-not $locked) { Log 'Another launcher is already starting. Wait and retry.'; exit 0 }
  $node = Find-Node
  $version = (& $node -p 'process.versions.node').Trim()
  if ($LASTEXITCODE -ne 0 -or [version]$version -lt [version]'22.13.0') { throw "Node.js 22.13+ required, found $version" }
  $port = 4177
  if ($env:TSUKAMIYORA_PORT) {
    $port = [int]$env:TSUKAMIYORA_PORT
    if ($port -lt 1 -or $port -gt 65535) { throw 'Invalid TSUKAMIYORA_PORT' }
  }
  $explicit = [bool]$env:TSUKAMIYORA_PORT
  if ((Healthy $port) -and (ChatReady $port)) {
    Log "Existing server and chat healthy on port $port"
    OpenChat $port
    exit 0
  }
  if (-not $explicit) {
    foreach ($candidate in 4178..4277) {
      if ((Healthy $candidate) -and (ChatReady $candidate)) {
        Log "Existing Tsukamiyora instance and chat found on port $candidate"
        OpenChat $candidate
        exit 0
      }
    }
  }
  $used = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty LocalPort)
  if ($port -in $used) {
    if ($explicit) { throw "Requested port $port is occupied" }
    $free = @(4178..4277 | Where-Object { $_ -notin $used } | Select-Object -First 1)[0]
    if (-not $free) { throw 'No free port in range 4177-4277' }
    $port = $free
  }
  # Invoke npm through the Node executable instead of npm.cmd: cmd.exe can
  # corrupt arguments containing %, !, ^, &, and parentheses on portable drives.
  $npmCli = Join-Path (Split-Path -Parent $node) 'node_modules\npm\bin\npm-cli.js'
  if (-not (Test-Path -LiteralPath $npmCli)) {
    $npmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue
    if ($npmCommand) {
      $npmCli = Join-Path (Split-Path -Parent $npmCommand.Source) 'node_modules\npm\bin\npm-cli.js'
    }
  }
  if ((-not (Test-Path -LiteralPath (Join-Path $root 'node_modules\\fastify'))) -or (-not (Test-Path -LiteralPath (Join-Path $root 'node_modules\\@fastify\\websocket')))) {
    if (-not (Test-Path -LiteralPath $npmCli)) { throw 'npm-cli.js not found; install a complete Node.js distribution' }
    Log 'Installing npm dependencies using node.exe (without cmd.exe)'
    $lockfile = Join-Path $root 'package-lock.json'
    if (Test-Path -LiteralPath $lockfile) {
      & $node $npmCli ci --no-audit --no-fund --ignore-scripts
    } else {
      & $node $npmCli install --no-package-lock --no-audit --no-fund --ignore-scripts
    }
    if ($LASTEXITCODE -ne 0) { throw 'npm install failed; see the output above' }
  }
  $env:TSUKAMIYORA_PORT = [string]$port
  $server = Join-Path $root 'src\supervisor.js'
  if (-not (Test-Path -LiteralPath $server)) { throw 'Missing src\supervisor.js' }
  Log "Starting Node.js $version, port $port"
  # Use a path relative to WorkingDirectory. Start-Process strips quoting from
  # a single absolute -ArgumentList path containing spaces and non-ASCII text.
  $proc = Start-Process -FilePath $node -ArgumentList 'src/supervisor.js' -WorkingDirectory $root -PassThru -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logs 'server-stdout.log') -RedirectStandardError (Join-Path $logs 'server-stderr.log')
  Log "Server PID=$($proc.Id)"
  $ready = $false
  for ($i=0; $i -lt 30; $i++) {
    Start-Sleep -Milliseconds 500
    if ((Healthy $port) -and (ChatReady $port)) { $ready = $true; break }
    if ($proc.HasExited) { break }
  }
  if (-not $ready) {
    $stderr = Join-Path $logs 'server-stderr.log'
    if (Test-Path -LiteralPath $stderr) {
      Get-Content -LiteralPath $stderr -Tail 25 -ErrorAction SilentlyContinue | ForEach-Object { Log "Server: $_" }
    }
    throw 'Server or chat page failed readiness check; inspect logs/server-stderr.log'
  }
  Log 'Health and chat page checks passed'
  OpenChat $port
  exit 0
} catch {
  Log "ERROR: $($_.Exception.Message)"
  Log "DETAIL: $($_.ScriptStackTrace)"
  exit 1
} finally {
  if ($locked) { $mutex.ReleaseMutex() }
  $mutex.Dispose()
}
