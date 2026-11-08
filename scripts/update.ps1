param([switch]$Apply)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $root
function Git([string[]]$argsList) {
  $output = & git.exe @argsList
  if ($LASTEXITCODE -ne 0) { throw "Git failed: $($argsList -join ' ')" }
  return $output
}
if (-not (Get-Command git.exe -ErrorAction SilentlyContinue)) { throw 'Git required for update' }
if ((git status --porcelain)) { throw 'Uncommitted changes: refusing update' }
if ((git branch --show-current).Trim() -ne 'main') { throw 'Switch to main' }
$before = (git rev-parse HEAD).Trim()
Git -argsList @('fetch','origin','main') | Out-Null
$target = (git rev-parse origin/main).Trim()
& git merge-base --is-ancestor HEAD origin/main
if ($LASTEXITCODE -ne 0) { throw 'Remote main diverged: update refused' }
Write-Host "Current: $before"
Write-Host "Remote: $target"
if (-not $Apply) { Write-Host 'Preview only. Run with -Apply to update.'; exit 0 }
if ($before -eq $target) { Write-Host 'Already up to date'; exit 0 }
$node = Join-Path $root '.runtime\node\node.exe'
if (-not (Test-Path -LiteralPath $node)) {
  $found = Get-Command node.exe -ErrorAction SilentlyContinue
  if (-not $found) { throw 'Node.js required for backup and validation' }
  $node = $found.Source
}
$backupFolder = Join-Path $root 'data\backups'
New-Item -ItemType Directory -Force -Path $backupFolder | Out-Null
& $node src/backup.js --run-backup
if ($LASTEXITCODE -ne 0) { throw 'Database backup failed' }
# Validate the target revision in a separate detached worktree before touching main.
$stage = Join-Path $root '.runtime\update-check'
if (Test-Path -LiteralPath $stage) { throw 'Update check directory exists; inspect and remove it manually' }
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $stage) | Out-Null
try {
  Git -argsList @('worktree','add','--detach',$stage,$target) | Out-Null
  Push-Location -LiteralPath $stage
  try {
    & $node --check src/server.js
    if ($LASTEXITCODE -ne 0) { throw 'New server syntax invalid' }
    & $node --check src/supervisor.js
    if ($LASTEXITCODE -ne 0) { throw 'New supervisor syntax invalid' }
    & $node --test tests/runtime.test.js tests/restore.test.js
    if ($LASTEXITCODE -ne 0) { throw 'New revision tests failed' }
  } finally { Pop-Location }
  Git -argsList @('merge','--ff-only','origin/main') | Out-Null
  try {
    & $node --check src/server.js
    if ($LASTEXITCODE -ne 0) { throw 'Post-update server syntax failed' }
    & $node --check src/supervisor.js
    if ($LASTEXITCODE -ne 0) { throw 'Post-update supervisor syntax failed' }
  } catch {
    Write-Warning "Update validation failed. Rolling code back to $before"
    Git -argsList @('reset','--hard',$before) | Out-Null
    throw
  }
  Write-Host "Update installed: $target"
  Write-Host "Previous revision: $before"
} finally {
  & git.exe worktree remove --force $stage 2>$null
}
