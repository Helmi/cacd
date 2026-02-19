/**
 * Setup Service - First-run configuration wizard
 *
 * Handles:
 * - Agent detection (checks if CLI tools are installed)
 * - First project setup (git repo detection or user input)
 * - Config creation with sensible defaults
 */

import {spawn} from 'child_process';
import {existsSync, copyFileSync, statSync} from 'fs';
import {join, resolve, basename} from 'path';
import * as readline from 'readline';
import {getConfigDir} from '../utils/configDir.js';
import {AgentConfig} from '../types/index.js';
import {generateRandomPort} from '../constants/env.js';
import {generateAccessToken} from '../utils/wordlist.js';
import {hashPasscode, validatePasscode} from './authService.js';

// Agents we can detect (check if binary exists and responds to --version)
const DETECTABLE_AGENTS = [
	{id: 'claude', command: 'claude', name: 'Claude Code'},
	{id: 'codex', command: 'codex', name: 'Codex CLI'},
	{id: 'gemini', command: 'gemini', name: 'Gemini CLI'},
	{id: 'pi', command: 'pi', name: 'Pi Coding Agent'},
	{id: 'cursor', command: 'cursor agent', name: 'Cursor Agent'},
	{id: 'droid', command: 'droid', name: 'Droid'},
	{id: 'kilocode', command: 'kilocode', name: 'Kilocode'},
	{id: 'opencode', command: 'opencode', name: 'Opencode'},
];

// Terminal agent is always available (doesn't need detection)
const TERMINAL_AGENT: AgentConfig = {
	id: 'terminal',
	name: 'Terminal',
	description: 'Plain shell session',
	kind: 'terminal',
	command: '$SHELL',
	enabled: true,
	promptArg: 'none',
	icon: 'terminal',
	iconColor: '#6B7280',
	options: [],
};

// Default agent profiles with full options (same as configurationManager defaults)
// Defined here to avoid importing configurationManager which auto-creates config
const DEFAULT_AGENT_PROFILES: Record<string, AgentConfig> = {
	claude: {
		id: 'claude',
		name: 'Claude Code',
		description: 'Anthropic Claude CLI for coding assistance',
		kind: 'agent',
		command: 'claude',
		enabled: true,
		icon: 'claude',
		options: [
			{
				id: 'yolo',
				flag: '--dangerously-skip-permissions',
				label: 'YOLO Mode',
				description: 'Skip all permission prompts',
				type: 'boolean',
				default: false,
			},
			{
				id: 'continue',
				flag: '--continue',
				label: 'Continue',
				description: 'Continue the most recent conversation',
				type: 'boolean',
				default: false,
				group: 'resume-mode',
			},
			{
				id: 'resume',
				flag: '--resume',
				label: 'Resume',
				description: 'Resume a specific conversation by ID',
				type: 'string',
				group: 'resume-mode',
			},
			{
				id: 'model',
				flag: '--model',
				label: 'Model',
				description: 'Model to use',
				type: 'string',
				choices: [
					{value: 'sonnet', label: 'Sonnet'},
					{value: 'opus', label: 'Opus'},
					{value: 'haiku', label: 'Haiku'},
				],
			},
		],
		detectionStrategy: 'claude',
	},
	codex: {
		id: 'codex',
		name: 'Codex CLI',
		description: 'OpenAI Codex CLI',
		kind: 'agent',
		command: 'codex',
		enabled: true,
		icon: 'openai',
		options: [
			{
				id: 'yolo',
				flag: '--dangerously-bypass-approvals-and-sandbox',
				label: 'YOLO Mode',
				description: 'Skip all permission checks and sandbox (dangerous)',
				type: 'boolean',
				default: false,
				group: 'auto-mode',
			},
			{
				id: 'full-auto',
				flag: '--full-auto',
				label: 'Full Auto',
				description: 'Auto-approve with workspace sandbox (safer)',
				type: 'boolean',
				default: false,
				group: 'auto-mode',
			},
			{
				id: 'model',
				flag: '-m',
				label: 'Model',
				description: 'Model to use',
				type: 'string',
			},
		],
		detectionStrategy: 'codex',
	},
	gemini: {
		id: 'gemini',
		name: 'Gemini CLI',
		description: 'Google Gemini CLI',
		kind: 'agent',
		command: 'gemini',
		enabled: true,
		icon: 'gemini',
		options: [
			{
				id: 'yolo',
				flag: '-y',
				label: 'YOLO Mode',
				description: 'Auto-approve all actions',
				type: 'boolean',
				default: false,
			},
			{
				id: 'resume',
				flag: '-r',
				label: 'Resume',
				description: 'Resume session (use "latest" or index)',
				type: 'string',
			},
			{
				id: 'model',
				flag: '-m',
				label: 'Model',
				description: 'Model to use',
				type: 'string',
			},
		],
		detectionStrategy: 'gemini',
	},
	pi: {
		id: 'pi',
		name: 'Pi Coding Agent',
		description: 'Pi Coding Agent (pi CLI)',
		kind: 'agent',
		command: 'pi',
		enabled: true,
		icon: 'pi',
		options: [
			{
				id: 'tools',
				flag: '--tools',
				label: 'Tools',
				description:
					'Enabled tools (controls permissions). Default disables bash for safety.',
				type: 'string',
				default: 'read,edit,write,grep,find,ls',
				choices: [
					{value: 'read,grep,find,ls', label: 'Read-only'},
					{value: 'read,edit,write,grep,find,ls', label: 'Safe (no bash)'},
					{value: 'read,bash,edit,write', label: 'Default (includes bash)'},
					{
						value: 'read,bash,edit,write,grep,find,ls',
						label: 'All tools',
					},
				],
			},
			{
				id: 'continue',
				flag: '--continue',
				label: 'Continue',
				description: 'Continue previous session',
				type: 'boolean',
				default: false,
				group: 'resume-mode',
			},
			{
				id: 'resume',
				flag: '--resume',
				label: 'Resume',
				description: 'Select a session to resume',
				type: 'boolean',
				default: false,
				group: 'resume-mode',
			},
			{
				id: 'session',
				flag: '--session',
				label: 'Session File',
				description: 'Use specific session file',
				type: 'string',
			},
			{
				id: 'session-dir',
				flag: '--session-dir',
				label: 'Session Dir',
				description: 'Directory for session storage and lookup',
				type: 'string',
			},
			{
				id: 'thinking',
				flag: '--thinking',
				label: 'Thinking',
				description: 'Thinking level',
				type: 'string',
				choices: [
					{value: 'off', label: 'Off'},
					{value: 'minimal', label: 'Minimal'},
					{value: 'low', label: 'Low'},
					{value: 'medium', label: 'Medium'},
					{value: 'high', label: 'High'},
					{value: 'xhigh', label: 'Extra High'},
				],
			},
		],
		detectionStrategy: 'pi',
	},
	cursor: {
		id: 'cursor',
		name: 'Cursor',
		description: 'Cursor Agent CLI',
		kind: 'agent',
		command: 'cursor agent',
		enabled: true,
		icon: 'cursor',
		options: [
			{
				id: 'force',
				flag: '-f',
				label: 'Force',
				description: 'Force allow commands unless explicitly denied',
				type: 'boolean',
				default: false,
			},
			{
				id: 'sandbox',
				flag: '--sandbox',
				label: 'Sandbox',
				description: 'Sandbox mode',
				type: 'string',
				choices: [
					{value: 'enabled', label: 'Enabled'},
					{value: 'disabled', label: 'Disabled'},
				],
			},
			{
				id: 'resume',
				flag: '--resume',
				label: 'Resume',
				description: 'Resume a chat session by ID',
				type: 'string',
			},
			{
				id: 'model',
				flag: '--model',
				label: 'Model',
				description: 'Model to use',
				type: 'string',
			},
		],
	},
	droid: {
		id: 'droid',
		name: 'Droid',
		description: 'Droid CLI',
		kind: 'agent',
		command: 'droid',
		enabled: true,
		icon: 'droid',
		options: [
			{
				id: 'resume',
				flag: '-r',
				label: 'Resume',
				description: 'Resume session (defaults to last)',
				type: 'string',
			},
		],
	},
	kilocode: {
		id: 'kilocode',
		name: 'Kilocode',
		description: 'Kilocode CLI',
		kind: 'agent',
		command: 'kilocode',
		enabled: true,
		icon: 'kilo',
		options: [
			{
				id: 'yolo',
				flag: '--yolo',
				label: 'YOLO Mode',
				description: 'Auto-approve all tool permissions',
				type: 'boolean',
				default: false,
			},
			{
				id: 'continue',
				flag: '-c',
				label: 'Continue',
				description: 'Resume last conversation',
				type: 'boolean',
				default: false,
			},
			{
				id: 'session',
				flag: '-s',
				label: 'Session',
				description: 'Resume specific session by ID',
				type: 'string',
			},
			{
				id: 'model',
				flag: '-mo',
				label: 'Model',
				description: 'Model to use',
				type: 'string',
			},
		],
	},
	opencode: {
		id: 'opencode',
		name: 'Opencode',
		description: 'Opencode CLI',
		kind: 'agent',
		command: 'opencode',
		enabled: true,
		promptArg: '--prompt',
		icon: 'opencode',
		options: [
			{
				id: 'continue',
				flag: '-c',
				label: 'Continue',
				description: 'Resume last session',
				type: 'boolean',
				default: false,
			},
			{
				id: 'session',
				flag: '-s',
				label: 'Session',
				description: 'Resume specific session by ID',
				type: 'string',
			},
			{
				id: 'model',
				flag: '-m',
				label: 'Model',
				description: 'Model (format: provider/model)',
				type: 'string',
			},
		],
	},
};

const DEFAULT_PROMPT_ARG_BY_AGENT: Record<string, string | undefined> = {
	claude: undefined,
	codex: undefined,
	gemini: undefined,
	cursor: undefined,
	pi: undefined,
	kilocode: undefined,
	droid: undefined,
	opencode: '--prompt',
	terminal: 'none',
};

export interface SetupOptions {
	port?: number;
	noWeb?: boolean;
	skipProject?: boolean;
	projectPath?: string;
	force?: boolean; // Skip confirmation when config exists
}

export interface SetupResult {
	configPath: string;
	detectedAgents: string[];
	projectAdded: string | null;
	skipped: boolean;
}

/**
 * Check if config file exists (without auto-creating)
 */
export function configExists(): boolean {
	const configDir = getConfigDir();
	const configPath = join(configDir, 'config.json');
	return existsSync(configPath);
}

/**
 * Check if a directory is a git repository
 */
function isGitRepo(dirPath: string): boolean {
	try {
		const gitPath = join(dirPath, '.git');
		return existsSync(gitPath);
	} catch {
		return false;
	}
}

/**
 * Check if a directory exists and is accessible
 */
function isValidDirectory(dirPath: string): boolean {
	try {
		const stats = statSync(dirPath);
		return stats.isDirectory();
	} catch {
		return false;
	}
}

/**
 * Get the name of a project from its path
 */
function getProjectName(projectPath: string): string {
	return basename(resolve(projectPath));
}

/**
 * Detect if an agent CLI is installed by running it with --version
 */
async function detectAgent(
	command: string,
	timeoutMs = 5000,
): Promise<boolean> {
	return new Promise(resolve => {
		try {
			const proc = spawn(command, ['--version'], {
				stdio: 'ignore',
				shell: true,
			});

			const timeout = setTimeout(() => {
				proc.kill();
				resolve(false);
			}, timeoutMs);

			proc.on('close', code => {
				clearTimeout(timeout);
				resolve(code === 0);
			});

			proc.on('error', () => {
				clearTimeout(timeout);
				resolve(false);
			});
		} catch {
			resolve(false);
		}
	});
}

/**
 * Detect all installed agents in parallel
 */
export async function detectInstalledAgents(): Promise<
	{id: string; name: string; installed: boolean}[]
> {
	const results = await Promise.all(
		DETECTABLE_AGENTS.map(async agent => ({
			id: agent.id,
			name: agent.name,
			installed: await detectAgent(agent.command),
		})),
	);
	return results;
}

/**
 * Check if we're in an interactive terminal
 */
function isInteractive(): boolean {
	return process.stdin.isTTY === true && process.stdout.isTTY === true;
}

/**
 * Simple readline prompt for a single question
 * Returns empty string if not interactive
 */
function askQuestion(question: string): Promise<string> {
	if (!isInteractive()) {
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
}

/**
 * Ask yes/no question (default: no)
 * Returns false if not interactive
 */
async function askYesNo(question: string): Promise<boolean> {
	if (!isInteractive()) {
		return false;
	}
	const answer = await askQuestion(`${question} (y/N): `);
	return answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes';
}

/**
 * Create backup of existing config file
 */
function backupConfig(configPath: string): string {
	const timestamp = Math.floor(Date.now() / 1000);
	const backupPath = `${configPath}.bak.${timestamp}`;
	copyFileSync(configPath, backupPath);
	return backupPath;
}

/**
 * Run the setup process
 */
export async function runSetup(
	options: SetupOptions = {},
): Promise<SetupResult> {
	const configDir = getConfigDir();
	const configPath = join(configDir, 'config.json');

	// Check if config already exists
	if (configExists() && !options.force) {
		const backupPath = `${configPath}.bak.${Math.floor(Date.now() / 1000)}`;
		console.log(`\nConfig already exists at ${configPath}`);
		console.log(
			`Creating fresh config will overwrite it (backup saved to ${basename(backupPath)})`,
		);

		if (!isInteractive()) {
			console.log('\nRun with --force to overwrite in non-interactive mode.');
			return {
				configPath,
				detectedAgents: [],
				projectAdded: null,
				skipped: true,
			};
		}

		const proceed = await askYesNo('Continue?');
		if (!proceed) {
			console.log('\nSetup cancelled.');
			return {
				configPath,
				detectedAgents: [],
				projectAdded: null,
				skipped: true,
			};
		}

		// Create backup
		const actualBackupPath = backupConfig(configPath);
		console.log(`\nBackup created: ${actualBackupPath}`);
	}

	console.log('\nCreating CACD configuration...\n');

	// Detect installed agents
	console.log('Detecting installed agents...');
	const agentResults = await detectInstalledAgents();

	for (const agent of agentResults) {
		const status = agent.installed ? '✓' : '✗';
		const suffix = agent.installed ? '' : ' (not found)';
		console.log(`  ${status} ${agent.name.toLowerCase()}${suffix}`);
	}

	// Build agents config from detected agents
	const detectedAgentIds = agentResults.filter(a => a.installed).map(a => a.id);

	// Ask about installing default profiles for detected agents
	let useDefaultProfiles = true;
	if (detectedAgentIds.length > 0 && isInteractive()) {
		console.log('');
		useDefaultProfiles = await askYesNo(
			'Install default profiles for detected agents? (includes options like model selection)',
		);
	}

	// Create agent configs for detected agents
	const agents: AgentConfig[] = detectedAgentIds.map(id => {
		const agentInfo = DETECTABLE_AGENTS.find(a => a.id === id)!;

		if (useDefaultProfiles) {
			// Use full default config with options from DEFAULT_AGENT_PROFILES
			const profile = DEFAULT_AGENT_PROFILES[id];
			if (profile) {
				return {...profile};
			}
		}

		// Minimal config without options
		return {
			id: agentInfo.id,
			name: agentInfo.name,
			kind: 'agent' as const,
			command: agentInfo.command,
			enabled: true,
			promptArg: DEFAULT_PROMPT_ARG_BY_AGENT[agentInfo.id],
			icon: agentInfo.id,
			options: [],
		};
	});

	// Always add terminal
	agents.push(TERMINAL_AGENT);

	// Handle web interface setup
	let webEnabled = !options.noWeb;
	let port = options.port ?? generateRandomPort();

	// Auth credentials (new two-tier system)
	let accessToken: string | undefined;
	let passcodeHash: string | undefined;

	if (options.noWeb === undefined && isInteractive()) {
		console.log('');
		const enableWeb = await askYesNo('Enable web interface?');
		webEnabled = enableWeb;

		if (enableWeb) {
			if (options.port === undefined) {
				const suggestedPort = generateRandomPort();
				const portInput = await askQuestion(
					`Web server port [${suggestedPort}]: `,
				);
				if (portInput) {
					const parsed = parseInt(portInput, 10);
					if (!isNaN(parsed) && parsed > 0 && parsed <= 65535) {
						port = parsed;
					} else {
						console.log(`Invalid port, using ${suggestedPort}`);
						port = suggestedPort;
					}
				} else {
					port = suggestedPort;
				}
			}

			// Generate access token (3 memorable words)
			accessToken = generateAccessToken();

			// Prompt for passcode
			console.log(
				'\nSet a passcode for WebUI access (min 6 characters, alphanumeric):',
			);
			let validPasscode = false;
			while (!validPasscode) {
				const passcode = await askQuestion('Passcode: ');
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

				passcodeHash = await hashPasscode(passcode);
				validPasscode = true;
			}

			// Display access URL
			console.log('\n✓ Your WebUI access URL:');
			console.log(`  http://localhost:${port}/${accessToken}`);
			console.log("  (Bookmark this URL - it won't change)");
		}
	} else if (webEnabled && !isInteractive()) {
		// Non-interactive mode with web enabled - generate token but no passcode
		accessToken = generateAccessToken();
		console.log(
			`\nWeb interface enabled but passcode not set (non-interactive mode).`,
		);
		console.log(`Run 'cacd auth set-passcode' to set a passcode.`);
		console.log(`Access token: ${accessToken}`);
	}

	// Handle project setup
	let projectAdded: string | null = null;

	if (!options.skipProject) {
		console.log('');

		if (options.projectPath) {
			// User specified a project path
			const resolvedPath = resolve(options.projectPath);
			if (isValidDirectory(resolvedPath)) {
				projectAdded = resolvedPath;
				console.log(`Adding project: ${resolvedPath}`);
			} else {
				console.log(
					`Warning: ${options.projectPath} is not a valid directory, skipping.`,
				);
			}
		} else {
			// Check if cwd is a git repo
			const cwd = process.cwd();
			if (isGitRepo(cwd)) {
				projectAdded = cwd;
				console.log(`Adding current directory as project: ${cwd}`);
			} else {
				// Ask user for a project path
				console.log('Current directory is not a git repository.');
				const inputPath = await askQuestion(
					'Enter project path (or press Enter to skip): ',
				);

				if (inputPath) {
					const resolvedPath = resolve(inputPath);
					if (isValidDirectory(resolvedPath)) {
						projectAdded = resolvedPath;
					} else {
						console.log(
							`Warning: ${inputPath} is not a valid directory, skipping.`,
						);
					}
				}
			}
		}
	}

	// Build the config object
	const config = {
		port,
		webEnabled,
		accessToken,
		passcodeHash,
		projects: projectAdded
			? [
					{
						name: getProjectName(projectAdded),
						path: projectAdded,
					},
				]
			: [],
		agents: {
			agents,
			defaultAgentId: detectedAgentIds[0] || 'terminal',
			schemaVersion: 1,
		},
		// Include other defaults
		shortcuts: {},
		statusHooks: {},
		worktreeHooks: {},
		worktree: {
			autoDirectory: false,
			copySessionData: true,
			sortByLastSession: false,
		},
		autoApproval: {
			enabled: false,
			timeout: 30,
		},
	};

	// Write config
	const {mkdirSync, writeFileSync} = await import('fs');

	// Ensure config directory exists
	if (!existsSync(configDir)) {
		mkdirSync(configDir, {recursive: true});
	}

	writeFileSync(configPath, JSON.stringify(config, null, 2));

	console.log(`\nConfiguration saved to ${configPath}`);
	console.log('\nSetup complete! Starting CACD...');

	return {
		configPath,
		detectedAgents: detectedAgentIds,
		projectAdded,
		skipped: false,
	};
}
