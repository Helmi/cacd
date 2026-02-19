#!/bin/bash
# CACD Worktree Setup Hook
# Works with both CACD and Sidecar worktree creation.
#
# CACD env vars:
#   CACD_ROOT_PATH      - Git root (main repo)
#   CACD_WORKTREE_PATH  - New worktree path
#   CACD_WORKTREE_NAME  - Worktree directory name
#   CACD_BRANCH         - Branch name
#
# Sidecar env vars:
#   MAIN_WORKTREE       - Git root (main repo)
#   WORKTREE_PATH       - New worktree path
#   WORKTREE_BRANCH     - Branch name

set -euo pipefail

# Support both CACD and Sidecar env vars
WORKTREE="${CACD_WORKTREE_PATH:-${WORKTREE_PATH:-$(pwd)}}"
ROOT="${CACD_ROOT_PATH:-${MAIN_WORKTREE:-$(git rev-parse --show-toplevel 2>/dev/null || echo '')}}"

echo "[worktree-setup] Setting up ${CACD_WORKTREE_NAME} at ${WORKTREE}"

# 1. Copy dev config (not in git)
if [ -d "${ROOT}/.cacd-dev" ]; then
    cp -r "${ROOT}/.cacd-dev" "${WORKTREE}/.cacd-dev"
    echo "[worktree-setup] Copied .cacd-dev config"
fi

# 2. Install dependencies
if [ -f "${WORKTREE}/package.json" ]; then
    cd "${WORKTREE}"
    bun install --frozen-lockfile 2>/dev/null || bun install
    echo "[worktree-setup] Dependencies installed"
fi

# 3. Rebuild native modules (better-sqlite3, node-pty)
cd "${WORKTREE}"
npm rebuild better-sqlite3 node-pty 2>/dev/null && \
    echo "[worktree-setup] Native modules rebuilt" || \
    echo "[worktree-setup] Warning: native module rebuild failed (non-fatal)"

# 4. Install client dependencies
if [ -f "${WORKTREE}/client/package.json" ]; then
    cd "${WORKTREE}/client"
    bun install --frozen-lockfile 2>/dev/null || bun install
    echo "[worktree-setup] Client dependencies installed"
fi

echo "[worktree-setup] Done. Worktree ready for development."
