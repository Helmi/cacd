---
title: Quick Start
description: Get up and running with CACD
---

## First Run

On first launch, CACD runs an onboarding wizard in the terminal:

```bash
cacd
```

The wizard will:
1. Detect installed AI agents (Claude, Gemini, Codex, etc.)
2. Ask if you want to enable the web interface
3. If yes, suggest a random port (you can accept or change it)
4. Ask you to set a passcode for WebUI access
5. Optionally add your current directory as a project

After setup completes, the TUI (terminal interface) launches.

## Accessing the WebUI

If you enabled the web interface during setup, open the URL shown in the terminal. It includes your access token:

```
http://localhost:PORT/your-access-token
```

The port and token are displayed when CACD starts. You can also run `cacd auth show` to see the URL again.

## Create a Session

In the WebUI:

1. Click **New Session** in the sidebar
2. Select an agent (Claude Code, Gemini, etc.)
3. Configure any agent-specific options (model, YOLO mode, etc.)
4. Choose an existing worktree or create a new one
5. Click **Create Session**

<div class="screenshot-placeholder">
Screenshot: New Session dialog with agent selection and worktree options
</div>

The agent launches in the terminal panel and you can start coding.

## Status Indicators

Sessions show their current state:

| Color | Status | Meaning |
|-------|--------|---------|
| Green | Idle | Ready for input |
| Yellow | Busy | Processing a request |
| Red | Waiting | Needs your confirmation |

## Adding More Projects

To manage multiple repositories, add them to CACD:

```bash
cacd add /path/to/another/project
```

Then switch between projects in the WebUI sidebar.

## Next Steps

- Explore [Features](/cacd/features/) for detailed guides
- Check [Configuration](/cacd/configuration/) to customize CACD
