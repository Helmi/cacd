---
title: CLI Commands
description: Command-line interface reference
---

## Main Command

```bash
cacd
```

Launches CACD. On first run, the setup wizard runs. After setup, the TUI (terminal interface) starts. If web interface is enabled, the API server runs in the background.

## Subcommands

### setup

```bash
cacd setup [options]
```

Run the first-time setup wizard. Guides you through initial configuration.

**Options:**

| Flag | Description |
|------|-------------|
| `--no-web` | Disable the web interface |
| `--project <path>` | Add specified path as first project |
| `--skip-project` | Don't add any project during setup |
| `--force` | Overwrite existing config without asking |
| `--port <number>` | Set custom port for web interface |

### add

```bash
cacd add [path]
```

Add a project to CACD's tracking list.

- Without a path: adds the current directory
- With a path: adds the specified directory

The path must be a valid Git repository.

### remove

```bash
cacd remove <path>
```

Remove a project from CACD's list. This doesn't delete any files - it just stops tracking the project.

### list

```bash
cacd list
```

Show all tracked projects with their paths.

### auth

```bash
cacd auth <command>
```

Manage WebUI authentication.

**Subcommands:**

| Command | Description |
|---------|-------------|
| `show` | Display the WebUI access URL with token |
| `reset-passcode` | Change your passcode |
| `regenerate-token` | Generate a new access token (invalidates old URLs) |

## Global Options

| Flag | Description |
|------|-------------|
| `--help` | Show help text |
| `--version` | Show version number |
| `--port <number>` | Port for web interface (overrides config/env) |
| `--headless` | Run API server only, no TUI (useful for development) |
| `--devc-up-command` | Command to start devcontainer |
| `--devc-exec-command` | Command to execute in devcontainer |

## Examples

```bash
# Launch CACD
cacd

# Run first-time setup
cacd setup

# Setup with custom port
cacd setup --port 8080

# Add current directory as a project
cacd add

# Add a specific project
cacd add /path/to/my-project

# List all projects
cacd list

# Show WebUI access URL
cacd auth show

# Launch on a specific port
cacd --port 8080

# Run headless (API server only)
cacd --headless

# Run with devcontainer support
cacd --devc-up-command "devcontainer up --workspace-folder ." \
     --devc-exec-command "devcontainer exec --workspace-folder ."
```

## Notes

- The `--devc-up-command` and `--devc-exec-command` flags must be used together
- Port can be set via flag, environment variable (`CACD_PORT`), or config file (flag takes priority)
- Headless mode is mainly for development when you want just the API server
