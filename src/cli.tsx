#!/usr/bin/env node
// IMPORTANT: Initialize config dir BEFORE any service imports
// This must be at the very top to ensure singletons use the correct path
import {
	initializeConfigDir,
	getConfigDir,
	isCustomConfigDir,
	isDevModeConfig,
} from './utils/configDir.js';
import dgram from 'dgram';
import dns from 'dns';
import os from 'os';

// Initialize config dir immediately - this is safe because configDir.js has no dependencies
initializeConfigDir();

// Now dynamically import services that depend on config directory
// This ensures they're loaded AFTER initializeConfigDir() runs
const {default: React} = await import('react');
const {render} = await import('ink');
const {default: meow} = await import('meow');
const {default: App} = await import('./components/App.js');
const {worktreeConfigManager} = await import(
	'./services/worktreeConfigManager.js'
);
const {configurationManager} = await import(
	'./services/configurationManager.js'
);
const {globalSessionOrchestrator} = await import(
	'./services/globalSessionOrchestrator.js'
);
const {apiServer} = await import('./services/apiServer.js');
const {ENV_VARS, generateRandomPort} = await import('./constants/env.js');

const cli = meow(
	`
	Usage
	  $ cacd                    Launch the TUI
	  $ cacd add [path]         Add a project (default: current directory)
	  $ cacd remove <path>      Remove a project from the list
	  $ cacd list               List all tracked projects

	Options
	  --help                Show help
	  --version             Show version
	  --port <number>       Port for web interface (overrides config/env)
	  --devc-up-command     Command to start devcontainer
	  --devc-exec-command   Command to execute in devcontainer

	Environment Variables
	  CACD_CONFIG_DIR        Custom config directory path (overrides all defaults)
	  CACD_PORT              Port for web interface
	  CACD_DEV               Set to 1 for dev mode (uses local .cacd-dev/ config)

	Examples
	  $ cacd                         # Launch TUI
	  $ cacd add                     # Add current directory as project
	  $ cacd add /path/to/project    # Add specific project
	  $ cacd list                    # Show tracked projects
	  $ cacd --port 8080             # Launch TUI on specific port
`,
	{
		importMeta: import.meta,
		flags: {
			port: {
				type: 'number',
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

// Import projectManager for CLI subcommands
const {projectManager} = await import('./services/projectManager.js');

// Handle CLI subcommands (add, remove, list)
const subcommand = cli.input[0];

if (subcommand === 'add') {
	// Add project - use provided path or current directory
	const projectPath = cli.input[1] || process.cwd();
	const result = projectManager.addProject(projectPath);
	if (result) {
		console.log(`✓ Added project: ${result.name}`);
		console.log(`  Path: ${result.path}`);
	} else {
		console.error(`✗ Failed to add project: ${projectPath}`);
		console.error('  Not a valid git repository (no .git directory found)');
		process.exit(1);
	}
	process.exit(0);
}

if (subcommand === 'remove') {
	// Remove project - require path argument
	const projectPath = cli.input[1];
	if (!projectPath) {
		console.error('Error: Path required for remove command');
		console.error('Usage: cacd remove <path>');
		process.exit(1);
	}
	const removed = projectManager.removeProject(projectPath);
	if (removed) {
		console.log(`✓ Removed project: ${projectPath}`);
	} else {
		console.error(`✗ Project not found: ${projectPath}`);
		process.exit(1);
	}
	process.exit(0);
}

if (subcommand === 'list') {
	// Validate projects first to show current isValid status
	projectManager.instance.validateProjects();
	// List all projects
	const projects = projectManager.getProjects();
	if (projects.length === 0) {
		console.log('No projects tracked yet.');
		console.log('');
		console.log('Add a project with:');
		console.log('  cacd add .              # Add current directory');
		console.log('  cacd add /path/to/repo  # Add specific path');
	} else {
		console.log(`Tracked projects (${projects.length}):`);
		console.log('');
		for (const project of projects) {
			const validIndicator = project.isValid === false ? ' ⚠️  (invalid)' : '';
			console.log(`  ${project.name}${validIndicator}`);
			console.log(`    ${project.path}`);
			if (project.description) {
				console.log(`    ${project.description}`);
			}
		}
	}
	process.exit(0);
}

// If there's an unrecognized subcommand, show error
if (subcommand && !['add', 'remove', 'list'].includes(subcommand)) {
	console.error(`Unknown command: ${subcommand}`);
	console.error('');
	console.error('Available commands:');
	console.error('  cacd add [path]    Add a project');
	console.error('  cacd remove <path> Remove a project');
	console.error('  cacd list          List projects');
	console.error('  cacd               Launch TUI');
	process.exit(1);
}

// If no subcommand, continue to TUI - check TTY
if (!process.stdin.isTTY || !process.stdout.isTTY) {
	console.error('Error: cacd must be run in an interactive terminal (TTY)');
	process.exit(1);
}

// Resolve port with precedence: CLI flag > env var > config > generate random
function resolvePort(): number {
	// 1. CLI flag takes highest precedence
	if (cli.flags.port !== undefined) {
		return cli.flags.port;
	}

	// 2. Environment variable
	const envPort = process.env[ENV_VARS.PORT];
	if (envPort) {
		const parsed = parseInt(envPort, 10);
		if (!isNaN(parsed)) {
			return parsed;
		}
	}

	// 3. Config file
	const configPort = configurationManager.getPort();
	if (configPort !== undefined) {
		return configPort;
	}

	// 4. Generate random port and persist to config
	const randomPort = generateRandomPort();
	configurationManager.setPort(randomPort);
	return randomPort;
}

const port = resolvePort();

// Validate port
if (isNaN(port) || port < 1 || port > 65535) {
	console.error(`Error: Invalid port number: ${port}`);
	console.error(`Port must be between 1 and 65535`);
	process.exit(1);
}

// Initialize worktree config manager
worktreeConfigManager.initialize();

// Get config dir info for display
const configDir = getConfigDir();
const customConfigDir = isCustomConfigDir();
const devModeActive = isDevModeConfig();

// Get the preferred outbound IP address by creating a UDP socket
// This returns the IP that would be used to reach the internet
function getExternalIP(): Promise<string | undefined> {
	return new Promise(resolve => {
		const socket = dgram.createSocket('udp4');
		socket.connect(80, '8.8.8.8', () => {
			const addr = socket.address();
			socket.close();
			resolve(typeof addr === 'string' ? undefined : addr.address);
		});
		socket.on('error', () => {
			socket.close();
			resolve(undefined);
		});
	});
}

// Get local hostname if it resolves to the same IP as our external IP
function getLocalHostname(
	externalIP: string | undefined,
): Promise<string | undefined> {
	if (!externalIP) return Promise.resolve(undefined);

	return new Promise(resolve => {
		const hostname = os.hostname();
		// Try to resolve the hostname to IPv4
		dns.lookup(hostname, {family: 4}, (err, addr) => {
			if (!err && addr === externalIP) {
				resolve(hostname);
			} else {
				resolve(undefined);
			}
		});
	});
}

// Start API Server
let webConfig = undefined;

try {
	const result = await apiServer.start(port, '0.0.0.0', devModeActive);
	const actualPort = result.port;

	// In dev mode, persist the port that was actually used (for next restart)
	if (devModeActive && actualPort !== port) {
		configurationManager.setPort(actualPort);
	}

	const externalIP = await getExternalIP();
	const hostname = await getLocalHostname(externalIP);
	webConfig = {
		url: result.address.replace('0.0.0.0', 'localhost'),
		externalUrl: externalIP ? `http://${externalIP}:${actualPort}` : undefined,
		hostname: hostname ? `http://${hostname}:${actualPort}` : undefined,
		port: actualPort,
		configDir,
		isCustomConfigDir: customConfigDir,
		isDevMode: devModeActive,
	};
} catch (_err) {
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
	webConfig,
};

const app = render(React.createElement(App, appProps));

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
