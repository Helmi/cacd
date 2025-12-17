# CCManager Web POC

This is a minimal proof‑of‑concept for remotely viewing and typing into a
single PTY over WebSocket. It does **not** integrate with CCManager’s core yet.

## Run

1. Install deps:
   ```bash
   npm install
   ```
2. Start the server from any worktree/repo directory you want to control:
   ```bash
   node poc/server.mjs
   ```
3. Open `http://localhost:4577` (or from another machine on your LAN).

## Env vars

- `CCMANAGER_POC_HOST` (default `0.0.0.0`)
- `CCMANAGER_POC_PORT` (default `4577`)
- `CCMANAGER_POC_CMD` (default `$SHELL` or `bash`)
- `CCMANAGER_POC_ARGS` (default empty, space‑separated)

Example:
```bash
CCMANAGER_POC_CMD=claude CCMANAGER_POC_ARGS="--resume" node poc/server.mjs
```

## Security note

There is no authentication. Treat this as LAN‑only and temporary.

