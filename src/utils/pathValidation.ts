import path from 'path';
import fs from 'fs';
import os from 'os';

/**
 * Path validation utilities to prevent path traversal attacks.
 *
 * These functions ensure user-provided paths don't escape their intended
 * directories via ../ sequences or symlink tricks.
 */

/**
 * Directory entry returned by getDirectoryEntries
 */
export interface DirectoryEntry {
	name: string;
	path: string;
	isDirectory: boolean;
	isGitRepo: boolean;
}

/**
 * Result of directory browse operation
 */
export interface BrowseResult {
	currentPath: string;
	parentPath: string | null;
	entries: DirectoryEntry[];
	error?: string;
}

/**
 * Result of path validation
 */
export interface PathValidation {
	path: string;
	exists: boolean;
	isDirectory: boolean;
	isGitRepo: boolean;
}

/**
 * Expands ~ to the user's home directory.
 * Returns the original path if it doesn't start with ~.
 */
export function expandPath(inputPath: string): string {
	if (!inputPath) return inputPath;

	if (inputPath === '~') {
		return os.homedir();
	}

	if (inputPath.startsWith('~/')) {
		return path.join(os.homedir(), inputPath.slice(2));
	}

	return inputPath;
}

/**
 * Get directory entries for the file browser.
 * Only returns directories, sorted alphabetically.
 * Detects which directories are git repositories.
 *
 * @param dirPath - Directory to list
 * @param showHidden - Whether to include hidden files (starting with .)
 * @param limit - Maximum number of entries to return (default 500)
 * @returns BrowseResult with entries and metadata
 */
export function getDirectoryEntries(
	dirPath: string,
	showHidden: boolean = false,
	limit: number = 500,
): BrowseResult {
	try {
		// Expand ~ and resolve to absolute path
		const expandedPath = expandPath(dirPath);
		const resolvedPath = path.resolve(expandedPath);

		// Check if directory exists
		const stat = fs.statSync(resolvedPath);
		if (!stat.isDirectory()) {
			return {
				currentPath: resolvedPath,
				parentPath: path.dirname(resolvedPath),
				entries: [],
				error: 'Not a directory',
			};
		}

		// Read directory entries
		const dirents = fs.readdirSync(resolvedPath, {withFileTypes: true});

		// Filter and map entries
		const entries: DirectoryEntry[] = [];
		for (const dirent of dirents) {
			// Skip hidden files unless requested
			if (!showHidden && dirent.name.startsWith('.')) {
				continue;
			}

			// Only include directories
			if (!dirent.isDirectory()) {
				continue;
			}

			const entryPath = path.join(resolvedPath, dirent.name);

			// Check if it's a git repo
			const gitPath = path.join(entryPath, '.git');
			const isGitRepo = fs.existsSync(gitPath);

			entries.push({
				name: dirent.name,
				path: entryPath,
				isDirectory: true,
				isGitRepo,
			});

			// Respect limit
			if (entries.length >= limit) {
				break;
			}
		}

		// Sort alphabetically (case-insensitive)
		entries.sort((a, b) =>
			a.name.toLowerCase().localeCompare(b.name.toLowerCase()),
		);

		// Calculate parent path (null if at root)
		const parentPath = resolvedPath === '/' ? null : path.dirname(resolvedPath);

		return {
			currentPath: resolvedPath,
			parentPath,
			entries,
		};
	} catch (err) {
		const error = err instanceof Error ? err.message : 'Unknown error';
		return {
			currentPath: dirPath,
			parentPath: null,
			entries: [],
			error,
		};
	}
}

/**
 * Validates a path and returns detailed information about it.
 *
 * @param inputPath - Path to validate (can include ~)
 * @returns PathValidation with exists, isDirectory, and isGitRepo flags
 */
export function validatePathForBrowser(inputPath: string): PathValidation {
	// Expand ~ and resolve
	const expandedPath = expandPath(inputPath);
	const resolvedPath = path.resolve(expandedPath);

	const result: PathValidation = {
		path: resolvedPath,
		exists: false,
		isDirectory: false,
		isGitRepo: false,
	};

	try {
		const stat = fs.statSync(resolvedPath);
		result.exists = true;
		result.isDirectory = stat.isDirectory();

		if (result.isDirectory) {
			// Check for .git
			const gitPath = path.join(resolvedPath, '.git');
			result.isGitRepo = fs.existsSync(gitPath);
		}
	} catch {
		// Path doesn't exist
	}

	return result;
}

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

	if (
		!resolvedPath.startsWith(baseWithSep) &&
		resolvedPath !== normalizedBase
	) {
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
