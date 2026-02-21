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
    $ cacd status --sessions    Show daemon status and active sessions
    $ cacd sessions list        List active sessions
    $ cacd sessions show <id>   Show one active session
    $ cacd agents list          List agents and their active sessions
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
    --sessions              Include active sessions in status output
    --json                  Output machine-readable JSON for query commands
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
			sessions: {
				type: 'boolean',
				default: false,
			},
			json: {
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
		'sessions',
		'agents',
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
	console.error('  cacd sessions      Query active sessions');
	console.error('  cacd agents        Query configured agents');
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

interface DaemonStatusOutput {
	running: boolean;
	pid?: number;
	webConfig?: DaemonWebConfig;
	uptime?: string;
}

interface ApiSessionPayload {
	id: string;
	name?: string;
	path: string;
	state: string;
	autoApprovalFailed?: boolean;
	autoApprovalReason?: string;
	isActive: boolean;
	agentId?: string;
	pid?: number;
}

interface ApiConversationSession {
	id: string;
	agentProfileName: string;
	agentOptions: Record<string, unknown>;
	worktreePath: string;
	branchName: string | null;
	tdTaskId: string | null;
	createdAt: number;
	state: string;
	isActive: boolean;
}

interface ApiConversationSessionResponse {
	session: ApiConversationSession;
}

interface ApiAgentsConfigResponse {
	agents: Array<{
		id: string;
		name: string;
		kind: 'agent' | 'terminal';
		enabled?: boolean;
	}>;
	defaultAgentId: string;
	schemaVersion: number;
}

interface SessionSummary {
	id: string;
	agent: string;
	model: string;
	branch: string;
	status: string;
	elapsed: string;
	pid: number | null;
	tdTaskId: string | null;
	worktreePath: string;
}

function buildDaemonApiBaseUrl(): string {
	return `http://127.0.0.1:${port}`;
}

function buildDaemonApiHeaders(): Record<string, string> {
	const headers: Record<string, string> = {};
	if (accessToken) {
		headers['x-access-token'] = accessToken;
	}
	return headers;
}

function isErrnoError(error: unknown): error is Error & {code?: string} {
	return error instanceof Error && 'code' in error;
}

function isDaemonConnectionError(error: unknown): boolean {
	if (isErrnoError(error) && error.code === 'ECONNREFUSED') {
		return true;
	}

	if (
		error instanceof TypeError &&
		error.cause &&
		typeof error.cause === 'object' &&
		'code' in error.cause &&
		error.cause.code === 'ECONNREFUSED'
	) {
		return true;
	}

	return false;
}

function extractApiError(payload: unknown): string | undefined {
	if (!payload || typeof payload !== 'object') {
		return undefined;
	}

	const maybeError = (payload as {error?: unknown}).error;
	return typeof maybeError === 'string' ? maybeError : undefined;
}

async function fetchDaemonApi<T>(path: string): Promise<T> {
	const url = `${buildDaemonApiBaseUrl()}${path}`;
	let response: Response;

	try {
		response = await fetch(url, {
			headers: buildDaemonApiHeaders(),
		});
	} catch (error) {
		if (isDaemonConnectionError(error)) {
			throw new Error(
				'No running CA⚡CD daemon found. Start it with `cacd start`.',
			);
		}

		throw error;
	}

	let payload: unknown = undefined;
	try {
		payload = await response.json();
	} catch {
		// Ignore parse failures for non-JSON responses
	}

	if (!response.ok) {
		if (response.status === 401 || response.status === 403) {
			throw new Error(
				'Daemon API authentication failed. Verify local config token and daemon state.',
			);
		}

		const apiError = extractApiError(payload);
		const suffix = apiError ? `: ${apiError}` : '';
		throw new Error(`Daemon API request failed (${response.status})${suffix}`);
	}

	return payload as T;
}

function formatElapsedFromCreatedAt(createdAtSeconds: number | undefined): string {
	if (!createdAtSeconds || !Number.isFinite(createdAtSeconds)) {
		return '-';
	}

	const elapsed = Math.max(0, Math.floor(Date.now() / 1000) - createdAtSeconds);
	const days = Math.floor(elapsed / 86400);
	const hours = Math.floor((elapsed % 86400) / 3600);
	const minutes = Math.floor((elapsed % 3600) / 60);
	const seconds = elapsed % 60;

	if (days > 0) {
		return `${days}d ${hours}h`;
	}
	if (hours > 0) {
		return `${hours}h ${minutes}m`;
	}
	if (minutes > 0) {
		return `${minutes}m ${seconds}s`;
	}
	return `${seconds}s`;
}

function resolveSessionModel(agentOptions: Record<string, unknown> | undefined): string {
	if (!agentOptions) {
		return '-';
	}

	const preferredKeys = ['model', 'modelName', 'selectedModel'];
	for (const key of preferredKeys) {
		const value = agentOptions[key];
		if (typeof value === 'string' && value.trim().length > 0) {
			return value.trim();
		}
	}

	const modelEntry = Object.entries(agentOptions).find(([key, value]) => {
		return key.toLowerCase().includes('model') && typeof value === 'string';
	});
	if (modelEntry && typeof modelEntry[1] === 'string') {
		const value = modelEntry[1].trim();
		return value.length > 0 ? value : '-';
	}

	return '-';
}

function printTable(headers: string[], rows: string[][]): void {
	const widths = headers.map((header, index) => {
		const rowWidths = rows.map(row => row[index]?.length ?? 0);
		return Math.max(header.length, ...rowWidths);
	});

	const formatRow = (cells: string[]) =>
		cells.map((cell, index) => cell.padEnd(widths[index] || 0)).join('  ');

	console.log(formatRow(headers));
	console.log(widths.map(width => '-'.repeat(width)).join('  '));
	for (const row of rows) {
		console.log(formatRow(row));
	}
}

async function getDaemonStatusOutput(): Promise<DaemonStatusOutput> {
	const pid = await readDaemonPidFile(daemonPidFilePath);
	if (pid === undefined || !isProcessRunning(pid)) {
		if (pid !== undefined) {
			await cleanupDaemonPidFile(daemonPidFilePath, pid);
		}
		return {running: false};
	}

	const baseConfig = buildDaemonWebConfig({
		configDir,
		port,
		accessToken,
		isCustomConfigDir: customConfigDir,
		isDevMode: devModeActive,
	});

	return {
		running: true,
		pid,
		webConfig: await withNetworkLinks(baseConfig, accessToken),
		uptime: getProcessUptime(pid),
	};
}

async function fetchConversationSession(
	sessionId: string,
): Promise<ApiConversationSession | null> {
	try {
		const response = await fetchDaemonApi<ApiConversationSessionResponse>(
			`/api/conversations/${encodeURIComponent(sessionId)}`,
		);
		return response.session;
	} catch {
		return null;
	}
}

async function buildSessionSummary(
	session: ApiSessionPayload,
): Promise<SessionSummary> {
	const conversation = await fetchConversationSession(session.id);
	const model = resolveSessionModel(conversation?.agentOptions);

	return {
		id: session.id,
		agent: conversation?.agentProfileName || session.agentId || '-',
		model,
		branch: conversation?.branchName || '-',
		status: session.state,
		elapsed: formatElapsedFromCreatedAt(conversation?.createdAt),
		pid: session.pid ?? null,
		tdTaskId: conversation?.tdTaskId || null,
		worktreePath: conversation?.worktreePath || session.path,
	};
}

async function listActiveSessionSummaries(): Promise<SessionSummary[]> {
	const sessions = await fetchDaemonApi<ApiSessionPayload[]>('/api/sessions');
	const summaries = await Promise.all(sessions.map(session => buildSessionSummary(session)));
	return summaries.sort((a, b) => a.id.localeCompare(b.id));
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
	let statusOutput: DaemonStatusOutput;
	let sessions: SessionSummary[] = [];

	try {
		statusOutput = await getDaemonStatusOutput();
		if (statusOutput.running && cli.flags.sessions) {
			sessions = await listActiveSessionSummaries();
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error(`Failed to get daemon status: ${message}`);
		process.exit(1);
	}

	if (cli.flags.json) {
		console.log(
			JSON.stringify(
				{
					...statusOutput,
					configDir,
					pidFilePath: daemonPidFilePath,
					logFilePath: daemonLogPath,
					sessions: cli.flags.sessions ? sessions : undefined,
				},
				null,
				2,
			),
		);
		process.exit(0);
	}

	if (!statusOutput.running) {
		console.log('Daemon is not running');
		console.log(`Config Dir: ${configDir}`);
		console.log(`PID File:   ${daemonPidFilePath}`);
		if (cli.flags.sessions) {
			console.log('Active sessions: 0');
		}
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

	if (cli.flags.sessions) {
		console.log('');
		if (sessions.length === 0) {
			console.log('Active sessions: 0');
		} else {
			console.log(`Active sessions (${sessions.length}):`);
			printTable(
				['id', 'agent', 'model', 'branch', 'status', 'elapsed'],
				sessions.map(session => [
					session.id,
					session.agent,
					session.model,
					session.branch,
					session.status,
					session.elapsed,
				]),
			);
		}
	}

	process.exit(0);
}

if (subcommand === 'sessions') {
	const action = cli.input[1] ?? 'list';

	if (action === 'list') {
		let sessions: SessionSummary[];
		try {
			sessions = await listActiveSessionSummaries();
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			console.error(`Failed to query sessions: ${message}`);
			process.exit(1);
		}

		if (cli.flags.json) {
			console.log(JSON.stringify({sessions}, null, 2));
			process.exit(0);
		}

		if (sessions.length === 0) {
			console.log('No active sessions');
			process.exit(0);
		}

		printTable(
			['id', 'agent', 'model', 'branch', 'status', 'elapsed'],
			sessions.map(session => [
				session.id,
				session.agent,
				session.model,
				session.branch,
				session.status,
				session.elapsed,
			]),
		);
		process.exit(0);
	}

	if (action === 'show') {
		const sessionId = cli.input[2];
		if (!sessionId) {
			console.error('Error: Missing session id');
			console.error('Usage: cacd sessions show <id>');
			process.exit(1);
		}

		let liveSessions: ApiSessionPayload[];
		try {
			liveSessions = await fetchDaemonApi<ApiSessionPayload[]>('/api/sessions');
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			console.error(`Failed to query sessions: ${message}`);
			process.exit(1);
		}

		const liveSession = liveSessions.find(session => session.id === sessionId);
		const conversation = await fetchConversationSession(sessionId);
		if (!liveSession && !conversation) {
			console.error(`Session not found: ${sessionId}`);
			process.exit(1);
		}

		const summary: SessionSummary = {
			id: sessionId,
			agent:
				conversation?.agentProfileName || liveSession?.agentId || 'unknown',
			model: resolveSessionModel(conversation?.agentOptions),
			branch: conversation?.branchName || '-',
			status: liveSession?.state || conversation?.state || 'unknown',
			elapsed: formatElapsedFromCreatedAt(conversation?.createdAt),
			pid: liveSession?.pid ?? null,
			tdTaskId: conversation?.tdTaskId || null,
			worktreePath: conversation?.worktreePath || liveSession?.path || '-',
		};

		if (cli.flags.json) {
			console.log(JSON.stringify(summary, null, 2));
			process.exit(0);
		}

		console.log(`ID:        ${summary.id}`);
		console.log(`Agent:     ${summary.agent}`);
		console.log(`Model:     ${summary.model}`);
		console.log(`Branch:    ${summary.branch}`);
		console.log(`Status:    ${summary.status}`);
		console.log(`PID:       ${summary.pid ?? '-'}`);
		console.log(`Elapsed:   ${summary.elapsed}`);
		console.log(`TD Task:   ${summary.tdTaskId ?? '-'}`);
		console.log(`Worktree:  ${summary.worktreePath}`);
		process.exit(0);
	}

	console.error(`Unknown sessions command: ${action}`);
	console.error('Available sessions commands:');
	console.error('  cacd sessions list');
	console.error('  cacd sessions show <id>');
	process.exit(1);
}

if (subcommand === 'agents') {
	const action = cli.input[1] ?? 'list';
	if (action !== 'list') {
		console.error(`Unknown agents command: ${action}`);
		console.error('Available agents commands:');
		console.error('  cacd agents list');
		process.exit(1);
	}

	let agentsConfig: ApiAgentsConfigResponse;
	let sessions: ApiSessionPayload[];
	try {
		[agentsConfig, sessions] = await Promise.all([
			fetchDaemonApi<ApiAgentsConfigResponse>('/api/agents?includeDisabled=true'),
			fetchDaemonApi<ApiSessionPayload[]>('/api/sessions'),
		]);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error(`Failed to query agents: ${message}`);
		process.exit(1);
	}

	const sessionsByAgent = new Map<string, ApiSessionPayload[]>();
	for (const session of sessions) {
		const key = session.agentId || 'unknown';
		const group = sessionsByAgent.get(key) || [];
		group.push(session);
		sessionsByAgent.set(key, group);
	}

	const payload = agentsConfig.agents.map(agent => ({
		id: agent.id,
		name: agent.name,
		kind: agent.kind,
		enabled: agent.enabled !== false,
		isDefault: agentsConfig.defaultAgentId === agent.id,
		sessions: (sessionsByAgent.get(agent.id) || []).map(session => ({
			id: session.id,
			state: session.state,
			pid: session.pid ?? null,
		})),
	}));

	if (cli.flags.json) {
		console.log(JSON.stringify({agents: payload}, null, 2));
		process.exit(0);
	}

	if (payload.length === 0) {
		console.log('No agents configured');
		process.exit(0);
	}

	printTable(
		['id', 'name', 'kind', 'enabled', 'default', 'sessions'],
		payload.map(agent => [
			agent.id,
			agent.name,
			agent.kind,
			agent.enabled ? 'yes' : 'no',
			agent.isDefault ? 'yes' : 'no',
			agent.sessions.length === 0
				? '-'
				: agent.sessions
						.map(session => `${session.id}(${session.state})`)
						.join(', '),
		]),
	);
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
