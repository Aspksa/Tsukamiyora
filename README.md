# Tsukamiyora Core

Portable local AI assistant foundation for Windows.

## Requirements
- Windows 10/11
- Node.js 22.13+ (recommended: current LTS)
- No Docker, Python, PostgreSQL, or npm install required for the initial core

## Run
Double-click `Tsukamiyora.bat` or run `node src/server.js`.

Open http://127.0.0.1:4177/health to check the core.

## Diagnostics
`node scripts/diagnose.js`

## Tests
`node --test`

## Storage
Local SQLite database: `data/tsukamiyora.sqlite`.
Logs: `logs/core.jsonl`.
Both are excluded from Git.

## Architecture
- `src/server.js`: local HTTP service and health endpoint
- `src/storage.js`: SQLite schema and persistence
- `scripts/diagnose.js`: environment and storage diagnostics
- `tests/`: automated tests

This is a minimal foundation, not yet an AI chat, agent runtime, GUI, or auto-installer.
