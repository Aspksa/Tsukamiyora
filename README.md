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

## Core v0.3.0 (development)
- Node.js 22.13+ portable launcher; Fastify and local WebSocket.
- SQLite storage and periodic verified backups; supervised restart with bounded retries.
- Worker Threads task queue (sum/hash), priority 0–10, max 100 pending, concurrency 2.
- Local-only endpoints: `GET /health`, `GET /api/metrics`, `GET /api/modules`, `POST /api/tasks`, `GET /api/tasks/:id`, `GET /api/events`, `/ws`.
- `npm test` for unit tests; `npm run diagnose`; Windows/Linux GitHub Actions integration checks.
- `powershell -NoProfile -File scripts/update.ps1` previews remote fast-forward; `-Apply` creates database backup and fast-forwards code. Stop the app before applying.
- Manual recovery only: stop the app, then `node scripts/restore.js data/backups/<backup-file>.sqlite`. Never overwrite a running database.
- Dependency lockfile is not yet generated. Run `npm install` in an online environment to create it and commit `package-lock.json` before relying on `npm ci` or `npm run verify`.
- No guarantee of crash recovery from damaged data; automatic database restore is intentionally disabled.
