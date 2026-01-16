import path from 'path';
import fs from 'fs';

/**
 * Path validation utilities to prevent path traversal attacks.
 *
 * These functions ensure user-provided paths don't escape their intended
 * directories via ../ sequences or symlink tricks.
 */

/**
 * Validates that a file path stays within a base directory.
 * Prevents path traversal attacks like "../../../etc/passwd".
 *
 * @param basePath - The allowed base directory (must be absolute)
 * @param filePath - The relative file path to validate
 * @returns The resolved absolute path if valid
 * @throws Error if path escapes base directory
 */
export function validatePathWithinBase(
	basePath: string,
	filePath: string,
): string {
	// Normalize the base path
	const normalizedBase = path.resolve(basePath);

	// Resolve the full path (handles ../, ./, etc.)
	const resolvedPath = path.resolve(normalizedBase, filePath);

	// Check if resolved path starts with base path
	// Add trailing slash to prevent prefix attacks (e.g., /foo matching /foobar)
	const baseWithSep = normalizedBase.endsWith(path.sep)
		? normalizedBase
		: normalizedBase + path.sep;

	if (!resolvedPath.startsWith(baseWithSep) && resolvedPath !== normalizedBase) {
		throw new Error(
			`Path traversal detected: "${filePath}" escapes base directory`,
		);
	}

	return resolvedPath;
}

/**
 * Validates that a directory path exists and is a git repository.
 * This provides basic sanity checking for worktree/project paths.
 *
 * @param dirPath - The directory path to validate
 * @returns true if valid git directory
 */
export function isGitDirectory(dirPath: string): boolean {
	try {
		const resolved = path.resolve(dirPath);

		// Check directory exists
		const stat = fs.statSync(resolved);
		if (!stat.isDirectory()) {
			return false;
		}

		// Check for .git (file for worktrees, directory for main repos)
		const gitPath = path.join(resolved, '.git');
		return fs.existsSync(gitPath);
	} catch {
		return false;
	}
}

/**
 * Validates a worktree path is a real git directory.
 * Returns the normalized absolute path if valid.
 *
 * @param worktreePath - The worktree path from user input
 * @returns The normalized absolute path
 * @throws Error if not a valid git directory
 */
export function validateWorktreePath(worktreePath: string): string {
	const resolved = path.resolve(worktreePath);

	if (!isGitDirectory(resolved)) {
		throw new Error(`Invalid worktree path: not a git directory`);
	}

	return resolved;
}
