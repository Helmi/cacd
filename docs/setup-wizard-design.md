# CACD Setup Wizard Design Recommendations

## Overview

This document provides structured recommendations for implementing the `cacd setup` onboarding flow.

## 1. Implementation Approach: Ink TUI vs Readline

### Recommendation: **Simple Readline-based Prompts**

**Rationale:**
- Setup is a **one-time operation** - doesn't need full Ink TUI overhead
- **Simpler code** - no React component lifecycle, state management, or Ink rendering
- **Faster execution** - direct I/O without React reconciliation
- **Better for scripts** - can be piped/automated if needed
- **Consistent with existing CLI commands** - `add`, `remove`, `list` use simple console.log

**When to use Ink:**
- If setup becomes interactive with complex navigation (multi-step wizard with back/forward)
- If you want rich formatting/colors during setup (though chalk works fine)
- If setup needs to integrate with the main TUI

**Code Pattern:**
```typescript
import readline from 'readline';
import {promises as fs} from 'fs';
import {existsSync} from 'fs';
import {randomUUID} from 'crypto';

function question(rl: readline.Interface, query: string): Promise<string> {
  return new Promise(resolve => {
    rl.question(query, resolve);
  });
}

async function setupWizard() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const enableWeb = await question(rl, 'Enable web interface? (y/n) [y]: ');
    // ... rest of questions
  } finally {
    rl.close();
  }
}
```

## 2. CLI Command Structure

### Recommendation: Add `setup` subcommand alongside existing commands

**Implementation in `cli.tsx`:**

```typescript
// After line 92 (subcommand handling)
if (subcommand === 'setup') {
  // Import setup wizard dynamically to avoid loading Ink/React unnecessarily
  const {runSetupWizard} = await import('./utils/setupWizard.js');
  await runSetupWizard();
  process.exit(0);
}

// Update help text (line 33-39):
const cli = meow(
  `
  Usage
    $ cacd                    Launch the TUI
    $ cacd setup             Run first-time setup wizard
    $ cacd add [path]        Add a project (default: current directory)
    $ cacd remove <path>     Remove a project from the list
    $ cacd list              List all tracked projects
  ...
```

**First-run detection:**

Add to `cli.tsx` before subcommand handling:

```typescript
import {existsSync} from 'fs';
import {join} from 'path';
import {getConfigDir} from './utils/configDir.js';

// Check for first-run (no config exists)
const configPath = join(getConfigDir(), 'config.json');
const isFirstRun = !existsSync(configPath);

// If first run and no subcommand, suggest setup
if (isFirstRun && !subcommand) {
  console.log('Welcome to CA⚡CD!');
  console.log('');
  console.log('It looks like this is your first time running CACD.');
  console.log('Run "cacd setup" to configure your installation.');
  console.log('');
  console.log('Or run "cacd" again to launch with defaults.');
  process.exit(0);
}
```

## 3. Config Migration Strategy

### Recommendation: **Non-destructive update with confirmation**

**Approach:**
- If config exists, ask user if they want to update settings
- Show current values and allow skipping questions
- Only update fields user explicitly changes
- Preserve existing projects, hooks, shortcuts

**Code Pattern:**

```typescript
async function runSetupWizard() {
  const configExists = existsSync(configPath);
  const isUpdate = configExists;
  
  if (isUpdate) {
    console.log('Configuration already exists.');
    const proceed = await question(rl, 'Update settings? (y/n) [n]: ');
    if (proceed.toLowerCase() !== 'y') {
      console.log('Setup cancelled.');
      return;
    }
    console.log('');
  }
  
  // Load existing config if updating
  let currentConfig: ConfigurationData = {};
  if (isUpdate) {
    try {
      const configData = readFileSync(configPath, 'utf-8');
      currentConfig = JSON.parse(configData);
    } catch (err) {
      console.error('Failed to load existing config:', err);
      return;
    }
  }
  
  // Questions with defaults from existing config
  const enableWeb = await question(
    rl,
    `Enable web interface? (y/n) [${currentConfig.port ? 'y' : 'y'}]: `
  );
  
  // Only update if changed
  if (enableWeb.toLowerCase() === 'y' || enableWeb === '') {
    // Ask for port...
  }
}
```

## 4. Agent Detection

### Recommendation: **Check PATH using `which` command**

**Implementation:**

```typescript
import {execSync} from 'child_process';

function detectInstalledAgents(agents: AgentConfig[]): AgentConfig[] {
  const installed: AgentConfig[] = [];
  
  for (const agent of agents) {
    // Skip terminal agent (always available)
    if (agent.kind === 'terminal') {
      installed.push(agent);
      continue;
    }
    
    // Check if command exists in PATH
    try {
      const command = agent.command === '$SHELL' 
        ? process.env.SHELL || '/bin/sh'
        : agent.command;
      
      execSync(`which ${command}`, {stdio: 'ignore'});
      installed.push(agent);
    } catch {
      // Command not found - skip
    }
  }
  
  return installed;
}
```

**Usage in setup:**

```typescript
// Auto-detect installed agents
const defaultAgents = configurationManager.getAgents();
const installedAgents = detectInstalledAgents(defaultAgents);

console.log('\nDetected agents:');
for (const agent of installedAgents) {
  console.log(`  ✓ ${agent.name} (${agent.command})`);
}

// Update config with detected agents
const agentsConfig: AgentsConfig = {
  agents: installedAgents,
  defaultAgentId: installedAgents[0]?.id || 'terminal',
  schemaVersion: 1,
};
configurationManager.setAgentsConfig(agentsConfig);
```

## 5. Complete Implementation Example

### File: `src/utils/setupWizard.ts`

```typescript
import readline from 'readline';
import {existsSync, readFileSync} from 'fs';
import {join} from 'path';
import {randomUUID} from 'crypto';
import {execSync} from 'child_process';
import {getConfigDir} from './configDir.js';
import {configurationManager} from '../services/configurationManager.js';
import {projectManager} from '../services/projectManager.js';
import {generateRandomPort} from '../constants/env.js';
import type {AgentConfig, AgentsConfig, ConfigurationData} from '../types/index.js';

function question(rl: readline.Interface, query: string): Promise<string> {
  return new Promise(resolve => {
    rl.question(query, resolve);
  });
}

function detectInstalledAgents(agents: AgentConfig[]): AgentConfig[] {
  const installed: AgentConfig[] = [];
  
  for (const agent of agents) {
    if (agent.kind === 'terminal') {
      installed.push(agent);
      continue;
    }
    
    try {
      const command = agent.command === '$SHELL' 
        ? process.env.SHELL || '/bin/sh'
        : agent.command;
      
      execSync(`which ${command}`, {stdio: 'ignore'});
      installed.push(agent);
    } catch {
      // Command not found
    }
  }
  
  return installed;
}

function isGitRepository(path: string): boolean {
  return existsSync(join(path, '.git'));
}

export async function runSetupWizard(): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const configDir = getConfigDir();
    const configPath = join(configDir, 'config.json');
    const configExists = existsSync(configPath);
    const isUpdate = configExists;

    // Welcome message
    console.log('');
    console.log('╔════════════════════════════════════════╗');
    console.log('║   CA⚡CD Setup Wizard                    ║');
    console.log('╚════════════════════════════════════════╝');
    console.log('');

    if (isUpdate) {
      console.log('Configuration already exists.');
      const proceed = await question(rl, 'Update settings? (y/n) [n]: ');
      if (proceed.toLowerCase() !== 'y') {
        console.log('Setup cancelled.');
        return;
      }
      console.log('');
    }

    // Load existing config if updating
    let currentConfig: ConfigurationData = {};
    if (isUpdate) {
      try {
        const configData = readFileSync(configPath, 'utf-8');
        currentConfig = JSON.parse(configData);
      } catch (err) {
        console.error('Failed to load existing config:', err);
        return;
      }
    }

    // Question 1: Enable web interface
    const enableWebDefault = currentConfig.port ? 'y' : 'y';
    const enableWebAnswer = await question(
      rl,
      `Enable web interface? (y/n) [${enableWebDefault}]: `
    );
    const enableWeb = enableWebAnswer.toLowerCase() !== 'n';

    let port: number | undefined;
    let accessToken: string | undefined;

    if (enableWeb) {
      // Question 2: Port
      const currentPort = currentConfig.port || generateRandomPort();
      const portAnswer = await question(
        rl,
        `Web interface port [${currentPort}]: `
      );
      
      const parsedPort = portAnswer.trim() 
        ? parseInt(portAnswer.trim(), 10)
        : currentPort;
      
      if (isNaN(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
        console.error(`Invalid port: ${parsedPort}. Using default: ${currentPort}`);
        port = currentPort;
      } else {
        port = parsedPort;
      }

      // Question 3: Generate access token
      const tokenAnswer = await question(
        rl,
        'Generate access token for web interface? (y/n) [y]: '
      );
      
      if (tokenAnswer.toLowerCase() !== 'n') {
        accessToken = randomUUID();
        console.log(`  Token: ${accessToken}`);
        console.log(`  URL: http://localhost:${port}?token=${accessToken}`);
      }
    }

    // Question 4: Add current directory as project
    const currentDir = process.cwd();
    const isCurrentDirGitRepo = isGitRepository(currentDir);
    const alreadyAdded = projectManager.hasProject(currentDir);

    if (isCurrentDirGitRepo && !alreadyAdded) {
      const addProjectAnswer = await question(
        rl,
        `Add current directory as first project? (${currentDir}) (y/n) [y]: `
      );
      
      if (addProjectAnswer.toLowerCase() !== 'n') {
        const project = projectManager.addProject(currentDir);
        if (project) {
          console.log(`  ✓ Added project: ${project.name}`);
        }
      }
    }

    // Auto-detect agents
    console.log('');
    console.log('Detecting installed agents...');
    const defaultAgents = configurationManager.getAgents();
    const installedAgents = detectInstalledAgents(defaultAgents);

    if (installedAgents.length > 0) {
      console.log('Detected agents:');
      for (const agent of installedAgents) {
        console.log(`  ✓ ${agent.name} (${agent.command})`);
      }
    } else {
      console.log('  No agents detected. Terminal will be available.');
    }

    // Write config
    console.log('');
    console.log('Saving configuration...');

    if (port !== undefined) {
      configurationManager.setPort(port);
    }

    // Update agents config with detected agents
    const agentsConfig: AgentsConfig = {
      agents: installedAgents.length > 0 
        ? installedAgents 
        : defaultAgents.filter(a => a.kind === 'terminal'), // At least keep terminal
      defaultAgentId: installedAgents[0]?.id || 'terminal',
      schemaVersion: 1,
    };
    configurationManager.setAgentsConfig(agentsConfig);

    // Store token if generated (you'll need to add this to config structure)
    // For now, token is generated on server startup, so this is informational

    // Summary
    console.log('');
    console.log('╔════════════════════════════════════════╗');
    console.log('║   Setup Complete!                      ║');
    console.log('╚════════════════════════════════════════╝');
    console.log('');
    console.log('Configuration saved to:');
    console.log(`  ${configPath}`);
    console.log('');
    
    if (enableWeb) {
      console.log('Web interface:');
      console.log(`  Port: ${port}`);
      if (accessToken) {
        console.log(`  Token: ${accessToken}`);
        console.log(`  URL: http://localhost:${port}?token=${accessToken}`);
      } else {
        console.log('  Token: Generated on server startup');
      }
      console.log('');
    }

    console.log('Next steps:');
    console.log('  1. Run "cacd" to launch the TUI');
    if (enableWeb) {
      console.log(`  2. Open http://localhost:${port} in your browser`);
    }
    console.log('  3. Add more projects with "cacd add <path>"');
    console.log('');

  } catch (error) {
    console.error('Setup failed:', error);
    throw error;
  } finally {
    rl.close();
  }
}
```

## 6. Code Patterns from Similar CLI Tools

### Inspiration: `npm init`, `git config --global`, `gh auth login`

**Patterns to adopt:**

1. **Non-destructive updates**: Always show current values, allow skipping
2. **Sensible defaults**: Pre-fill with smart defaults (detect git repo, random port)
3. **Clear success message**: Show what was configured and next steps
4. **Graceful cancellation**: Allow Ctrl+C without breaking config
5. **Idempotent**: Can run multiple times safely

**Example from `gh auth login`:**
- Shows current auth status
- Asks if user wants to proceed
- Provides clear next steps after completion

## 7. Additional Considerations

### Token Storage

**Current behavior:** Token is generated on server startup in `apiServer.ts` (line 32).

**Recommendation:** 
- Keep token generation on startup (simpler)
- Setup wizard can show that token will be generated
- Optionally: Store token in config for persistence across restarts (requires API server changes)

### Port Range

**Current:** `generateRandomPort()` uses 10000-65535 (from `env.ts`)

**Setup wizard:** Should suggest random port in same range, but allow user override to any valid port (1-65535).

### Error Handling

- Validate all inputs before saving
- Show clear error messages
- Don't corrupt existing config on failure
- Use try/catch around file operations

### Testing

- Test with existing config (update flow)
- Test with no config (first-run flow)
- Test with invalid inputs
- Test cancellation (Ctrl+C)
- Mock `which` command for agent detection tests

## 8. Migration Path

1. **Phase 1**: Implement basic setup wizard with readline
2. **Phase 2**: Add first-run detection in `cli.tsx`
3. **Phase 3**: Test with real configs and edge cases
4. **Phase 4**: (Optional) Add token persistence if needed
5. **Phase 5**: (Optional) Enhance with Ink if wizard becomes complex

## Summary

- ✅ Use **readline** for simple, fast setup prompts
- ✅ Add `setup` subcommand in `cli.tsx` alongside `add`/`remove`/`list`
- ✅ **Non-destructive updates** - show current values, allow skipping
- ✅ **Agent detection** via `which` command
- ✅ **Git repo detection** for current directory
- ✅ **Clear summary** with next steps after completion
