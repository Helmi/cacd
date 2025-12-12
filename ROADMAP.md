# Project Roadmap

## 🚀 Web Interface (Hybrid Server/TUI) - `feature/web-interface`
**Goal:** Enable "Headless" operation and remote management via a browser.

### Phase 1: Core Architecture
- [x] **Decoupling:** Extracted business logic from `App.tsx` into `CoreService` (Singleton State Store).
- [x] **State Management:** `CoreService` now manages Sessions, Worktrees, and Project selection centrally.
- [x] **TUI Refactor:** Updated `src/components/App.tsx` to subscribe to `CoreService` events instead of managing state locally.

### Phase 2: API Server
- [x] **Fastify Server:** Embedded Fastify v5 server running alongside TUI.
- [x] **Real-time Streaming:** Implemented `socket.io` for bi-directional terminal streaming.
- [x] **Endpoints:**
    - `GET /api/state` - Global app state.
    - `GET /api/sessions` - Active sessions list.
    - `POST /api/session/create` - Start new session (supports Presets).
    - `GET /api/config` & `POST /api/config` - Read/Write settings.
    - `GET /api/projects` & `POST /api/project/select` - Multi-project discovery and switching.

### Phase 3: Web Frontend (`client/`)
- [x] **Tech Stack:** React, Vite, Tailwind CSS, Lucide Icons.
- [x] **Terminal View:** `xterm.js` integration with auto-resize and `xterm-addon-fit`.
- [x] **Dashboard:**
    - Sidebar listing Active Sessions and Worktrees.
    - "Start Session" flow with **Command Preset Selection**.
    - **Project Switcher** for Multi-Project navigation.
- [x] **Settings Editor:** Full UI for configuring:
    - [x] General Defaults (Auto-Directory, etc.)
    - [x] Command Presets (Add/Edit/Delete profiles).
    - [x] Auto-Approval settings (with Info tooltip).
    - [x] Shortcuts: Keybinding configuration.
    - [x] Status Hooks: Lifecycle hooks (Idle/Busy/Waiting).
    - [x] Worktree Hooks: Post-creation hooks.

### Phase 4: Integration & Security
- [x] **Authentication:** Secure Token-based access (Random UUID generated on start).
- [x] **Magic Link:** TUI displays a one-click login URL (`http://0.0.0.0:3000/?token=...`).
- [x] **Distribution:** Client builds to `client/dist`, served statically by the CLI.
- [x] **Multi-Project:** Auto-enabled mode when `CCMANAGER_MULTI_PROJECT_ROOT` env var is present.

## 🔮 Future / Ideas
- [ ] **Mobile Optimization:** Optimize Web UI layout for phone/tablet control.
- [ ] **Log Viewer:** Stream `ccmanager.log` to a Web UI tab for debugging.
- [ ] **Theme Support:** Dark/Light mode toggle for Web UI.
- [ ] **File Explorer:** Simple file tree view for browsing worktrees remotely.
- [ ] **Session Persistence:** Re-attach to sessions after server restart (requires backend changes).
