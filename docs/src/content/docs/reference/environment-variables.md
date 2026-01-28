---
title: Environment Variables
description: Environment variable reference
---

CACD uses these environment variables for configuration.

## Application Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `CACD_CONFIG_DIR` | Custom config directory path | `~/.config/cacd` |
| `CACD_PORT` | Port for the web interface | (from config) |
| `CACD_DEV` | Enable dev mode (uses `.cacd-dev/` in current dir) | unset |

### CACD_CONFIG_DIR

Override the default config directory. Useful if you want to keep CACD config in a different location.

```bash
export CACD_CONFIG_DIR=/path/to/custom/config
cacd
```

### CACD_PORT

Set the web interface port without using the `--port` flag.

```bash
export CACD_PORT=8080
cacd
```

Note: The `--port` flag takes priority over this variable.

### CACD_DEV

When set to `1`, CACD uses `.cacd-dev/` in the current directory instead of the global config. Useful for development.

```bash
export CACD_DEV=1
cacd
```

## Hook Environment Variables

These variables are available to hooks (status hooks, worktree hooks, project scripts).

### Status Hooks

| Variable | Description |
|----------|-------------|
| `CACD_WORKTREE_PATH` | Path to the session's worktree |
| `CACD_WORKTREE_BRANCH` | Branch name |
| `CACD_GIT_ROOT` | Git repository root |
| `CACD_SESSION_ID` | Session identifier |
| `CACD_OLD_STATE` | Previous state (idle, busy, waiting_input) |
| `CACD_NEW_STATE` | New state |

### Worktree Hooks

| Variable | Description |
|----------|-------------|
| `CACD_WORKTREE_PATH` | Path to the new worktree |
| `CACD_WORKTREE_BRANCH` | Branch name |
| `CACD_GIT_ROOT` | Git repository root |
| `CACD_BASE_BRANCH` | Branch the worktree was created from |

### Project Scripts (.cacd.json)

| Variable | Description |
|----------|-------------|
| `CACD_ROOT_PATH` | Git repository root |
| `CACD_WORKTREE_PATH` | Path to the worktree |
| `CACD_WORKTREE_NAME` | Worktree name |
| `CACD_BRANCH` | Branch name |

## Priority Order

For port configuration:

1. `--port` flag (highest priority)
2. `CACD_PORT` environment variable
3. Config file setting
4. Default: `3000`

For config directory:

1. `CACD_CONFIG_DIR` (highest priority)
2. `CACD_DEV=1` (uses `.cacd-dev/`)
3. Default: `~/.config/cacd`
