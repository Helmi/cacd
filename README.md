# CA⚡CD - Coding Agent Control Desk

```
                                       ░▒▓░
 ░▒▓███████▓▒░  ░▒▓███████▓▒░        ░▒▓▓▒    ░▒▓███████▓▒░ ░▒▓████████▓▒░
░▒▓█▓▒░ ░▒▓█▓▒░░▒▓█▓▒░ ░▒▓█▓▒░     ░▒▓█▓▒░    ░▒▓█▓▒░ ░▒▓█▓▒░░▒▓█▓▒░ ░▒▓█▓▒░
░▒▓█▓▒░        ░▒▓█▓▒░ ░▒▓█▓▒░   ░▒▓██▓▒░     ░▒▓█▓▒░        ░▒▓█▓▒░ ░▒▓█▓▒░
░▒▓█▓▒░        ░▒▓█▓▒░ ░▒▓█▓▒░  ░▒▓██▓▒░      ░▒▓█▓▒░        ░▒▓█▓▒░ ░▒▓█▓▒░
░▒▓█▓▒░        ░▒▓█████████▓▒░ ░▒▓███████▓▒░  ░▒▓█▓▒░        ░▒▓█▓▒░ ░▒▓█▓▒░
░▒▓█▓▒░        ░▒▓█▓▒░ ░▒▓█▓▒░     ░▒▓██▓▒░   ░▒▓█▓▒░        ░▒▓█▓▒░ ░▒▓█▓▒░
░▒▓█▓▒░        ░▒▓█▓▒░ ░▒▓█▓▒░    ░▒▓██▓▒░    ░▒▓█▓▒░        ░▒▓█▓▒░ ░▒▓█▓▒░
░▒▓█▓▒░ ░▒▓█▓▒░░▒▓█▓▒░ ░▒▓█▓▒░   ░▒▓█▓▒░      ░▒▓█▓▒░ ░▒▓█▓▒░░▒▓█▓▒░ ░▒▓█▓▒░
 ░▒▓███████▓▒░ ░▒▓█▓▒░ ░▒▓█▓▒░   ░▒▓▓▒░       ░▒▓███████▓▒░ ░▒▓████████▓▒░
                                 ░▓▒░
```

> A control plane for managing multiple AI coding agents across projects and worktrees.

## What is CACD?

CACD lets you run multiple AI coding assistant sessions in parallel - Claude Code, Gemini CLI, Codex CLI, or Cursor - and manage them from a single interface. It's built around Git worktrees, allowing each agent to work on a separate branch without conflicts. Access everything via WebUI or the terminal-based TUI.

## Features

- **WebUI + TUI** - Full web interface alongside the terminal UI
- **Multi-agent** - Claude Code, Gemini CLI, Codex CLI, GitHub Copilot, Cursor
- **Multi-project** - Manage multiple repositories from one interface
- **Git worktree integration** - Create, merge, and delete worktrees without leaving the app
- **Session state detection** - Visual indicators for idle, busy, and waiting states
- **Status hooks** - Trigger notifications or scripts on state changes
- **Session data copying** - Transfer conversation context between worktrees
- **Auto-approval** - Automatically approve safe prompts (experimental)

## Quick Start

```bash
# Install globally
npm install -g ca-cd

# Or run directly with npx
npx ca-cd
```

On first run, an onboarding wizard guides you through setup. The WebUI URL is shown after setup completes.

## Documentation

Visit the [documentation site](https://helmi.github.io/cacd/) for detailed guides on features, configuration, and more.

## Development

```bash
bun install
bun run dev
```

This starts both backend and frontend with hot reload. See [CLAUDE.md](CLAUDE.md) for detailed development guidelines.

## License

AGPL-3.0-or-later - see [LICENSE](LICENSE)

## Acknowledgments

CACD is a fork of [ccmanager](https://github.com/kbwo/ccmanager) by [@kbwo](https://github.com/kbwo).
