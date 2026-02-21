#!/usr/bin/env node
// IMPORTANT: Initialize config dir BEFORE any service imports
// This must be at the very top to ensure singletons use the correct path
import {
	initializeConfigDir,
	getConfigDir,
	isCustomConfigDir,
	isDevModeConfig,
} from './utils/configDir.js';
import {existsSync} from 'fs';
import dgram from 'dgram';
import dns from 'dns';
import os from 'os';
import {join} from 'path';
import {
	cleanupDaemonPidFile,
	getDaemonPidFilePath,
	isProcessRunning,
	prepareDaemonPidFile,
	readDaemonPidFile,
} from './utils/daemonLifecycle.js';
import {
	buildDaemonWebConfig,
	ensureDaemonForTui,
	spawnDetachedDaemon,
	waitForDaemonApiReady,
	waitForDaemonPid,
	type DaemonWebConfig,
} from './utils/daemonControl.js';
import {OutputFormatter} from './cli/formatter.js';
import {runRegisteredCommand, getRegisteredCommands} from './cli/commands/index.js';
import {runSetupCommand} from './cli/commands/setup.js';
import type {CliCommandContext, CliFlags, CliRuntimeServices} from './cli/types.js';

// Initialize config dir immediately - this is safe because configDir.js has no dependencies
initializeConfigDir();

// Check for first-run BEFORE importing services that auto-create config
const configDir = getConfigDir();
const configPath = join(configDir, 'config.json');
const isFirstRun = !existsSync(configPath);

// Parse CLI args early to check for setup subcommand
const {default: meow} = await import('meow');

const cli = meow(
	`
  Usage
    $ cacd                      Start daemon in background
    $ cacd start                Start daemon in background
    $ cacd stop                 Stop running daemon
    $ cacd status               Show daemon status
    $ cacd status --sessions    Show daemon status and active sessions
    $ cacd sessions list        List active sessions
    $ cacd sessions show <id>   Show one active session
    $ cacd agents list          List agents and their active sessions
    $ cacd restart              Restart daemon
    $ cacd tui                  Launch TUI (daemon must already be running)
    $ cacd daemon               Run daemon in foreground (for service managers)
    $ cacd setup                Run first-time setup wizard
    $ cacd add [path]           Add a project (alias for 'cacd project add')
    $ cacd remove <path>        Remove a project (alias for 'cacd project remove')
    $ cacd list                 List projects (alias for 'cacd project list')
    $ cacd project add [path]   Add a project
    $ cacd project list         List tracked projects
    $ cacd project remove <path> Remove a project
    $ cacd project configure <path> [--name <name>] [--description <desc>]
    $ cacd auth <command>       Manage WebUI authentication

  Auth Commands
    $ cacd auth show              Display access URL
    $ cacd auth reset-passcode    Reset your passcode
    $ cacd auth regenerate-token  Generate new access token (careful!)

  Options
    --help                  Show help
    --version               Show version
    --port <number>         Port for web interface (overrides config/env)
    --headless              Run API server only (legacy alias for 'daemon')
    --sessions              Include active sessions in status output
    --devc-up-command       Command to start devcontainer
    --devc-exec-command     Command to execute in devcontainer
    --json                  Output machine-readable JSON for query commands
    --name <name>           Project name (for 'cacd project configure')
    --description <desc>    Project description (for 'cacd project configure')

  Setup Options (for 'cacd setup')
    --no-web               Disable web interface
    --project <path>       Add specified path as first project
    --skip-project         Don't add any project
    --force                Overwrite existing config without asking

  Environment Variables
    CACD_CONFIG_DIR        Custom config directory (highest priority, overrides CACD_DEV)
    CACD_PORT              Port for web interface
    CACD_DEV               Set to 1 for dev mode (uses local .cacd-dev/ config)

  Examples
    $ cacd                        # Start daemon in background
    $ cacd start                  # Start daemon in background
    $ cacd status                 # Check daemon status
    $ cacd status --sessions      # Show daemon + active sessions
    $ cacd sessions list          # List active sessions
    $ cacd sessions show session-123
    $ cacd agents list --json
    $ cacd stop                   # Stop daemon
    $ cacd tui                    # Launch TUI (requires running daemon)
    $ cacd daemon                 # Foreground daemon mode for systemd/launchd
    $ cacd setup --port 8080      # Setup with custom port
    $ cacd add                    # Add current directory as project
    $ cacd add /path/to/project   # Add specific project
    $ cacd project list           # Show tracked projects
    $ cacd project configure /path/to/project --name "My Project"
    $ cacd auth show              # Show WebUI access URL
	`,
	{
		importMeta: import.meta,
		flags: {
			port: {
				type: 'number',
			},
			headless: {
				type: 'boolean',
				default: false,
			},
			sessions: {
				type: 'boolean',
				default: false,
			},
			devcUpCommand: {
				type: 'string',
			},
			devcExecCommand: {
				type: 'string',
			},
			json: {
				type: 'boolean',
				default: false,
			},
			// Setup flags
			noWeb: {
				type: 'boolean',
				default: false,
			},
			project: {
				type: 'string',
			},
			skipProject: {
				type: 'boolean',
				default: false,
			},
			force: {
				type: 'boolean',
				default: false,
			},
			name: {
				type: 'string',
			},
			description: {
				type: 'string',
			},
		},
	},
);

const parsedCliArgs = {
	input: cli.input,
	flags: cli.flags as CliFlags,
};
const formatter = new OutputFormatter(parsedCliArgs.flags.json);

// Validate devcontainer arguments using XOR
if (
	!!parsedCliArgs.flags.devcUpCommand !== !!parsedCliArgs.flags.devcExecCommand
) {
	formatter.writeError({
		text: [
			'Error: Both --devc-up-command and --devc-exec-command must be provided together',
		],
		data: {
			ok: false,
			error: {
				message:
					'Both --devc-up-command and --devc-exec-command must be provided together',
			},
		},
	});
	process.exit(1);
}

// Handle CLI subcommands
const rawSubcommand = parsedCliArgs.input[0];
const subcommand =
	parsedCliArgs.flags.headless && rawSubcommand === undefined
		? 'daemon'
		: rawSubcommand ?? 'start';
const isDaemonMode = subcommand === 'daemon';
const isTuiOnlyMode = subcommand === 'tui';

// Handle setup subcommand BEFORE importing services (which auto-create config)
if (subcommand === 'setup') {
	const setupResult = await runSetupCommand(
		{
			port: parsedCliArgs.flags.port,
			noWeb: parsedCliArgs.flags.noWeb,
			skipProject: parsedCliArgs.flags.skipProject,
			project: parsedCliArgs.flags.project,
			force: parsedCliArgs.flags.force,
		},
		formatter,
	);

	if (setupResult.skipped) {
		if (!process.stdin.isTTY) {
			process.exit(1);
		}
	} else {
		process.exit(0);
	}
}

// First-run detection: for daemon start mode, run setup automatically
// This runs BEFORE importing services that auto-create config
if (isFirstRun && subcommand === 'start') {
	console.log('No configuration found. Running setup...');
	const {runSetup} = await import('./services/setupService.js');
	await runSetup({});
	console.log('');
	// Continue to start the app after setup
}

// Now import services that need config (after setup has run if needed)
const {projectManager} = await import('./services/projectManager.js');
const {worktreeConfigManager} = await import('./services/worktreeConfigManager.js');
const {configurationManager} = await import('./services/configurationManager.js');
const {globalSessionOrchestrator} = await import(
	'./services/globalSessionOrchestrator.js'
);
const {apiServer} = await import('./services/apiServer.js');
const {ENV_VARS, generateRandomPort} = await import('./constants/env.js');

const knownCommands = new Set([
	...getRegisteredCommands(),
	'setup',
	'daemon',
	'tui',
]);

if (subcommand && !knownCommands.has(subcommand)) {
	formatter.writeError({
		text: [
			`Unknown command: ${subcommand}`,
			'',
			'Available commands:',
			'  cacd start         Start daemon in background',
			'  cacd stop          Stop daemon',
			'  cacd status        Show daemon status',
			'  cacd sessions      Query active sessions',
			'  cacd agents        Query configured agents',
			'  cacd restart       Restart daemon',
			'  cacd setup         Run first-time setup',
			'  cacd add [path]    Add a project',
			'  cacd remove <path> Remove a project',
			'  cacd list          List projects',
			'  cacd project ...   Project subcommands',
			'  cacd auth <cmd>    Manage WebUI auth',
			'  cacd tui           Launch TUI (daemon required)',
			'  cacd daemon        Run API server in foreground',
			'  cacd               Start daemon in background',
		],
		data: {
			ok: false,
			command: subcommand,
			error: {
				message: `Unknown command: ${subcommand}`,
				availableCommands: [
					'start',
					'stop',
					'status',
					'sessions',
					'agents',
					'restart',
					'setup',
					'add',
					'remove',
					'list',
					'project',
					'auth',
					'tui',
					'daemon',
				],
			},
		},
	});
	process.exit(1);
}

// Resolve port with precedence: CLI flag > env var > config > generate random
function resolvePort(): number {
	if (parsedCliArgs.flags.port !== undefined) {
		return parsedCliArgs.flags.port;
	}

	const envPort = process.env[ENV_VARS.PORT];
	if (envPort) {
		const parsed = parseInt(envPort, 10);
		if (!isNaN(parsed)) {
			return parsed;
		}
	}

	const configPort = configurationManager.getPort();
	if (configPort !== undefined) {
		return configPort;
	}

	const randomPort = generateRandomPort();
	configurationManager.setPort(randomPort);
	return randomPort;
}

const port = resolvePort();

// Validate port
if (isNaN(port) || port < 1 || port > 65535) {
	formatter.writeError({
		text: [
			`Error: Invalid port number: ${port}`,
			'Port must be between 1 and 65535',
		],
		data: {
			ok: false,
			error: {
				message: `Invalid port number: ${port}`,
			},
		},
	});
	process.exit(1);
}

// Get the preferred outbound IP address by creating a UDP socket
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
		dns.lookup(hostname, {family: 4}, (err, addr) => {
			if (!err && addr === externalIP) {
				resolve(hostname);
			} else {
				resolve(undefined);
			}
		});
	});
}

async function withNetworkLinks(
	baseConfig: DaemonWebConfig,
	token: string | undefined,
): Promise<DaemonWebConfig> {
	const externalIP = await getExternalIP();
	const hostname = await getLocalHostname(externalIP);
	const tokenPath = token ? `/${token}` : '';

	return {
		...baseConfig,
		externalUrl: externalIP
			? `http://${externalIP}:${baseConfig.port}${tokenPath}`
			: undefined,
		hostname: hostname
			? `http://${hostname}:${baseConfig.port}${tokenPath}`
			: undefined,
	};
}

// Get config dir info for display (configDir already defined at top of file)
const customConfigDir = isCustomConfigDir();
const devModeActive = isDevModeConfig();
const accessToken = configurationManager.getConfiguration().accessToken;
const daemonPidFilePath = getDaemonPidFilePath(configDir);
const daemonLogPath = join(configDir, 'daemon.log');

const services: CliRuntimeServices = {
	projectManager,
	configurationManager,
	worktreeConfigManager,
	globalSessionOrchestrator,
	apiServer,
};

const commandContext: CliCommandContext = {
	subcommand,
	parsedArgs: parsedCliArgs,
	formatter,
	port,
	configDir,
	customConfigDir,
	devModeActive,
	accessToken,
	daemonPidFilePath,
	daemonLogPath,
	entrypointPath: process.argv[1],
	services,
	daemon: {
		lifecycle: {
			prepareDaemonPidFile,
			cleanupDaemonPidFile,
			readDaemonPidFile,
			isProcessRunning,
		},
		control: {
			buildDaemonWebConfig,
			ensureDaemonForTui,
			spawnDetachedDaemon,
			waitForDaemonPid,
			waitForDaemonApiReady,
		},
	},
};

const commandResult = await runRegisteredCommand(commandContext);
if (commandResult !== undefined) {
	process.exit(commandResult);
}

// If no daemon mode, continue to TUI - check TTY
if (!isDaemonMode && (!process.stdin.isTTY || !process.stdout.isTTY)) {
	formatter.writeError({
		text: [
			'Error: cacd must be run in an interactive terminal (TTY)',
			'Use `cacd start` to run daemon in background',
		],
		data: {
			ok: false,
			error: {
				message: 'cacd must be run in an interactive terminal (TTY)',
			},
		},
	});
	process.exit(1);
}

// Initialize worktree config manager
worktreeConfigManager.initialize();

let webConfig: DaemonWebConfig | undefined;

if (isDaemonMode) {
	try {
		const result = await apiServer.start(port, '0.0.0.0', devModeActive);
		const actualPort = result.port;

		if (devModeActive && actualPort !== port) {
			configurationManager.setPort(actualPort);
		}

		webConfig = await withNetworkLinks(
			{
				url:
					result.address.replace('0.0.0.0', 'localhost') +
					(accessToken ? `/${accessToken}` : ''),
				port: actualPort,
				configDir,
				isCustomConfigDir: customConfigDir,
				isDevMode: devModeActive,
			},
			accessToken,
		);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		formatter.writeError({
			text: [`Failed to start daemon API server: ${message}`],
			data: {
				ok: false,
				command: 'daemon',
				error: {
					message,
				},
			},
		});
		process.exit(1);
	}
} else {
	try {
		const daemonConnection = await ensureDaemonForTui({
			configDir,
			port,
			accessToken,
			isCustomConfigDir: customConfigDir,
			isDevMode: devModeActive,
			autoStart: !isTuiOnlyMode,
		});
		webConfig = await withNetworkLinks(daemonConnection.webConfig, accessToken);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		const prefix = isTuiOnlyMode
			? 'Failed to connect TUI to daemon'
			: 'Failed to start or connect to daemon';
		formatter.writeError({
			text: [`${prefix}: ${message}`],
			data: {
				ok: false,
				command: subcommand,
				error: {
					message: `${prefix}: ${message}`,
				},
			},
		});
		process.exit(1);
	}
}

// Prepare devcontainer config
const devcontainerConfig =
	parsedCliArgs.flags.devcUpCommand && parsedCliArgs.flags.devcExecCommand
		? {
				upCommand: parsedCliArgs.flags.devcUpCommand,
				execCommand: parsedCliArgs.flags.devcExecCommand,
			}
		: undefined;

// Pass config to App
const appProps = {
	...(devcontainerConfig ? {devcontainerConfig} : {}),
	webConfig,
};

// In daemon mode, run API server only without TUI
if (isDaemonMode) {
	const daemonPid = process.pid;

	try {
		await prepareDaemonPidFile(daemonPidFilePath, daemonPid);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		formatter.writeError({
			text: [`Failed to initialize daemon PID file: ${message}`],
			data: {
				ok: false,
				command: 'daemon',
				error: {
					message,
				},
			},
		});
		process.exit(1);
	}

	formatter.write({
		text: [
			'CA⚡CD daemon started',
			`Local URL:    ${webConfig?.url || `http://localhost:${port}`}`,
			`Token:        ${accessToken || '(none configured)'}`,
			`External URL: ${webConfig?.externalUrl || '(unavailable)'}`,
			`PID:          ${daemonPid}`,
			`Config Dir:   ${configDir}`,
			`PID File:     ${daemonPidFilePath}`,
			'',
			'Use SIGTERM or Ctrl+C to stop',
		],
		data: {
			ok: true,
			command: 'daemon',
			pid: daemonPid,
			webConfig,
			accessToken,
			configDir,
			pidFile: daemonPidFilePath,
		},
	});

	let isShuttingDown = false;
	const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
		if (isShuttingDown) {
			return;
		}
		isShuttingDown = true;
		console.log(`\nReceived ${signal}, shutting down...`);

		try {
			globalSessionOrchestrator.destroyAllSessions();
		} finally {
			try {
				await cleanupDaemonPidFile(daemonPidFilePath, daemonPid);
			} finally {
				process.exit(0);
			}
		}
	};

	process.on('SIGINT', () => {
		void shutdown('SIGINT');
	});

	process.on('SIGTERM', () => {
		void shutdown('SIGTERM');
	});
} else {
	if (!webConfig) {
		formatter.writeError({
			text: ['Failed to configure TUI daemon connection'],
			data: {
				ok: false,
				error: {
					message: 'Failed to configure TUI daemon connection',
				},
			},
		});
		process.exit(1);
	}

	// Normal TUI mode - import ink and React only when needed
	const {default: React} = await import('react');
	const {render} = await import('ink');
	const {default: App} = await import('./components/App.js');

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
}

// Export for testing
export const parsedArgs = cli;
