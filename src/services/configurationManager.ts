import {join} from 'path';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'fs';
import {Effect, Either} from 'effect';
import {
	ConfigurationData,
	StatusHookConfig,
	WorktreeHookConfig,
	ShortcutConfig,
	WorktreeConfig,
	CommandConfig,
	CommandPreset,
	CommandPresetsConfig,
	AgentConfig,
	AgentsConfig,
	DEFAULT_SHORTCUTS,
} from '../types/index.js';
import {
	FileSystemError,
	ConfigError,
	ValidationError,
} from '../types/errors.js';
import {getConfigDir} from '../utils/configDir.js';

// Current schema version for agents config
const AGENTS_SCHEMA_VERSION = 2;

// Default agent configurations shipped with CACD
const DEFAULT_AGENTS: AgentConfig[] = [
	{
		id: 'claude',
		name: 'Claude Code',
		description: 'Anthropic Claude CLI for coding assistance',
		kind: 'agent',
		command: 'claude',
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
	{
		id: 'codex',
		name: 'Codex CLI',
		description: 'OpenAI Codex CLI',
		kind: 'agent',
		command: 'codex',
		icon: 'openai',
		options: [
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
	{
		id: 'gemini',
		name: 'Gemini CLI',
		description: 'Google Gemini CLI',
		kind: 'agent',
		command: 'gemini',
		icon: 'gemini',
		options: [
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
	{
		id: 'pi',
		name: 'Pi Coding Agent',
		description: 'Pi Coding Agent (pi CLI)',
		kind: 'agent',
		command: 'pi',
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
	{
		id: 'terminal',
		name: 'Terminal',
		description: 'Plain shell session',
		kind: 'terminal',
		command: '$SHELL',
		icon: 'terminal',
		iconColor: '#6B7280',
		options: [],
	},
];

export class ConfigurationManager {
	private configPath: string;
	private legacyShortcutsPath: string;
	private configDir: string;
	private config: ConfigurationData = {};
	private worktreeLastOpened: Map<string, number> = new Map();

	constructor() {
		// Get config directory from centralized utility
		this.configDir = getConfigDir();

		// Ensure config directory exists
		if (!existsSync(this.configDir)) {
			mkdirSync(this.configDir, {recursive: true});
		}

		this.configPath = join(this.configDir, 'config.json');
		this.legacyShortcutsPath = join(this.configDir, 'shortcuts.json');
		this.loadConfig();
	}

	private loadConfig(): void {
		// Try to load the new config file
		if (existsSync(this.configPath)) {
			try {
				const configData = readFileSync(this.configPath, 'utf-8');
				this.config = JSON.parse(configData);
			} catch (error) {
				console.error('Failed to load configuration:', error);
				this.config = {};
			}
		} else {
			// If new config doesn't exist, check for legacy shortcuts.json
			this.migrateLegacyShortcuts();
		}

		// Check if shortcuts need to be loaded from legacy file
		// This handles the case where config.json exists but doesn't have shortcuts
		if (!this.config.shortcuts && existsSync(this.legacyShortcutsPath)) {
			this.migrateLegacyShortcuts();
		}

		// Ensure default values
		if (!this.config.shortcuts) {
			this.config.shortcuts = DEFAULT_SHORTCUTS;
		}
		if (!this.config.statusHooks) {
			this.config.statusHooks = {};
		}
		if (!this.config.worktreeHooks) {
			this.config.worktreeHooks = {};
		}
		if (!this.config.worktree) {
			this.config.worktree = {
				autoDirectory: false,
				copySessionData: true,
				sortByLastSession: false,
			};
		}
		if (
			!Object.prototype.hasOwnProperty.call(
				this.config.worktree,
				'copySessionData',
			)
		) {
			this.config.worktree.copySessionData = true;
		}
		if (
			!Object.prototype.hasOwnProperty.call(
				this.config.worktree,
				'sortByLastSession',
			)
		) {
			this.config.worktree.sortByLastSession = false;
		}
		if (!this.config.command) {
			this.config.command = {
				command: 'claude',
			};
		}
		if (!this.config.autoApproval) {
			this.config.autoApproval = {
				enabled: false,
				timeout: 30,
			};
		} else {
			if (
				!Object.prototype.hasOwnProperty.call(
					this.config.autoApproval,
					'enabled',
				)
			) {
				this.config.autoApproval.enabled = false;
			}
			if (
				!Object.prototype.hasOwnProperty.call(
					this.config.autoApproval,
					'timeout',
				)
			) {
				this.config.autoApproval.timeout = 30;
			}
		}

		// Migrate legacy command config to presets if needed
		this.migrateLegacyCommandToPresets();

		// Initialize or migrate agents config
		this.initializeAgentsConfig();
	}

	private migrateLegacyShortcuts(): void {
		if (existsSync(this.legacyShortcutsPath)) {
			try {
				const shortcutsData = readFileSync(this.legacyShortcutsPath, 'utf-8');
				const shortcuts = JSON.parse(shortcutsData);

				// Validate that it's a valid shortcuts config
				if (shortcuts && typeof shortcuts === 'object') {
					this.config.shortcuts = shortcuts;
					// Save to new config format
					this.saveConfig();
					console.log(
						'Migrated shortcuts from legacy shortcuts.json to config.json',
					);
				}
			} catch (error) {
				console.error('Failed to migrate legacy shortcuts:', error);
			}
		}
	}

	private saveConfig(): void {
		try {
			writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
		} catch (error) {
			console.error('Failed to save configuration:', error);
		}
	}

	getShortcuts(): ShortcutConfig {
		return this.config.shortcuts || DEFAULT_SHORTCUTS;
	}

	setShortcuts(shortcuts: ShortcutConfig): void {
		this.config.shortcuts = shortcuts;
		this.saveConfig();
	}

	getStatusHooks(): StatusHookConfig {
		return this.config.statusHooks || {};
	}

	setStatusHooks(hooks: StatusHookConfig): void {
		this.config.statusHooks = hooks;
		this.saveConfig();
	}

	getWorktreeHooks(): WorktreeHookConfig {
		return this.config.worktreeHooks || {};
	}

	setWorktreeHooks(hooks: WorktreeHookConfig): void {
		this.config.worktreeHooks = hooks;
		this.saveConfig();
	}

	getConfiguration(): ConfigurationData {
		return this.config;
	}

	setConfiguration(config: ConfigurationData): void {
		this.config = config;
		this.saveConfig();
	}

	getWorktreeConfig(): WorktreeConfig {
		return (
			this.config.worktree || {
				autoDirectory: false,
			}
		);
	}

	setWorktreeConfig(worktreeConfig: WorktreeConfig): void {
		this.config.worktree = worktreeConfig;
		this.saveConfig();
	}

	getAutoApprovalConfig(): NonNullable<ConfigurationData['autoApproval']> {
		const config = this.config.autoApproval || {
			enabled: false,
		};
		// Default timeout to 30 seconds if not set
		return {
			...config,
			timeout: config.timeout ?? 30,
		};
	}

	setAutoApprovalConfig(
		autoApproval: NonNullable<ConfigurationData['autoApproval']>,
	): void {
		this.config.autoApproval = autoApproval;
		this.saveConfig();
	}

	setAutoApprovalEnabled(enabled: boolean): void {
		const currentConfig = this.getAutoApprovalConfig();
		this.setAutoApprovalConfig({...currentConfig, enabled});
	}

	setAutoApprovalTimeout(timeout: number): void {
		const currentConfig = this.getAutoApprovalConfig();
		this.setAutoApprovalConfig({...currentConfig, timeout});
	}

	getCommandConfig(): CommandConfig {
		// For backward compatibility, return the default preset as CommandConfig
		const defaultPreset = this.getDefaultPreset();
		return {
			command: defaultPreset.command,
			args: defaultPreset.args,
			fallbackArgs: defaultPreset.fallbackArgs,
		};
	}

	setCommandConfig(commandConfig: CommandConfig): void {
		this.config.command = commandConfig;

		// Also update the default preset for backward compatibility
		if (this.config.commandPresets) {
			const defaultPreset = this.config.commandPresets.presets.find(
				p => p.id === this.config.commandPresets!.defaultPresetId,
			);
			if (defaultPreset) {
				defaultPreset.command = commandConfig.command;
				defaultPreset.args = commandConfig.args;
				defaultPreset.fallbackArgs = commandConfig.fallbackArgs;
			}
		}

		this.saveConfig();
	}

	private migrateLegacyCommandToPresets(): void {
		// Only migrate if we have legacy command config but no presets
		if (this.config.command && !this.config.commandPresets) {
			const defaultPreset: CommandPreset = {
				id: '1',
				name: 'Main',
				command: this.config.command.command,
				args: this.config.command.args,
				fallbackArgs: this.config.command.fallbackArgs,
			};

			this.config.commandPresets = {
				presets: [defaultPreset],
				defaultPresetId: '1',
			};

			this.saveConfig();
		}

		// Ensure default presets if none exist
		if (!this.config.commandPresets) {
			this.config.commandPresets = {
				presets: [
					{
						id: '1',
						name: 'Main',
						command: 'claude',
					},
				],
				defaultPresetId: '1',
			};
		}
	}

	getCommandPresets(): CommandPresetsConfig {
		if (!this.config.commandPresets) {
			this.migrateLegacyCommandToPresets();
		}
		return this.config.commandPresets!;
	}

	setCommandPresets(presets: CommandPresetsConfig): void {
		this.config.commandPresets = presets;
		this.saveConfig();
	}

	getDefaultPreset(): CommandPreset {
		const presets = this.getCommandPresets();
		const defaultPreset = presets.presets.find(
			p => p.id === presets.defaultPresetId,
		);

		// If default preset not found, return the first one
		return defaultPreset || presets.presets[0]!;
	}

	getPresetById(id: string): CommandPreset | undefined {
		const presets = this.getCommandPresets();
		return presets.presets.find(p => p.id === id);
	}

	getAllPresets(): CommandPreset[] {
		return this.getCommandPresets().presets;
	}

	addPreset(preset: CommandPreset): void {
		const presets = this.getCommandPresets();

		// Replace if exists, otherwise add
		const existingIndex = presets.presets.findIndex(p => p.id === preset.id);
		if (existingIndex >= 0) {
			presets.presets[existingIndex] = preset;
		} else {
			presets.presets.push(preset);
		}

		this.setCommandPresets(presets);
	}

	deletePreset(id: string): void {
		const presets = this.getCommandPresets();

		// Don't delete if it's the last preset
		if (presets.presets.length <= 1) {
			return;
		}

		// Remove the preset
		presets.presets = presets.presets.filter(p => p.id !== id);

		// Update default if needed
		if (presets.defaultPresetId === id && presets.presets.length > 0) {
			presets.defaultPresetId = presets.presets[0]!.id;
		}

		this.setCommandPresets(presets);
	}

	setDefaultPreset(id: string): void {
		const presets = this.getCommandPresets();

		// Only update if preset exists
		if (presets.presets.some(p => p.id === id)) {
			presets.defaultPresetId = id;
			this.setCommandPresets(presets);
		}
	}

	getSelectPresetOnStart(): boolean {
		const presets = this.getCommandPresets();
		return presets.selectPresetOnStart ?? false;
	}

	setSelectPresetOnStart(enabled: boolean): void {
		const presets = this.getCommandPresets();
		presets.selectPresetOnStart = enabled;
		this.setCommandPresets(presets);
	}

	// ============================================================================
	// Agent Configuration Methods
	// ============================================================================

	/**
	 * Initialize agents config with defaults or migrate from presets.
	 * Called during loadConfig().
	 */
	private initializeAgentsConfig(): void {
		if (this.config.agents) {
			let changed = false;
			const schemaVersion = this.config.agents.schemaVersion ?? 0;

			// One-time migrations for existing configs.
			// Important: do NOT continuously re-add default agents, since users can delete agents.
			if (schemaVersion < 2) {
				// v2: add Pi default profile once
				const piDefault = DEFAULT_AGENTS.find(a => a.id === 'pi');
				if (
					piDefault &&
					!this.config.agents.agents.some(a => a.id === piDefault.id)
				) {
					this.config.agents.agents.push(piDefault);
					changed = true;
				}

				this.config.agents.schemaVersion = AGENTS_SCHEMA_VERSION;
				changed = true;
			}

			// Ensure defaultAgentId points to a real agent
			if (
				!this.config.agents.agents.some(
					a => a.id === this.config.agents!.defaultAgentId,
				)
			) {
				this.config.agents.defaultAgentId =
					this.config.agents.agents[0]?.id || 'claude';
				changed = true;
			}

			if (changed) {
				this.saveConfig();
			}
			return;
		}

		// No agents config yet - check if we should migrate from presets
		if (
			this.config.commandPresets &&
			this.config.commandPresets.presets.length > 0
		) {
			// Migrate existing presets to agents
			const migratedAgents = this.migratePresetsToAgents(
				this.config.commandPresets.presets,
			);

			// Merge with default agents (add defaults that aren't already present)
			const mergedAgents = [...migratedAgents];
			for (const defaultAgent of DEFAULT_AGENTS) {
				if (!mergedAgents.some(a => a.id === defaultAgent.id)) {
					mergedAgents.push(defaultAgent);
				}
			}

			this.config.agents = {
				agents: mergedAgents,
				defaultAgentId: migratedAgents[0]?.id || 'claude',
				schemaVersion: AGENTS_SCHEMA_VERSION,
			};
		} else {
			// Fresh install - use defaults
			this.config.agents = {
				agents: [...DEFAULT_AGENTS],
				defaultAgentId: 'claude',
				schemaVersion: AGENTS_SCHEMA_VERSION,
			};
		}

		this.saveConfig();
	}

	/**
	 * Migrate CommandPreset[] to AgentConfig[].
	 * Uses lossless migration: args become baseArgs, options stay empty.
	 */
	private migratePresetsToAgents(presets: CommandPreset[]): AgentConfig[] {
		return presets.map((preset, index) => {
			// Check if this matches a known default agent
			const matchingDefault = DEFAULT_AGENTS.find(
				d => d.command === preset.command && d.kind === 'agent',
			);

			if (matchingDefault) {
				// Use the default agent's options but keep preset's name/id
				return {
					...matchingDefault,
					id: preset.id || `migrated-${index}`,
					name: preset.name || matchingDefault.name,
					baseArgs: preset.args, // Preserve any custom args
				};
			}

			// Unknown agent - create with baseArgs fallback
			return {
				id: preset.id || `migrated-${index}`,
				name: preset.name || `${preset.command} (Migrated)`,
				kind: 'agent' as const,
				command: preset.command,
				baseArgs: preset.args,
				options: [],
				detectionStrategy: preset.detectionStrategy,
			};
		});
	}

	/**
	 * Get the agents configuration.
	 */
	getAgentsConfig(): AgentsConfig {
		if (!this.config.agents) {
			this.initializeAgentsConfig();
		}
		return this.config.agents!;
	}

	/**
	 * Set the entire agents configuration.
	 */
	setAgentsConfig(agents: AgentsConfig): void {
		this.config.agents = agents;
		this.saveConfig();
	}

	/**
	 * Get all configured agents.
	 */
	getAgents(): AgentConfig[] {
		return this.getAgentsConfig().agents;
	}

	/**
	 * Get the default agent.
	 */
	getDefaultAgent(): AgentConfig {
		const config = this.getAgentsConfig();
		const defaultAgent = config.agents.find(
			a => a.id === config.defaultAgentId,
		);
		return defaultAgent || config.agents[0]!;
	}

	/**
	 * Get an agent by ID.
	 */
	getAgentById(id: string): AgentConfig | undefined {
		return this.getAgents().find(a => a.id === id);
	}

	/**
	 * Add or update an agent.
	 */
	saveAgent(agent: AgentConfig): void {
		const config = this.getAgentsConfig();
		const existingIndex = config.agents.findIndex(a => a.id === agent.id);

		if (existingIndex >= 0) {
			config.agents[existingIndex] = agent;
		} else {
			config.agents.push(agent);
		}

		this.setAgentsConfig(config);
	}

	/**
	 * Delete an agent by ID.
	 * Cannot delete if it's the last agent or if it's the default.
	 */
	deleteAgent(id: string): boolean {
		const config = this.getAgentsConfig();

		// Don't delete if it's the last agent
		if (config.agents.length <= 1) {
			return false;
		}

		// Don't delete the default agent without reassigning
		if (config.defaultAgentId === id) {
			const remaining = config.agents.filter(a => a.id !== id);
			if (remaining.length > 0) {
				config.defaultAgentId = remaining[0]!.id;
			} else {
				return false;
			}
		}

		config.agents = config.agents.filter(a => a.id !== id);
		this.setAgentsConfig(config);
		return true;
	}

	/**
	 * Set the default agent ID.
	 */
	setDefaultAgent(id: string): boolean {
		const config = this.getAgentsConfig();
		if (!config.agents.some(a => a.id === id)) {
			return false;
		}
		config.defaultAgentId = id;
		this.setAgentsConfig(config);
		return true;
	}

	/**
	 * Build command arguments from agent config and selected options.
	 * @param agent The agent configuration
	 * @param selectedOptions Map of option ID to value (boolean for toggles, string for inputs)
	 * @returns Array of command arguments
	 */
	buildAgentArgs(
		agent: AgentConfig,
		selectedOptions: Record<string, boolean | string>,
	): string[] {
		const args: string[] = [];

		// Add base args first (for migration/advanced use)
		if (agent.baseArgs) {
			args.push(...agent.baseArgs);
		}

		// Process each option
		for (const option of agent.options) {
			const value = selectedOptions[option.id];

			if (value === undefined || value === false || value === '') {
				continue; // Skip disabled or empty options
			}

			if (option.type === 'boolean' && value === true) {
				// Boolean flag - just add the flag
				if (option.flag) {
					args.push(option.flag);
				}
			} else if (
				option.type === 'string' &&
				typeof value === 'string' &&
				value
			) {
				// String option - add flag and value
				if (option.flag) {
					args.push(option.flag, value);
				} else {
					// No flag means positional argument
					args.push(value);
				}
			}
		}

		return args;
	}

	/**
	 * Validate that selected options don't violate mutual exclusivity constraints.
	 * @returns Array of error messages (empty if valid)
	 */
	validateAgentOptions(
		agent: AgentConfig,
		selectedOptions: Record<string, boolean | string>,
	): string[] {
		const errors: string[] = [];

		// Group options by their group field
		const groups = new Map<
			string,
			{option: (typeof agent.options)[0]; value: boolean | string}[]
		>();

		for (const option of agent.options) {
			if (!option.group) continue;

			const value = selectedOptions[option.id];
			const isActive = value !== undefined && value !== false && value !== '';

			if (isActive) {
				if (!groups.has(option.group)) {
					groups.set(option.group, []);
				}
				groups.get(option.group)!.push({option, value});
			}
		}

		// Check for multiple active options in the same group
		for (const [groupName, activeOptions] of groups) {
			if (activeOptions.length > 1) {
				const labels = activeOptions.map(o => o.option.label).join(', ');
				errors.push(
					`Options "${labels}" are mutually exclusive (group: ${groupName}). Select only one.`,
				);
			}
		}

		return errors;
	}

	getWorktreeLastOpened(): Record<string, number> {
		return Object.fromEntries(this.worktreeLastOpened);
	}

	setWorktreeLastOpened(worktreePath: string, timestamp: number): void {
		this.worktreeLastOpened.set(worktreePath, timestamp);
	}

	getWorktreeLastOpenedTime(worktreePath: string): number | undefined {
		return this.worktreeLastOpened.get(worktreePath);
	}

	// Effect-based methods for type-safe error handling

	/**
	 * Load configuration from file with Effect-based error handling
	 *
	 * @returns {Effect.Effect<ConfigurationData, FileSystemError | ConfigError, never>} Configuration data on success, errors on failure
	 *
	 * @example
	 * ```typescript
	 * const result = await Effect.runPromise(
	 *   configManager.loadConfigEffect()
	 * );
	 * ```
	 */
	loadConfigEffect(): Effect.Effect<
		ConfigurationData,
		FileSystemError | ConfigError,
		never
	> {
		return Effect.try({
			try: () => {
				// Try to load the new config file
				if (existsSync(this.configPath)) {
					const configData = readFileSync(this.configPath, 'utf-8');
					const parsedConfig = JSON.parse(configData);
					return this.applyDefaults(parsedConfig);
				} else {
					// If new config doesn't exist, check for legacy shortcuts.json
					const migratedConfig = this.migrateLegacyShortcutsSync();
					return this.applyDefaults(migratedConfig || {});
				}
			},
			catch: (error: unknown) => {
				// Determine error type
				if (error instanceof SyntaxError) {
					return new ConfigError({
						configPath: this.configPath,
						reason: 'parse',
						details: String(error),
					});
				}
				return new FileSystemError({
					operation: 'read',
					path: this.configPath,
					cause: String(error),
				});
			},
		});
	}

	/**
	 * Save configuration to file with Effect-based error handling
	 *
	 * @returns {Effect.Effect<void, FileSystemError, never>} Void on success, FileSystemError on write failure
	 *
	 * @example
	 * ```typescript
	 * await Effect.runPromise(
	 *   configManager.saveConfigEffect(config)
	 * );
	 * ```
	 */
	saveConfigEffect(
		config: ConfigurationData,
	): Effect.Effect<void, FileSystemError, never> {
		return Effect.try({
			try: () => {
				this.config = config;
				writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
			},
			catch: (error: unknown) => {
				return new FileSystemError({
					operation: 'write',
					path: this.configPath,
					cause: String(error),
				});
			},
		});
	}

	/**
	 * Validate configuration structure
	 * Synchronous validation using Either
	 */
	validateConfig(
		config: unknown,
	): Either.Either<ValidationError, ConfigurationData> {
		if (!config || typeof config !== 'object') {
			return Either.left(
				new ValidationError({
					field: 'config',
					constraint: 'must be a valid configuration object',
					receivedValue: config,
				}),
			) as Either.Either<ValidationError, ConfigurationData>;
		}

		// Validate shortcuts field if present
		const configObj = config as Record<string, unknown>;
		if (
			configObj['shortcuts'] !== undefined &&
			(typeof configObj['shortcuts'] !== 'object' ||
				configObj['shortcuts'] === null)
		) {
			return Either.left(
				new ValidationError({
					field: 'config',
					constraint: 'shortcuts must be a valid object',
					receivedValue: config,
				}),
			) as unknown as Either.Either<ValidationError, ConfigurationData>;
		}

		// Additional validation could go here
		return Either.right(
			config as ConfigurationData,
		) as unknown as Either.Either<ValidationError, ConfigurationData>;
	}

	/**
	 * Get preset by ID with Either-based error handling
	 * Synchronous lookup using Either
	 */
	getPresetByIdEffect(
		id: string,
	): Either.Either<ValidationError, CommandPreset> {
		const presets = this.getCommandPresets();
		const preset = presets.presets.find(p => p.id === id);

		if (!preset) {
			return Either.left(
				new ValidationError({
					field: 'presetId',
					constraint: 'Preset not found',
					receivedValue: id,
				}),
			) as unknown as Either.Either<ValidationError, CommandPreset>;
		}

		return Either.right(preset) as unknown as Either.Either<
			ValidationError,
			CommandPreset
		>;
	}

	/**
	 * Set shortcuts with Effect-based error handling
	 *
	 * @returns {Effect.Effect<void, FileSystemError, never>} Void on success, FileSystemError on save failure
	 *
	 * @example
	 * ```typescript
	 * await Effect.runPromise(
	 *   configManager.setShortcutsEffect(shortcuts)
	 * );
	 * ```
	 */
	setShortcutsEffect(
		shortcuts: ShortcutConfig,
	): Effect.Effect<void, FileSystemError, never> {
		this.config.shortcuts = shortcuts;
		return this.saveConfigEffect(this.config);
	}

	/**
	 * Set command presets with Effect-based error handling
	 */
	setCommandPresetsEffect(
		presets: CommandPresetsConfig,
	): Effect.Effect<void, FileSystemError, never> {
		this.config.commandPresets = presets;
		return this.saveConfigEffect(this.config);
	}

	/**
	 * Add or update preset with Effect-based error handling
	 */
	addPresetEffect(
		preset: CommandPreset,
	): Effect.Effect<void, FileSystemError, never> {
		const presets = this.getCommandPresets();

		// Replace if exists, otherwise add
		const existingIndex = presets.presets.findIndex(p => p.id === preset.id);
		if (existingIndex >= 0) {
			presets.presets[existingIndex] = preset;
		} else {
			presets.presets.push(preset);
		}

		return this.setCommandPresetsEffect(presets);
	}

	/**
	 * Delete preset with Effect-based error handling
	 */
	deletePresetEffect(
		id: string,
	): Effect.Effect<void, ValidationError | FileSystemError, never> {
		const presets = this.getCommandPresets();

		// Don't delete if it's the last preset
		if (presets.presets.length <= 1) {
			return Effect.fail(
				new ValidationError({
					field: 'presetId',
					constraint: 'Cannot delete last preset',
					receivedValue: id,
				}),
			);
		}

		// Remove the preset
		presets.presets = presets.presets.filter(p => p.id !== id);

		// Update default if needed
		if (presets.defaultPresetId === id && presets.presets.length > 0) {
			presets.defaultPresetId = presets.presets[0]!.id;
		}

		return this.setCommandPresetsEffect(presets);
	}

	/**
	 * Set default preset with Effect-based error handling
	 */
	setDefaultPresetEffect(
		id: string,
	): Effect.Effect<void, ValidationError | FileSystemError, never> {
		const presets = this.getCommandPresets();

		// Only update if preset exists
		if (!presets.presets.some(p => p.id === id)) {
			return Effect.fail(
				new ValidationError({
					field: 'presetId',
					constraint: 'Preset not found',
					receivedValue: id,
				}),
			);
		}

		presets.defaultPresetId = id;
		return this.setCommandPresetsEffect(presets);
	}

	// Helper methods

	/**
	 * Apply default values to configuration
	 */
	private applyDefaults(config: ConfigurationData): ConfigurationData {
		// Ensure default values
		if (!config.shortcuts) {
			config.shortcuts = DEFAULT_SHORTCUTS;
		}
		if (!config.statusHooks) {
			config.statusHooks = {};
		}
		if (!config.worktreeHooks) {
			config.worktreeHooks = {};
		}
		if (!config.worktree) {
			config.worktree = {
				autoDirectory: false,
				copySessionData: true,
				sortByLastSession: false,
			};
		}
		if (
			!Object.prototype.hasOwnProperty.call(config.worktree, 'copySessionData')
		) {
			config.worktree.copySessionData = true;
		}
		if (
			!Object.prototype.hasOwnProperty.call(
				config.worktree,
				'sortByLastSession',
			)
		) {
			config.worktree.sortByLastSession = false;
		}
		if (!config.command) {
			config.command = {
				command: 'claude',
			};
		}
		if (!config.autoApproval) {
			config.autoApproval = {
				enabled: false,
				timeout: 30,
			};
		} else {
			if (
				!Object.prototype.hasOwnProperty.call(config.autoApproval, 'enabled')
			) {
				config.autoApproval.enabled = false;
			}
			if (
				!Object.prototype.hasOwnProperty.call(config.autoApproval, 'timeout')
			) {
				config.autoApproval.timeout = 30;
			}
		}

		return config;
	}

	/**
	 * Synchronous legacy shortcuts migration helper
	 */
	private migrateLegacyShortcutsSync(): ConfigurationData | null {
		if (existsSync(this.legacyShortcutsPath)) {
			try {
				const shortcutsData = readFileSync(this.legacyShortcutsPath, 'utf-8');
				const shortcuts = JSON.parse(shortcutsData);

				// Validate that it's a valid shortcuts config
				if (shortcuts && typeof shortcuts === 'object') {
					const config: ConfigurationData = {shortcuts};
					// Save to new config format
					this.config = config;
					writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
					console.log(
						'Migrated shortcuts from legacy shortcuts.json to config.json',
					);
					return config;
				}
			} catch (error) {
				console.error('Failed to migrate legacy shortcuts:', error);
			}
		}
		return null;
	}

	/**
	 * Get whether auto-approval is enabled
	 */
	isAutoApprovalEnabled(): boolean {
		return this.config.autoApproval?.enabled ?? false;
	}

	/**
	 * Get the configured port for the web interface.
	 * Returns undefined if not set (caller should generate random port).
	 */
	getPort(): number | undefined {
		return this.config.port;
	}

	/**
	 * Set the port for the web interface.
	 * Used to persist a randomly generated port on first run.
	 */
	setPort(port: number): void {
		this.config.port = port;
		this.saveConfig();
	}

	/**
	 * Update authentication credentials (access token and/or passcode hash).
	 * Used by CLI auth commands.
	 */
	updateAuthCredentials(credentials: {
		accessToken?: string;
		passcodeHash?: string;
	}): void {
		if (credentials.accessToken !== undefined) {
			this.config.accessToken = credentials.accessToken;
		}
		if (credentials.passcodeHash !== undefined) {
			this.config.passcodeHash = credentials.passcodeHash;
		}
		this.saveConfig();
	}

	/**
	 * Get access token for auth validation.
	 */
	getAccessToken(): string | undefined {
		return this.config.accessToken;
	}

	/**
	 * Get passcode hash for auth validation.
	 */
	getPasscodeHash(): string | undefined {
		return this.config.passcodeHash;
	}

	/**
	 * Check if auth is fully configured (both token and passcode).
	 */
	isAuthConfigured(): boolean {
		return !!this.config.accessToken && !!this.config.passcodeHash;
	}
}

export const configurationManager = new ConfigurationManager();
