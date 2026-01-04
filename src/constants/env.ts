// Environment variable names
export const ENV_VARS = {
	MULTI_PROJECT_ROOT: 'ACD_PROJECTS_DIR',
	CONFIG_DIR: 'ACD_CONFIG_DIR',
	PORT: 'ACD_PORT',
} as const;

// Port configuration
export const PORT_RANGE = {
	MIN: 10000,
	MAX: 65535,
} as const;

/**
 * Generate a random port within the configured range.
 * Used when no port is configured on first run.
 */
export function generateRandomPort(): number {
	return (
		Math.floor(Math.random() * (PORT_RANGE.MAX - PORT_RANGE.MIN + 1)) +
		PORT_RANGE.MIN
	);
}
