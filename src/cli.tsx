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
import {mkdir} from 'fs/promises';
import {join} from 'path';
import dgram from 'dgram';
import dns from 'dns';
import os from 'os';
import {spawnSync} from 'child_process';
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
    $ cacd restart              Restart daemon
    $ cacd tui                  Launch TUI (daemon must already be running)
    $ cacd daemon               Run daemon in foreground (for service managers)
    $ cacd setup                Run first-time setup wizard
    $ cacd add [path]           Add a project (default: current directory)
    $ cacd remove <path>        Remove a project from the list
    $ cacd list                 List all tracked projects
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
    --devc-up-command       Command to start devcontainer
    --devc-exec-command     Command to execute in devcontainer

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
    $ cacd stop                   # Stop daemon
    $ cacd tui                    # Launch TUI (requires running daemon)
    $ cacd daemon                 # Foreground daemon mode for systemd/launchd
    $ cacd setup --port 8080      # Setup with custom port
    $ cacd add                    # Add current directory as project
    $ cacd add /path/to/project   # Add specific project
    $ cacd list                   # Show tracked projects
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
			devcUpCommand: {
				type: 'string',
			},
			devcExecCommand: {
				type: 'string',
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

// Handle CLI subcommands
const rawSubcommand = cli.input[0];
const subcommand =
	cli.flags.headless && rawSubcommand === undefined
		? 'daemon'
		: rawSubcommand ?? 'start';
const isDaemonMode = subcommand === 'daemon';
const isTuiOnlyMode = subcommand === 'tui';

// Handle setup subcommand BEFORE importing services (which auto-create config)
if (subcommand === 'setup') {
	// Run setup wizard
	const {runSetup} = await import('./services/setupService.js');
	const result = await runSetup({
		port: cli.flags.port,
		noWeb: cli.flags.noWeb,
		skipProject: cli.flags.skipProject,
		projectPath: cli.flags.project,
		force: cli.flags.force,
	});

	// If setup was skipped (user said no to overwrite), proceed to TUI only if interactive
	if (result.skipped) {
		if (!process.stdin.isTTY) {
			// Can't proceed to TUI in non-interactive mode
			process.exit(1);
		}
		// Continue to TUI below
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
	console.log(''); // Extra newline before starting
	// Continue to start the app after setup
}

// Now import services that need config (after setup has run if needed)
const {projectManager} = await import('./services/projectManager.js');
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

// Handle auth subcommand
if (subcommand === 'auth') {
	const authCommand = cli.input[1];
	const config = configurationManager.getConfiguration();
	const port = config.port ?? 3000;

	// Import auth utilities
	const {generateAccessToken} = await import('./utils/wordlist.js');
	const {hashPasscode, validatePasscode} = await import(
		'./services/authService.js'
	);
	const readline = await import('readline');

	// Helper for interactive prompt
	const askQuestion = (question: string): Promise<string> => {
		if (!process.stdin.isTTY) {
			return Promise.resolve('');
		}
		const rl = readline.createInterface({
			input: process.stdin,
			output: process.stdout,
		});
		return new Promise(resolve => {
			rl.question(question, answer => {
				rl.close();
				resolve(answer.trim());
			});
		});
	};

	const askYesNo = async (question: string): Promise<boolean> => {
		if (!process.stdin.isTTY) return false;
		const answer = await askQuestion(`${question} (y/N): `);
		return answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes';
	};

	switch (authCommand) {
		case 'show': {
			if (!config.webEnabled) {
				console.log('Web interface is not enabled.');
				console.log('Run `cacd setup` to enable it.');
				process.exit(0);
			}

			if (!config.accessToken) {
				console.log('No access token configured.');
				console.log('Run `cacd auth regenerate-token` to generate one.');
				process.exit(0);
			}

			console.log('\nWebUI Access URL:');
			console.log(`  http://localhost:${port}/${config.accessToken}`);
			console.log('');

			if (!config.passcodeHash) {
				console.log(
					'⚠️  No passcode set. Run `cacd auth reset-passcode` to set one.',
				);
			} else {
				console.log('✓ Passcode is configured');
			}
			process.exit(0);
			break;
		}

		case 'reset-passcode': {
			if (!process.stdin.isTTY) {
				console.error('Error: reset-passcode requires an interactive terminal');
				process.exit(1);
			}

			console.log(
				'\nSet a new passcode for WebUI access (min 6 characters, alphanumeric):',
			);
			let validPasscode = false;
			while (!validPasscode) {
				const passcode = await askQuestion('New passcode: ');
				const validation = validatePasscode(passcode);
				if (!validation.valid) {
					console.log(`  Invalid: ${validation.error}`);
					continue;
				}

				const confirm = await askQuestion('Confirm passcode: ');
				if (passcode !== confirm) {
					console.log('  Passcodes do not match, try again.');
					continue;
				}

				const hash = await hashPasscode(passcode);
				configurationManager.updateAuthCredentials({passcodeHash: hash});
				console.log('\n✓ Passcode updated successfully');
				validPasscode = true;
			}
			process.exit(0);
			break;
		}

		case 'regenerate-token': {
			if (!process.stdin.isTTY) {
				console.error(
					'Error: regenerate-token requires an interactive terminal',
				);
				process.exit(1);
			}

			console.log('\n⚠️  Warning: Regenerating the access token will:');
			console.log('  - Invalidate your current access URL');
			console.log('  - Require you to update any bookmarks');
			console.log('');

			const proceed = await askYesNo('Continue?');
			if (!proceed) {
				console.log('Cancelled.');
				process.exit(0);
			}

			const newToken = generateAccessToken();
			configurationManager.updateAuthCredentials({accessToken: newToken});

			console.log('\n✓ New access token generated');
			console.log('\nNew WebUI Access URL:');
			console.log(`  http://localhost:${port}/${newToken}`);
			process.exit(0);
			break;
		}

		default:
			console.error(
				authCommand
					? `Unknown auth command: ${authCommand}`
					: 'Missing auth command',
			);
			console.error('');
			console.error('Available auth commands:');
			console.error('  cacd auth show              Display access URL');
			console.error('  cacd auth reset-passcode    Reset your passcode');
			console.error('  cacd auth regenerate-token  Generate new access token');
			process.exit(1);
	}
}

// If there's an unrecognized subcommand, show error
if (
	subcommand &&
	![
		'start',
		'stop',
		'status',
		'restart',
		'add',
		'remove',
		'list',
		'setup',
		'auth',
		'daemon',
		'tui',
	].includes(subcommand)
) {
	console.error(`Unknown command: ${subcommand}`);
	console.error('');
	console.error('Available commands:');
	console.error('  cacd start         Start daemon in background');
	console.error('  cacd stop          Stop daemon');
	console.error('  cacd status        Show daemon status');
	console.error('  cacd restart       Restart daemon');
	console.error('  cacd setup         Run first-time setup');
	console.error('  cacd add [path]    Add a project');
	console.error('  cacd remove <path> Remove a project');
	console.error('  cacd list          List projects');
	console.error('  cacd auth <cmd>    Manage WebUI auth');
	console.error('  cacd tui           Launch TUI (daemon required)');
	console.error('  cacd daemon        Run API server in foreground');
	console.error('  cacd               Start daemon in background');
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

const DAEMON_READY_TIMEOUT_MS = 15_000;
const DAEMON_POLL_INTERVAL_MS = 200;
const DAEMON_STOP_TIMEOUT_MS = 5_000;
const DAEMON_LOG_FILENAME = 'daemon.log';

// Get config dir info for display (configDir already defined at top of file)
const customConfigDir = isCustomConfigDir();
const devModeActive = isDevModeConfig();
const accessToken = configurationManager.getConfiguration().accessToken;
const daemonPidFilePath = getDaemonPidFilePath(configDir);
const daemonLogPath = join(configDir, DAEMON_LOG_FILENAME);

function sleep(ms: number): Promise<void> {
	return new Promise(resolve => {
		setTimeout(resolve, ms);
	});
}

function getProcessUptime(pid: number): string | undefined {
	const result = spawnSync('ps', ['-p', `${pid}`, '-o', 'etime='], {
		encoding: 'utf-8',
	});

	if (result.status !== 0) {
		return undefined;
	}

	const uptime = result.stdout.trim();
	return uptime.length > 0 ? uptime : undefined;
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

async function startDaemonInBackground(): Promise<{
	pid: number;
	started: boolean;
	webConfig: DaemonWebConfig;
}> {
	const existingPid = await readDaemonPidFile(daemonPidFilePath);
	const baseConfig = buildDaemonWebConfig({
		configDir,
		port,
		accessToken,
		isCustomConfigDir: customConfigDir,
		isDevMode: devModeActive,
	});

	if (existingPid !== undefined && isProcessRunning(existingPid)) {
		return {
			pid: existingPid,
			started: false,
			webConfig: await withNetworkLinks(baseConfig, accessToken),
		};
	}

	if (existingPid !== undefined) {
		await cleanupDaemonPidFile(daemonPidFilePath, existingPid);
	}

	const entrypointPath = process.argv[1];
	if (!entrypointPath) {
		throw new Error('Unable to start daemon: missing CLI entrypoint path.');
	}

	await mkdir(configDir, {recursive: true});
	const daemonProcess = spawnDetachedDaemon(entrypointPath, port, {
		logFilePath: daemonLogPath,
	});
	daemonProcess.unref();

	const deadline = Date.now() + DAEMON_READY_TIMEOUT_MS;
	const daemonPid = await waitForDaemonPid({
		pidFilePath: daemonPidFilePath,
		deadline,
		pollIntervalMs: DAEMON_POLL_INTERVAL_MS,
	});

	await waitForDaemonApiReady({
		baseUrl: `http://127.0.0.1:${port}`,
		accessToken,
		deadline,
		pollIntervalMs: DAEMON_POLL_INTERVAL_MS,
	});

	return {
		pid: daemonPid,
		started: true,
		webConfig: await withNetworkLinks(baseConfig, accessToken),
	};
}

async function stopDaemon(): Promise<{stopped: boolean; pid?: number}> {
	const pid = await readDaemonPidFile(daemonPidFilePath);
	if (pid === undefined) {
		return {stopped: false};
	}

	if (!isProcessRunning(pid)) {
		await cleanupDaemonPidFile(daemonPidFilePath, pid);
		return {stopped: false};
	}

	try {
		process.kill(pid, 'SIGTERM');
	} catch (error) {
		const errnoError = error as NodeJS.ErrnoException;
		if (errnoError.code !== 'ESRCH') {
			throw error;
		}
	}

	const deadline = Date.now() + DAEMON_STOP_TIMEOUT_MS;
	while (Date.now() < deadline) {
		if (!isProcessRunning(pid)) {
			await cleanupDaemonPidFile(daemonPidFilePath, pid);
			return {stopped: true, pid};
		}
		await sleep(DAEMON_POLL_INTERVAL_MS);
	}

	throw new Error(`Timed out waiting for daemon PID ${pid} to stop.`);
}

if (subcommand === 'start') {
	let result: {pid: number; started: boolean; webConfig: DaemonWebConfig};
	try {
		result = await startDaemonInBackground();
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error(`Failed to start daemon: ${message}`);
		process.exit(1);
	}

	if (result.started) {
		console.log('CA⚡CD daemon started in background');
	} else {
		console.log(`Daemon already running (PID ${result.pid})`);
	}
	console.log(`Local URL:    ${result.webConfig.url}`);
	console.log(`External URL: ${result.webConfig.externalUrl || '(unavailable)'}`);
	console.log(`PID:          ${result.pid}`);
	console.log(`Config Dir:   ${configDir}`);
	console.log(`PID File:     ${daemonPidFilePath}`);
	console.log(`Log File:     ${daemonLogPath}`);
	process.exit(0);
}

if (subcommand === 'stop') {
	let result: {stopped: boolean; pid?: number};
	try {
		result = await stopDaemon();
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error(`Failed to stop daemon: ${message}`);
		process.exit(1);
	}

	if (!result.stopped) {
		console.log('No daemon running');
		process.exit(0);
	}

	console.log(`Daemon stopped (PID ${result.pid})`);
	process.exit(0);
}

if (subcommand === 'status') {
	let statusOutput: {
		running: boolean;
		pid?: number;
		webConfig?: DaemonWebConfig;
		uptime?: string;
	};
	try {
		const pid = await readDaemonPidFile(daemonPidFilePath);
		if (pid === undefined || !isProcessRunning(pid)) {
			if (pid !== undefined) {
				await cleanupDaemonPidFile(daemonPidFilePath, pid);
			}
			statusOutput = {running: false};
		} else {
			const baseConfig = buildDaemonWebConfig({
				configDir,
				port,
				accessToken,
				isCustomConfigDir: customConfigDir,
				isDevMode: devModeActive,
			});
			statusOutput = {
				running: true,
				pid,
				webConfig: await withNetworkLinks(baseConfig, accessToken),
				uptime: getProcessUptime(pid),
			};
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error(`Failed to get daemon status: ${message}`);
		process.exit(1);
	}

	if (!statusOutput.running) {
		console.log('Daemon is not running');
		console.log(`Config Dir: ${configDir}`);
		console.log(`PID File:   ${daemonPidFilePath}`);
		process.exit(0);
	}

	console.log('Daemon is running');
	console.log(`PID:          ${statusOutput.pid}`);
	console.log(`Local URL:    ${statusOutput.webConfig?.url}`);
	console.log(
		`External URL: ${statusOutput.webConfig?.externalUrl || '(unavailable)'}`,
	);
	console.log(`Config Dir:   ${configDir}`);
	console.log(`PID File:     ${daemonPidFilePath}`);
	console.log(`Log File:     ${daemonLogPath}`);
	if (statusOutput.uptime) {
		console.log(`Uptime:       ${statusOutput.uptime}`);
	}
	process.exit(0);
}

if (subcommand === 'restart') {
	let result: {pid: number; started: boolean; webConfig: DaemonWebConfig};
	try {
		await stopDaemon();
		result = await startDaemonInBackground();
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error(`Failed to restart daemon: ${message}`);
		process.exit(1);
	}

	console.log(`Daemon restarted (PID ${result.pid})`);
	console.log(`Local URL:    ${result.webConfig.url}`);
	console.log(`External URL: ${result.webConfig.externalUrl || '(unavailable)'}`);
	console.log(`Config Dir:   ${configDir}`);
	console.log(`PID File:     ${daemonPidFilePath}`);
	console.log(`Log File:     ${daemonLogPath}`);
	process.exit(0);
}

// If no daemon mode, continue to TUI - check TTY
if (!isDaemonMode && (!process.stdin.isTTY || !process.stdout.isTTY)) {
	console.error('Error: cacd must be run in an interactive terminal (TTY)');
	console.error('Use `cacd start` to run daemon in background');
	process.exit(1);
}

// Initialize worktree config manager
worktreeConfigManager.initialize();

let webConfig: DaemonWebConfig | undefined;

if (isDaemonMode) {
	try {
		const result = await apiServer.start(port, '0.0.0.0', devModeActive);
		const actualPort = result.port;

		// In dev mode, persist the port that was actually used (for next restart)
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
		console.error(`Failed to start daemon API server: ${message}`);
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
		console.error(`${prefix}: ${message}`);
		process.exit(1);
	}
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

// In daemon mode, run API server only without TUI
if (isDaemonMode) {
	const daemonPid = process.pid;

	try {
		await prepareDaemonPidFile(daemonPidFilePath, daemonPid);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error(`Failed to initialize daemon PID file: ${message}`);
		process.exit(1);
	}

	console.log('CA⚡CD daemon started');
	console.log(`Local URL:    ${webConfig?.url || `http://localhost:${port}`}`);
	console.log(`Token:        ${accessToken || '(none configured)'}`);
	console.log(`External URL: ${webConfig?.externalUrl || '(unavailable)'}`);
	console.log(`PID:          ${daemonPid}`);
	console.log(`Config Dir:   ${configDir}`);
	console.log(`PID File:     ${daemonPidFilePath}`);
	console.log('');
	console.log('Use SIGTERM or Ctrl+C to stop');

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
		console.error('Failed to configure TUI daemon connection');
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
