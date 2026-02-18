#!/bin/bash
# Setup PATH for tools installed via nvm, homebrew, etc.
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
[ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh" 2>/dev/null
# Fallback: source shell profile if nvm not found
if ! command -v node &>/dev/null; then
  [ -f "$HOME/.zshrc" ] && source "$HOME/.zshrc" 2>/dev/null
  [ -f "$HOME/.bashrc" ] && source "$HOME/.bashrc" 2>/dev/null
fi

codex --dangerously-bypass-approvals-and-sandbox "$(cat <<'SIDECAR_PROMPT_EOF'
Begin work on td-b6db81. Read the task description carefully before starting.
Use td to track progress and update the task as you go.
Follow conventional commits. Create a feature/ or fix/ branch as appropriate.
SIDECAR_PROMPT_EOF
)"
rm -f "/Users/helmi/code/cacd-persistent-terminal-sessions/.sidecar-start.sh"
