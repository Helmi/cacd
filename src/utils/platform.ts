/**
 * Cross-platform utilities for Windows, macOS, and Linux compatibility.
 *
 * Key design decisions:
 * - PTY sessions use PowerShell on Windows (better dev UX)
 * - shell: true uses cmd.exe on Windows (Node.js standard behavior)
 * - SystemRoot env var preserved for PowerShell compatibility
 */

/**
 * Platform detection constants.
 * Use these instead of checking process.platform directly.
 */
export const isWindows = process.platform === 'win32';
export const isMac = process.platform === 'darwin';
export const isLinux = process.platform === 'linux';

/**
 * Get the default interactive shell for PTY sessions.
 *
 * Windows: PowerShell (better UX for developers, modern shell features)
 * Unix: User's configured shell from SHELL env var
 *
 * Note: powershell.exe is Windows PowerShell (built-in).
 * pwsh is PowerShell Core (cross-platform, must be installed separately).
 * We use powershell.exe for maximum compatibility.
 */
export function getDefaultShell(): string {
	if (isWindows) {
		// PowerShell for interactive use - better dev experience
		return 'powershell.exe';
	}
	return process.env['SHELL'] || '/bin/sh';
}

/**
 * Get shell for child_process with shell: true.
 *
 * Windows: cmd.exe via COMSPEC (Node.js standard behavior)
 * Unix: /bin/sh
 *
 * This is the shell Node.js uses internally for shell: true.
 * Don't fight it - hooks and scripts should expect cmd.exe on Windows.
 */
export function getSpawnShell(): string {
	if (isWindows) {
		return process.env['COMSPEC'] || 'cmd.exe';
	}
	return '/bin/sh';
}

/**
 * Get environment variables for PTY spawn that work across platforms.
 *
 * Windows considerations:
 * - Don't set TERM/COLORTERM (node-pty handles ConPTY automatically)
 * - Preserve SystemRoot (required for PowerShell)
 * - Don't overwrite PATH with Path (case-insensitive on Windows)
 *
 * Unix considerations:
 * - Set TERM and COLORTERM for color support
 */
export function getPtyEnv(): Record<string, string | undefined> {
	if (isWindows) {
		// On Windows, don't override env vars - let node-pty handle ConPTY
		// SystemRoot is required for PowerShell to function
		return {
			...process.env,
		};
	}

	// Unix: set terminal capabilities
	return {
		...process.env,
		COLORTERM: 'truecolor',
		TERM: 'xterm-256color',
	};
}

/**
 * Check if running in a modern Windows terminal with full ANSI/Unicode support.
 *
 * Detects:
 * - Windows Terminal (WT_SESSION)
 * - VS Code integrated terminal
 * - ConEmu/Cmder
 */
export function isModernWindowsTerminal(): boolean {
	if (!isWindows) {
		return false;
	}

	// Windows Terminal (modern, full Unicode/ANSI)
	if (process.env['WT_SESSION']) {
		return true;
	}

	// VS Code integrated terminal
	if (process.env['TERM_PROGRAM'] === 'vscode') {
		return true;
	}

	// ConEmu/Cmder
	if (process.env['ConEmuANSI'] === 'ON') {
		return true;
	}

	return false;
}
