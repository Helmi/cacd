# Agent Control Desk (ACD) - Repository Guidelines

**Agent Control Desk** is a hard fork of the original `ccmanager` project. 
**Primary Goal:** Evolve the tool into a comprehensive control plane for AI agents, featuring a robust WebUI alongside the original TUI, and significantly extending the feature set beyond simple session management.

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

## Build, Test & Development Commands
- `npm run build`: Compiles the Backend (`tsc`) **AND** the Frontend (`client/` build).
- `npm start`: Runs the compiled CLI/Server (`dist/cli.js`).
    - Requires `ACD_PROJECTS_DIR` env var for multi-project mode.
- `npm run dev`: Launches Backend in watch mode.
- `npm run test`: Runs the Vitest suite for the backend.
- `npm run lint`: Checks code style across the project.

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

## Testing Guidelines
- **Backend:** Write Vitest unit tests alongside files (`*.test.ts`).
    - Use `vi.mock` for external dependencies (git, fs, child_process).
- **Frontend:** (Future) Add component tests for React views.
- **Coverage:** Maintain high coverage for core services (`SessionManager`, `WorktreeService`).

## Commit & Pull Request Guidelines
- **Conventional Commits:** `type: subject` (e.g., `feat: add web terminal view`, `refactor: rename environment variable`).
- **Context:** Mention if a change affects TUI, WebUI, or both.
- **Verification:** Ensure `npm run build` passes (builds both ends) before pushing.