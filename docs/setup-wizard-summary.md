# CACD Setup Wizard - Implementation Summary

## Quick Answers to Your Questions

### 1. Implementation Approach: **Ink-based TUI Wizard** ✅

**Recommendation:** Use Ink (React) wizard, not readline prompts.

**Why:**
- Consistent with existing codebase (all TUI uses Ink)
- Better UX (colors, formatting, navigation)
- Reuses existing components (`TextInputWrapper`, `SelectInput`)
- Follows established patterns (`NewWorktree.tsx`)

**When to use readline:** Only if you need non-interactive mode (`--yes` flag), but even then, consider CLI flags instead.

---

### 2. CLI Structure: **Add `setup` subcommand**

**Implementation:**

```typescript
// In cli.tsx, add to subcommand handling:

if (subcommand === 'setup') {
  // Run setup wizard (see implementation example)
  process.exit(0);
}

// Update meow help text:
//   $ cacd setup              Run setup wizard
```

**First-run detection:**

```typescript
// Early in cli.tsx (after initializeConfigDir):
function isFirstRun(): boolean {
  const configPath = join(getConfigDir(), 'config.json');
  return !existsSync(configPath);
}

// Auto-trigger if first run AND no subcommand:
if (isFirstRun() && !subcommand) {
  // Run setup wizard automatically
}
```

**Recommendation:** Auto-trigger setup on first run (better UX).

---

### 3. Config Migration: **Update Mode (Preserve Existing)**

**Strategy:** When `cacd setup` runs with existing config:

1. **Detect existing config** → Show "Update Configuration" header
2. **Pre-fill all fields** with existing values
3. **Allow selective updates** → User can skip steps (Enter = keep current)
4. **Never overwrite** without user confirmation

**Implementation pattern:**

```typescript
const existingConfig = configurationManager.getConfiguration();
const isUpdateMode = Object.keys(existingConfig).length > 0;

// Pre-fill state:
const [port, setPort] = useState(
  existingConfig.port?.toString() || generateRandomPort().toString()
);
```

**Alternative (not recommended):** Reset mode with backup - too destructive.

---

### 4. Code Patterns: **Follow Existing Conventions**

**Component structure:** Follow `NewWorktree.tsx`:
- Multi-step wizard with `useState` for step management
- Reuse `TextInputWrapper`, `SelectInput` components
- Use `useInput` hook for keyboard navigation
- Save via `configurationManager` methods

**Error handling:** Use Effect-ts where appropriate (consistent with codebase)

**Agent detection:** Create utility function (see `setup-wizard-agent-detection-example.ts`)

**Port generation:** Reuse `generateRandomPort()` from `constants/env.ts`

---

## Implementation Files Needed

### 1. Core Component
- `src/components/SetupWizard.tsx` - Main wizard component
  - See: `docs/setup-wizard-implementation-example.tsx`

### 2. Utilities
- `src/utils/agentDetection.ts` - Agent detection logic
  - See: `docs/setup-wizard-agent-detection-example.ts`

### 3. Type Updates
- `src/types/index.ts` - Add `web` config interface:
  ```typescript
  export interface ConfigurationData {
    // ... existing
    web?: {
      enabled: boolean;
      accessToken?: string;
    };
  }
  ```

### 4. CLI Integration
- `src/cli.tsx` - Add `setup` subcommand and first-run detection

### 5. API Server Updates (if token support)
- `src/services/apiServer.ts` - Check token if configured

---

## Setup Flow

```
1. Welcome
   ↓
2. Enable web interface? [Y/n]
   ↓ (if yes)
3. Port [suggested random]
   ↓
4. Generate access token? [y/N]
   ↓
5. Add current directory as project? [Y/n]
   ↓
6. Detecting agents... (auto)
   ↓
7. Summary → Save config
```

---

## Testing Strategy

1. **Unit tests:**
   - `agentDetection.test.ts` - Test detection logic
   - `SetupWizard.test.tsx` - Test component steps

2. **Integration tests:**
   - First-run flow (no config)
   - Update flow (existing config)
   - All steps completion
   - Cancellation

3. **Manual testing:**
   - With/without agents installed
   - With/without git repo in current dir
   - Config migration scenarios

---

## Next Steps

1. ✅ Review design docs (`setup-wizard-design.md`)
2. ✅ Review implementation example (`setup-wizard-implementation-example.tsx`)
3. ✅ Review agent detection (`setup-wizard-agent-detection-example.ts`)
4. ⬜ Implement `SetupWizard.tsx` component
5. ⬜ Add `setup` subcommand to `cli.tsx`
6. ⬜ Add first-run detection
7. ⬜ Create `agentDetection.ts` utility
8. ⬜ Update config types (add `web` interface)
9. ⬜ Add tests
10. ⬜ Update API server for token support (if needed)

---

## Questions to Resolve

1. **Access token storage:** Store in `config.json` or separate file?
   - **Recommendation:** `config.json` under `web.accessToken` (simpler)

2. **Token validation:** Should API server require token if set?
   - **Recommendation:** Yes, for security

3. **Port range:** Current `generateRandomPort()` uses 10000-65535. Should setup suggest same range?
   - **Recommendation:** Yes, keep consistent

4. **Non-interactive mode:** Add `--yes` flag to skip prompts?
   - **Recommendation:** Future enhancement (not MVP)

---

## References

- Existing wizard: `src/components/NewWorktree.tsx`
- Config management: `src/services/configurationManager.ts`
- Project management: `src/services/projectManager.ts`
- Port generation: `src/constants/env.ts`
- Text input: `src/components/TextInputWrapper.tsx`
