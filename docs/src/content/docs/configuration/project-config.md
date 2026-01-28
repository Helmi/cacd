---
title: Project Configuration
description: Per-project settings with .cacd.json
---

You can add a `.cacd.json` file to your project root to configure project-specific behavior. This is useful for setup scripts that should run when working with worktrees in that project.

## File Location

CACD looks for configuration in this order:

1. `.cacd.json` in the project root
2. `.cacd/config.json` in the project root

Use whichever fits your preference. The first one found is used.

## Configuration Options

### Scripts

Define shell commands that run automatically:

```json
{
  "scripts": {
    "setup": "npm install && cp .env.example .env",
    "teardown": "echo 'Cleaning up...'"
  }
}
```

#### setup

Runs after a new worktree is created in this project. Use it to:

- Install dependencies
- Set up environment files
- Run initialization scripts

#### teardown

Runs before a worktree is deleted. Use it to:

- Clean up resources
- Save state
- Log activity

## Environment Variables

Scripts have access to:

| Variable | Description |
|----------|-------------|
| `CACD_ROOT_PATH` | Git repository root |
| `CACD_WORKTREE_PATH` | Path to the worktree |
| `CACD_WORKTREE_NAME` | Name of the worktree |
| `CACD_BRANCH` | Branch name |

## Example

A typical `.cacd.json` for a Node.js project:

```json
{
  "scripts": {
    "setup": "cd \"$CACD_WORKTREE_PATH\" && npm install"
  }
}
```

For a project with multiple package managers:

```json
{
  "scripts": {
    "setup": "cd \"$CACD_WORKTREE_PATH\" && npm install && pip install -r requirements.txt"
  }
}
```

## Notes

- Scripts run asynchronously and don't block CACD
- Failures are logged but don't prevent operations
- This file is optional - CACD works fine without it
- Project config is separate from global CACD settings
