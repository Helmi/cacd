/**
 * Config directory utility module.
 *
 * IMPORTANT: initializeConfigDir() must be called before any service imports
 * that depend on the config directory (ConfigurationManager, ProjectManager).
 *
 * Dev mode (CACD_DEV=1): Uses local .cacd-dev/ directory in current working directory.
 * Production mode: Uses global ~/.config/cacd/ directory.
 */

import {homedir} from 'os';
import {join} from 'path';
import {isDevMode} from '../constants/env.js';

let _configDir: string | null = null;
let _isCustom = false;
let _isDevModeConfig = false;

/**
 * Initialize config directory based on mode.
 * - Dev mode (CACD_DEV=1): Uses .cacd-dev/ in current working directory
 * - Production: Uses global ~/.config/cacd/
 *
 * MUST be called at the start of cli.tsx before any service imports.
 */
export function initializeConfigDir(): string {
	if (_configDir) return _configDir;

	// Dev mode: use local .cacd-dev/ directory
	if (isDevMode()) {
		_configDir = join(process.cwd(), '.cacd-dev');
		_isCustom = true;
		_isDevModeConfig = true;
		return _configDir;
	}

	// Production mode: use global config directory
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
 * Check if a custom config dir was provided (dev mode uses local .cacd-dev/).
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
