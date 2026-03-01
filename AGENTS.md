# CACD — Coding Agent Control Desk

A local development orchestrator for AI coding agent sessions. Runs as a **daemon** exposing a **Fastify API + Socket.IO** server, a **React WebUI**, and a **CLI** (`cacd`). Manages PTY sessions for coding agents (Codex, Claude Code, Pi, etc.), git worktrees, and task integration via `td`.

Originally forked from [kbwo/ccmanager](https://github.com/kbwo/ccmanager) — codebases have fully diverged, no compatibility. Occasionally worth checking their `sessionManager` and `worktreeService` for bug fix ideas.

**Repo:** [github.com/Helmi/cacd](https://github.com/Helmi/cacd) (private)

## Task Management

Run `td usage --new-session` at conversation start (or after `/clear`). Use `td usage -q` for subsequent reads.

## Safety Guardrails

- **CRITICAL:** Never run `bun run build` or `bun run install:global` without explicit user confirmation. The global install is used productively.
- **NEVER** execute release commands autonomously. See the `cacd-release` skill for the release workflow.
- **NEVER** push to `main` without a passing build.

## Project Structure

- `src/` — Backend: daemon, API server, session management, PTY handling
  - `services/` — Core domain logic (SessionManager, CoreService, APIServer, ProjectManager)
  - `cli/` — CLI commands (thin API client, no business logic)
  - `utils/` — Shared utilities, hook executor
- `client/` — React + Vite WebUI (Tailwind + Lucide)
- `dist/` — Compiled backend (`cli.js`)
- `scripts/` — Build and release tooling
- `.agents/skills/` — Agent skills (cross-agent, symlinked to `.claude/skills/` etc.)

## Build, Test & Dev

**Package manager:** `bun` only. Use `bun run <script>` (not bare `bun test` — that invokes Bun's runner instead of Vitest).

```bash
bun install                    # Install deps
bun run build                  # Build backend (tsc) + frontend (vite)
bun run test                   # Run Vitest suite
bun run test -- src/services/sessionManager.test.ts  # Scoped test run
bun run lint                   # ESLint + Prettier check
bun run dev                    # Hot-reload: backend (headless) + frontend (Vite) concurrently
bun run install:global         # Build + install globally (npm nested strategy)
```

PTY sessions die on backend restart during dev — just restart them.

## Architecture

- **Daemon:** Node.js process owning all PTY sessions. Runs headless by default.
- **API:** Fastify server (configurable port) + Socket.IO for real-time terminal streaming.
- **WebUI:** React SPA served by the daemon. Vite dev server proxies to backend in dev.
- **CLI:** `cacd` — thin client that talks to the daemon API. No business logic in CLI layer.
- **Core Service:** Singleton (`coreService.ts`) orchestrating state across all interfaces.
- **Legacy TUI:** Ink-based terminal UI exists but is being phased out.

## Coding Style

Prettier + ESLint enforced. Beyond that:

```ts
// const over let — use ternaries or early returns
const mode = headless ? 'daemon' : 'tui'

// Avoid else — prefer early returns
function resolve(session: Session) {
  if (!session.active) return null
  return session.worktree
}

// Avoid destructuring — dot notation preserves context
session.id        // ✓
const { id } = s  // ✗

// Single-word names where possible
const sessions = manager.list()  // ✓
const sessionList = manager.list()  // ✗

// Inline when used once
const config = await Bun.file(path.join(dir, 'config.json')).json()  // ✓
// not: const configPath = path.join(dir, 'config.json')
//      const config = await Bun.file(configPath).json()
```

- **Error handling:** Effect-ts patterns. No raw try/catch.
- **Logging:** `logger.info()` / `logger.error()` — never `console.log`.
- **Types:** Explicit, avoid `any`. Prefer functional array methods (`map`, `filter`, `flatMap`) over `for` loops.
- **Backend naming:** PascalCase for services/components, camelCase for functions/variables.

## Conventions

- **Commits:** Conventional Commits — `type: subject` (e.g., `feat: add session restore`, `fix: worktree cleanup on exit`). Note if change affects backend, frontend, or both.
- **Testing:** Vitest unit tests alongside files (`*.test.ts`). Use `vi.mock` for externals (git, fs, child_process). Maintain high coverage on core services.
- **CLI rule:** CLI is a thin API client. Fallback to direct service only on `ECONNREFUSED` (daemon unreachable), never on 404 from a running daemon.
