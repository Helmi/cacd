/**
 * Config directory utility module.
 *
 * IMPORTANT: initializeConfigDir() must be called before any service imports
 * that depend on the config directory (ConfigurationManager, ProjectManager).
 *
 * Priority order:
 * 1. CACD_CONFIG_DIR env var (explicit custom path)
 * 2. CACD_DEV=1 (dev mode uses local .cacd-dev/ directory)
 * 3. Default global path (~/.config/cacd/ or %APPDATA%/cacd on Windows)
 */

import {homedir} from 'os';
import {join} from 'path';
import {ENV_VARS, isDevMode} from '../constants/env.js';

let _configDir: string | null = null;
let _isCustom = false;
let _isDevModeConfig = false;

/**
 * Initialize config directory based on environment and mode.
 *
 * Priority:
 * 1. CACD_CONFIG_DIR env var (explicit override)
 * 2. CACD_DEV=1 (dev mode: .cacd-dev/ in current working directory)
 * 3. Default global path
 *
 * MUST be called at the start of cli.tsx before any service imports.
 */
export function initializeConfigDir(): string {
	if (_configDir) return _configDir;

	// Priority 1: Explicit config dir from env var
	const customConfigDir = process.env[ENV_VARS.CONFIG_DIR];
	if (customConfigDir) {
		_configDir = customConfigDir;
		_isCustom = true;
		_isDevModeConfig = false;
		return _configDir;
	}

	// Priority 2: Dev mode uses local .cacd-dev/ directory
	if (isDevMode()) {
		_configDir = join(process.cwd(), '.cacd-dev');
		_isCustom = true;
		_isDevModeConfig = true;
		return _configDir;
	}

	// Priority 3: Default global config directory
	const homeDir = homedir();
	_configDir =
		process.platform === 'win32'
			? join(
					process.env['APPDATA'] || join(homeDir, 'AppData', 'Roaming'),
					'cacd',
				)
			: join(homeDir, '.config', 'cacd');
	_isCustom = false;
	_isDevModeConfig = false;

	return _configDir;
}

/**
 * Get the config directory. Must call initializeConfigDir() first.
 * @throws Error if not initialized
 */
export function getConfigDir(): string {
	if (!_configDir) {
		throw new Error(
			'Config directory not initialized. Call initializeConfigDir() first in cli.tsx.',
		);
	}
	return _configDir;
}

/**
 * Check if a custom config dir was provided.
 * True when CACD_CONFIG_DIR is set or in dev mode (.cacd-dev/).
 */
export function isCustomConfigDir(): boolean {
	return _isCustom;
}

/**
 * Check if running with dev mode config (.cacd-dev/ directory).
 */
export function isDevModeConfig(): boolean {
	return _isDevModeConfig;
}
