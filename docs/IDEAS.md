# CACD Feature Ideas

Backlog of ideas for future consideration. Not prioritized, not committed.

---

## Authentication & Security

- **System-based auth (macOS Keychain / Windows Credential Manager)** - Use OS-level authentication for browser sessions instead of custom auth. Borrowed from VibeTunnel approach.
- **SSH key authentication** - Alternative auth method using existing SSH keys for browser session access.

## UX Improvements

- **First-run onboarding** - Guided setup flow for new users. Detect missing config, walk through project setup, explain worktree workflow.
- **Web-based settings UI** - `/settings` route in WebUI to configure `.cacd.json` without manual file editing.
- **Browser notifications** - Notify when sessions complete, error out, or need attention. Useful when running headless.

## Infrastructure

- **Tunnel integrations** - ngrok, Cloudflare Tunnel, localtunnel for remote access to local sessions. Low priority unless remote access becomes a real need.

## Tech Debt

- **Prettier formatting issues** - Pre-existing formatting violations in `src/components/Header.tsx` (ASCII art) and `src/services/apiServer.ts` (line length/indentation). Run `bun run lint --fix` or manually address.

## Reference Implementations

- **VibeTunnel xterm.js** - Check their xterm.js integration for solutions to rendering issues. Repo: https://github.com/amantus-ai/vibetunnel

---

## Rejected / Parked

- **Electron packaging** - Maintenance burden outweighs benefits. WebUI serves the same purpose without cross-platform headaches.
