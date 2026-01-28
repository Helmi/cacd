# CA⚡CD - Coding Agent Control Desk - Repository Guidelines

**Coding Agent Control Desk (CACD)** is a hard fork of the original `ccmanager` project.
**Primary Goal:** Evolve the tool into a comprehensive control plane for AI agents, featuring a robust WebUI alongside the original TUI, and significantly extending the feature set beyond simple session management.

## Upstream Repository

- **Original repo:** https://github.com/kbwo/ccmanager (for reference only, not a git remote)
- **This repo:** git@github.com:Helmi/cacd.git (remote: `origin`)
- **Note:** This project has fully diverged from upstream. No backward compatibility with ccmanager configs.

### Upstream Compatibility Guidelines

**Stay close to upstream's code structure** to benefit from improvements and bug fixes in the original `ccmanager` repo:

- **Preserve file/folder layout** in `src/` — don't reorganize core services or components without good reason
- **Keep service interfaces stable** — SessionManager, WorktreeService, ConfigurationManager should maintain similar APIs
- **Avoid renaming** core modules unless upstream does the same
- **When adding features**, prefer extending existing patterns over introducing new architectural concepts
- **Periodically check upstream** for bug fixes, especially in `sessionManager.ts`, `worktreeService.ts`, and state detection logic
- **Document divergences** — when CACD must deviate significantly, note it here so future merges are easier

### CACD-Specific Additions (divergences from upstream)

- `client/` — Full React WebUI (not in upstream)
- `src/services/apiServer.ts` — Fastify + Socket.IO server
- `src/services/coreService.ts` — State orchestration between TUI and WebUI
- Multi-project support via `ProjectManager` and `GlobalSessionOrchestrator`

## UI Reference

The UI reference design is located at `.ui-reference/` in the project root (gitignored).
- **Source repo:** https://github.com/Helmi/v0-agent-control-desk (branch: `v0-updates`)
- **Main project location:** `/Users/helmi/code/cacd/.ui-reference/`
- **Worktree setup:** Automatically copied to worktrees via `.cacd.json` setup script

**Important:** Before starting UI work, always update the reference from remote:
```bash
cd /Users/helmi/code/acd-ui-reference && git pull origin v0-updates
cp -r /Users/helmi/code/acd-ui-reference/* /Users/helmi/code/cacd/.ui-reference/
```

Use this as a guide for UI/UX improvements when rebuilding the WebUI.

## Project Structure & Module Organization
- `src/` (Backend/TUI): Holds the Node.js source code.
    - `components/`: Ink-based TUI components.
    - `services/`: Core domain logic (SessionManager, CoreService, APIServer).
    - `hooks/`: Custom React hooks for Ink.
    - `utils/`: Shared utilities and helpers.
- `client/` (Frontend): Holds the React + Vite WebUI source code.
    - `src/components/`: Web UI components (Tailwind + Lucide).
    - `dist/`: Compiled frontend assets served by the backend.
- `dist/`: Compiled backend artifacts (`cli.js`).
- `docs/`: Long-form documentation and architectural notes.

## Package Manager

Use **bun** for this project. Important: use `bun run <script>` (not bare `bun test` which uses Bun's test runner instead of Vitest).

## Build, Test & Development Commands
- `bun install`: Install dependencies.
- `bun run build`: Compiles the Backend (`tsc`) **AND** the Frontend (`client/` build).
- `bun run start`: Runs the compiled CLI/Server (`dist/cli.js`).
- `bun run test`: Runs the Vitest suite for the backend.
- `bun run lint`: Checks code style across the project.

### Development Workflow

**Hot-reload dev server** (recommended for development):
```bash
bun run dev
```
Runs both backend (tsx watch + headless) and frontend (Vite dev server) concurrently with hot reload. Access WebUI at `http://localhost:5173` (Vite proxies API requests to backend).

**Individual dev commands:**
- `bun run dev:server` — Backend only in headless mode (API server, no TUI)
- `bun run dev:client` — Frontend Vite dev server only
- `bun run dev:tui` — Backend with TUI (original dev mode)

**Note:** PTY sessions die when the backend restarts. This is unavoidable without architecture changes. For development, just restart sessions as needed.

**Version Display:** In development mode, the version displays with a `-dev` suffix (e.g., `0.2.0-dev`). This is handled automatically in `client/vite.config.ts` based on Vite's mode. Production builds show the clean version number.

### Global Install Workflow

Build and install globally for system-wide access:
```bash
bun run install:global
```
This builds both backend and frontend, then installs via `npm install -g . --install-strategy=nested` so `cacd` command is available globally. The nested strategy is required to avoid ink/ansi-styles dependency conflicts. Run again to update after changes.

## Architecture
The application operates in a **Hybrid Mode**:
1.  **TUI (Terminal User Interface):** Powered by `ink`, running directly in the terminal.
2.  **Web Server:** A `fastify` server (default port 3000) hosting the `client/` React app and a `Socket.IO` server for real-time terminal streaming.
3.  **Core Service:** A singleton (`coreService.ts`) that orchestrates state between the TUI and WebUI.

## Coding Style & Naming Conventions
- **Backend (src/):**
    - PascalCase for Components/Services.
    - `Effect-ts` patterns for error handling and side effects.
    - `logger.info()` instead of `console.log`.
- **Frontend (client/src/):**
    - React functional components.
    - Tailwind CSS for styling.
    - Lucide React for icons.
- **General:**
    - Explicit types (avoid `any`).
    - Prettier/ESLint rules enforced.

## Security Notes

### shell: true in spawn calls
The following files intentionally use `shell: true` in spawn calls:
- `src/services/autoApprovalVerifier.ts` — custom verifier commands
- `src/utils/hookExecutor.ts` — user-configured hook commands

**This is by design.** These are user-configured shell commands that need shell features (pipes, `&&`, variable expansion). Untrusted data is passed via environment variables, not interpolated into the command string. This follows the standard Unix security model where env vars are safe unless the script explicitly misuses them. Do not flag this as a security issue in reviews.

## Testing Guidelines
- **Backend:** Write Vitest unit tests alongside files (`*.test.ts`).
    - Use `vi.mock` for external dependencies (git, fs, child_process).
- **Frontend:** (Future) Add component tests for React views.
- **Coverage:** Maintain high coverage for core services (`SessionManager`, `WorktreeService`).

## Commit & Pull Request Guidelines
- **Conventional Commits:** `type: subject` (e.g., `feat: add web terminal view`, `refactor: rename environment variable`).
- **Context:** Mention if a change affects TUI, WebUI, or both.
- **Verification:** Ensure `bun run build` passes (builds both ends) before pushing.

## Release Process

**Versioning:** Semver (major.minor.patch). Version in `package.json` reflects the target release version during development.

**Development workflow:**
1. Set `package.json` version to target (e.g., `0.2.0`) at start of dev cycle
2. Dev UI shows `0.2.0-dev` (suffix added automatically in dev mode)
3. When ready to release, run `bun run release`

**Release commands:**
- `bun run release` — Interactive release (prompts for version, suggests based on commits)
- `bun run release 0.2.0` — Direct release to specified version
- `bun run release:dry` — Preview without making changes

**What release does:**
1. Analyzes commits since last tag and suggests bump type
2. Prompts for target version (or uses provided version)
3. Runs standard-version to update `package.json`, `CHANGELOG.md`, create commit and tag

**After release:**
```bash
git push --follow-tags    # Push commit + tag to trigger GitHub Actions
```
Then update `package.json` to the next target version for the next dev cycle.

GitHub Actions handles npm publish and GitHub release creation.

### Agent Instructions for Builds

**CRITICAL:** Never run `bun run build` or `bun run install:global` without explicit user confirmation. The globally installed build is used productively on this system and must not be overwritten without consent.

### Agent Instructions for Releases

**IMPORTANT:** Never execute release commands autonomously.

When significant work is completed (features, bug fixes, milestones), proactively suggest a release to the user:
- Mention the current version and what the next version should be
- Offer to run `bun run release:dry` first to preview

**Only execute release commands after explicit user confirmation.** Example:
> "We've completed the versioning feature. Ready to release 0.2.0? Want me to run `bun run release:dry` first?"
