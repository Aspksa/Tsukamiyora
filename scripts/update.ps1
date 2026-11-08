param([switch]$Apply)
$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $root
if(-not (Get-Command git.exe -ErrorAction SilentlyContinue)){throw 'Git is required for updates'}
if((git status --porcelain)){throw 'Working tree has local changes; refusing update'}
if((git branch --show-current) -ne 'main'){throw 'Switch to main before updating'}
$before=(git rev-parse HEAD).Trim()
git fetch origin main
if($LASTEXITCODE -ne 0){throw 'Fetch failed'}
$target=(git rev-parse origin/main).Trim()
git merge-base --is-ancestor HEAD origin/main
if($LASTEXITCODE -ne 0){throw 'Remote main is not a fast-forward; refusing update'}
Write-Host "Current: $before"
Write-Host "Remote:  $target"
if(-not $Apply){Write-Host 'Preview only. Run scripts/update.ps1 -Apply to update.';exit 0}
if($before -eq $target){Write-Host 'Already current';exit 0}
$backupFolder=Join-Path $root 'data\backups'
New-Item -ItemType Directory -Force -Path $backupFolder | Out-Null
$node=Get-Command node.exe -ErrorAction SilentlyContinue
if(-not $node){throw 'Node.js required for safe backup before update'}
& $node.Source src/backup.js --run-backup
if($LASTEXITCODE -ne 0){throw 'Database backup failed; update aborted'}
git merge --ff-only origin/main
if($LASTEXITCODE -ne 0){throw 'Fast-forward failed'}
Write-Host 'Code updated. Restart Tsukamiyora to apply. Data untouched.'
Write-Host "Previous commit: $before (manual rollback: git reset --hard $before, only after safeguarding changes)"
