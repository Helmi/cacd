#!/usr/bin/env node
// IMPORTANT: Initialize config dir BEFORE any service imports
// This must be at the very top to ensure singletons use the correct path
import {
	initializeConfigDir,
	getConfigDir,
	isCustomConfigDir,
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
	  $ acd

	Options
	  --help                Show help
	  --version             Show version
	  --port <number>       Port for web interface (overrides config/env)
	  --multi-project       Enable multi-project mode
	  --devc-up-command     Command to start devcontainer
	  --devc-exec-command   Command to execute in devcontainer

	Environment Variables
	  ACD_PORT              Port for web interface
	  ACD_CONFIG_DIR        Configuration directory (default: ~/.config/ccmanager/)
	  ACD_PROJECTS_DIR      Projects directory for multi-project mode

	Examples
	  $ acd
	  $ acd --port 8080
	  $ ACD_CONFIG_DIR=/tmp/acd-dev acd --port 3001
`,
	{
		importMeta: import.meta,
		flags: {
			port: {
				type: 'number',
			},
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
	console.error('Error: acd must be run in an interactive terminal (TTY)');
	process.exit(1);
}

// Check for ACD_PROJECTS_DIR when using --multi-project
// Also auto-enable multi-project mode if the env var is set
if (process.env['ACD_PROJECTS_DIR']) {
	cli.flags.multiProject = true;
} else {
	// Check config if env var is missing
	const multiProjectConfig = configurationManager.getMultiProjectConfig();
	if (multiProjectConfig?.projectsDir) {
		process.env['ACD_PROJECTS_DIR'] = multiProjectConfig.projectsDir;
		// Auto-enable if configured (default to true if projectsDir is set)
		if (multiProjectConfig.enabled !== false) {
			cli.flags.multiProject = true;
		}
	}
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

// Get the preferred outbound IP address by creating a UDP socket
// This returns the IP that would be used to reach the internet
function getExternalIP(): Promise<string | undefined> {
	return new Promise((resolve) => {
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
function getLocalHostname(externalIP: string | undefined): Promise<string | undefined> {
	if (!externalIP) return Promise.resolve(undefined);

	return new Promise((resolve) => {
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
	const address = await apiServer.start(port);
	const externalIP = await getExternalIP();
	const hostname = await getLocalHostname(externalIP);
	webConfig = {
		url: address.replace('0.0.0.0', 'localhost'),
		externalUrl: externalIP ? `http://${externalIP}:${port}` : undefined,
		hostname: hostname ? `http://${hostname}:${port}` : undefined,
		port,
		configDir,
		isCustomConfigDir: customConfigDir,
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
