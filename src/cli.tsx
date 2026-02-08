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
import {join} from 'path';
import dgram from 'dgram';
import dns from 'dns';
import os from 'os';

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
	  $ cacd                    Launch the TUI
	  $ cacd setup              Run first-time setup wizard
	  $ cacd add [path]         Add a project (default: current directory)
	  $ cacd remove <path>      Remove a project from the list
	  $ cacd list               List all tracked projects
	  $ cacd auth <command>     Manage WebUI authentication

	Auth Commands
	  $ cacd auth show            Display access URL
	  $ cacd auth reset-passcode  Reset your passcode
	  $ cacd auth regenerate-token  Generate new access token (careful!)

	Options
	  --help                Show help
	  --version             Show version
	  --port <number>       Port for web interface (overrides config/env)
	  --headless            Run API server only (no TUI) - useful for dev mode
	  --devc-up-command     Command to start devcontainer
	  --devc-exec-command   Command to execute in devcontainer

	Setup Options (for 'cacd setup')
	  --no-web              Disable web interface
	  --project <path>      Add specified path as first project
	  --skip-project        Don't add any project
	  --force               Overwrite existing config without asking

	Environment Variables
	  CACD_CONFIG_DIR        Custom config directory (highest priority, overrides CACD_DEV)
	  CACD_PORT              Port for web interface
	  CACD_DEV               Set to 1 for dev mode (uses local .cacd-dev/ config)

	Examples
	  $ cacd                         # Launch TUI
	  $ cacd setup                   # Run setup wizard
	  $ cacd setup --port 8080       # Setup with custom port
	  $ cacd add                     # Add current directory as project
	  $ cacd add /path/to/project    # Add specific project
	  $ cacd list                    # Show tracked projects
	  $ cacd auth show               # Show WebUI access URL
	  $ cacd --port 8080             # Launch TUI on specific port
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
const subcommand = cli.input[0];

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

// First-run detection: if no config exists, run setup automatically
// This runs BEFORE importing services that auto-create config
if (isFirstRun && subcommand !== 'setup') {
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
	!['add', 'remove', 'list', 'setup', 'auth'].includes(subcommand)
) {
	console.error(`Unknown command: ${subcommand}`);
	console.error('');
	console.error('Available commands:');
	console.error('  cacd setup         Run first-time setup');
	console.error('  cacd add [path]    Add a project');
	console.error('  cacd remove <path> Remove a project');
	console.error('  cacd list          List projects');
	console.error('  cacd auth <cmd>    Manage WebUI auth');
	console.error('  cacd               Launch TUI');
	process.exit(1);
}

// If no subcommand, continue to TUI - check TTY (unless headless)
const isHeadless = cli.flags.headless;
if (!isHeadless && (!process.stdin.isTTY || !process.stdout.isTTY)) {
	console.error('Error: cacd must be run in an interactive terminal (TTY)');
	console.error('Use --headless to run API server only without TUI');
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

// Get config dir info for display (configDir already defined at top of file)
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
	const accessToken = configurationManager.getConfiguration().accessToken;
	const tokenPath = accessToken ? `/${accessToken}` : '';
	webConfig = {
		url: result.address.replace('0.0.0.0', 'localhost') + tokenPath,
		externalUrl: externalIP
			? `http://${externalIP}:${actualPort}${tokenPath}`
			: undefined,
		hostname: hostname
			? `http://${hostname}:${actualPort}${tokenPath}`
			: undefined,
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

// In headless mode, just run the API server without TUI
if (isHeadless) {
	console.log('Running in headless mode (API server only)');
	console.log(`API Server: ${webConfig?.url || `http://localhost:${port}`}`);
	if (webConfig?.externalUrl) {
		console.log(`External:   ${webConfig.externalUrl}`);
	}
	console.log('');
	console.log('Press Ctrl+C to stop');

	// Clean up sessions on exit (headless)
	process.on('SIGINT', () => {
		console.log('\nShutting down...');
		globalSessionOrchestrator.destroyAllSessions();
		process.exit(0);
	});

	process.on('SIGTERM', () => {
		globalSessionOrchestrator.destroyAllSessions();
		process.exit(0);
	});
} else {
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
