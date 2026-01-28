---
title: Configuration File
description: Full config.json reference
---

CACD stores its configuration in `~/.config/cacd/config.json` (or a custom location if you set `CACD_CONFIG_DIR`).

## File Location

- **Linux/macOS:** `~/.config/cacd/config.json`
- **Custom:** Set via `CACD_CONFIG_DIR` environment variable

## Structure

```json
{
  "port": 54321,
  "webEnabled": true,
  "accessToken": "word-word-word",
  "passcodeHash": "...",
  "shortcuts": { ... },
  "statusHooks": { ... },
  "worktreeHooks": { ... },
  "worktree": { ... },
  "agents": { ... },
  "autoApproval": { ... }
}
```

## Sections

### General

| Field | Type | Description |
|-------|------|-------------|
| `port` | number | Web interface port (randomly generated during setup) |
| `webEnabled` | boolean | Whether web interface is enabled |
| `accessToken` | string | 3-word token for WebUI URL |
| `passcodeHash` | string | Hashed passcode for authentication |

### shortcuts

```json
{
  "shortcuts": {
    "returnToMenu": { "ctrl": true, "key": "e" },
    "cancel": { "key": "escape" }
  }
}
```

See [Keyboard Shortcuts](/cacd/configuration/shortcuts/).

### statusHooks

```json
{
  "statusHooks": {
    "idle": { "command": "notify-send 'Session idle'", "enabled": true },
    "busy": { "command": "", "enabled": false },
    "waiting_input": { "command": "notify-send 'Needs input'", "enabled": true }
  }
}
```

See [Status Hooks](/cacd/configuration/status-hooks/).

### worktreeHooks

```json
{
  "worktreeHooks": {
    "postCreate": "cd \"$CACD_WORKTREE_PATH\" && npm install"
  }
}
```

See [Worktree Hooks](/cacd/configuration/worktree-hooks/).

### worktree

```json
{
  "worktree": {
    "autoDirectory": true,
    "autoDirectoryPattern": "../worktrees/{branch}",
    "copySessionData": false,
    "sortBy": "name"
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `autoDirectory` | boolean | Auto-generate worktree paths |
| `autoDirectoryPattern` | string | Pattern for auto-generated paths |
| `copySessionData` | boolean | Default for copying Claude session data |
| `sortBy` | string | Sort worktrees by "name" or "lastAccess" |

### agents

```json
{
  "agents": {
    "agents": [
      {
        "id": "claude",
        "name": "Claude Code",
        "kind": "agent",
        "command": "claude",
        "options": [
          { "id": "model", "flag": "--model", "label": "Model", "type": "string" }
        ]
      }
    ],
    "defaultAgentId": "claude",
    "schemaVersion": 1
  }
}
```

See [Agent Profiles](/cacd/configuration/agent-profiles/).

### autoApproval

```json
{
  "autoApproval": {
    "enabled": false,
    "timeout": 30,
    "customCommand": ""
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `enabled` | boolean | Enable auto-approval |
| `timeout` | number | Timeout in seconds (default: 30) |
| `customCommand` | string | Custom verification command |

See [Auto-Approval](/cacd/features/auto-approval/).

## Other Files

CACD also maintains:

- `~/.config/cacd/projects.json` - List of tracked projects
- `~/.config/cacd/agents.json` - Agent configurations (if separate from main config)

## Editing

You can edit the config file directly, but it's easier to use the Settings UI in CACD. Changes made in the UI are saved automatically.

If you edit manually, restart CACD to pick up changes.
