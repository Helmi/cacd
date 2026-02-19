#!/bin/bash
# Sidecar worktree setup — delegates to shared script
exec bash "$(dirname "$0")/scripts/worktree-setup.sh"
