#!/usr/bin/env node
import React from 'react';
import {render} from 'ink';
import meow from 'meow';
import App from './components/App.js';
import {worktreeConfigManager} from './services/worktreeConfigManager.js';
import {globalSessionOrchestrator} from './services/globalSessionOrchestrator.js';
import {apiServer} from './services/apiServer.js';

const cli = meow(
	`
	Usage
	  $ ccmanager

	Options
	  --help                Show help
	  --version             Show version
	  --multi-project       Enable multi-project mode
	  --web                 Start the web interface
	  --devc-up-command     Command to start devcontainer
	  --devc-exec-command   Command to execute in devcontainer

	Examples
	  $ ccmanager
	  $ ccmanager --multi-project
	  $ ccmanager --web
	  $ ccmanager --devc-up-command "devcontainer up --workspace-folder ." --devc-exec-command "devcontainer exec --workspace-folder ."
`,
	{
		importMeta: import.meta,
		flags: {
			multiProject: {
				type: 'boolean',
				default: false,
			},
			devcUpCommand: {
				type: 'string',
			},
			devcExecCommand: {
				type: 'string',
			},
		},
	},
);

// Validate devcontainer arguments using XOR
if (!!cli.flags.devcUpCommand !== !!cli.flags.devcExecCommand) {
	console.error(
		'Error: Both --devc-up-command and --devc-exec-command must be provided together',
	);
	process.exit(1);
}

// Check if we're in a TTY environment
if (!process.stdin.isTTY || !process.stdout.isTTY) {
	console.error(
		'Error: ccmanager must be run in an interactive terminal (TTY)',
	);
	process.exit(1);
}

// Check for ACD_PROJECTS_DIR when using --multi-project
// Also auto-enable multi-project mode if the env var is set
if (process.env['ACD_PROJECTS_DIR']) {
	cli.flags.multiProject = true;
}

if (cli.flags.multiProject && !process.env['ACD_PROJECTS_DIR']) {
	console.error(
		'Error: ACD_PROJECTS_DIR environment variable must be set when using --multi-project',
	);
	console.error(
		'Please set it to the root directory containing your projects, e.g.:',
	);
	console.error('  export ACD_PROJECTS_DIR=/path/to/projects');
	process.exit(1);
}

// Initialize worktree config manager
worktreeConfigManager.initialize();

// Start API Server
const port = 3000;
let webConfig = undefined;

try {
	// Start on default port 3000
	const address = await apiServer.start(port);
	webConfig = {
		url: address.replace('0.0.0.0', 'localhost'),
		token: apiServer.getToken(),
	};
} catch (err) {
	// Log error but don't fail startup
	// We can't see this log easily in TUI mode, but it's there for debugging if redirected
}

// Prepare devcontainer config
const devcontainerConfig =
	cli.flags.devcUpCommand && cli.flags.devcExecCommand
		? {
				upCommand: cli.flags.devcUpCommand,
				execCommand: cli.flags.devcExecCommand,
			}
		: undefined;

// Pass config to App
const appProps = {
	...(devcontainerConfig ? {devcontainerConfig} : {}),
	multiProject: cli.flags.multiProject,
	webConfig,
};

const app = render(<App {...appProps} />);

// Clean up sessions on exit
process.on('SIGINT', () => {
	globalSessionOrchestrator.destroyAllSessions();
	app.unmount();
	process.exit(0);
});

process.on('SIGTERM', () => {
	globalSessionOrchestrator.destroyAllSessions();
	app.unmount();
	process.exit(0);
});

// Export for testing
export const parsedArgs = cli;
