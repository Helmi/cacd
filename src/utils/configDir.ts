/**
 * Config directory utility module.
 *
 * IMPORTANT: initializeConfigDir() must be called before any service imports
 * that depend on the config directory (ConfigurationManager, ProjectManager).
 */

import {homedir} from 'os';
import {join} from 'path';

let _configDir: string | null = null;
let _isCustom = false;

/**
 * Initialize config directory from environment or default.
 * MUST be called at the start of cli.tsx before any service imports.
 */
export function initializeConfigDir(): string {
	if (_configDir) return _configDir;

	const envDir = process.env['ACD_CONFIG_DIR'];

	if (envDir) {
		_configDir = envDir;
		_isCustom = true;
	} else {
		const homeDir = homedir();
		_configDir =
			process.platform === 'win32'
				? join(
						process.env['APPDATA'] || join(homeDir, 'AppData', 'Roaming'),
						'ccmanager',
					)
				: join(homeDir, '.config', 'ccmanager');
		_isCustom = false;
	}

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
 * Check if a custom config dir was provided via ACD_CONFIG_DIR env var.
 */
export function isCustomConfigDir(): boolean {
	return _isCustom;
}
