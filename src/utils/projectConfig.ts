import {existsSync, readFileSync} from 'fs';
import path from 'path';

/**
 * Project-local configuration schema
 * Loaded from .cacd.json or .cacd/config.json in project root
 */
export interface ProjectConfig {
	scripts?: {
		setup?: string;
		teardown?: string;
	};
}

/**
 * Load project configuration from .cacd.json or .cacd/config.json
 * @param projectRoot - Path to the project root (git root)
 * @returns ProjectConfig or null if no config found
 */
export function loadProjectConfig(projectRoot: string): ProjectConfig | null {
	// Discovery order
	const configPaths = [
		path.join(projectRoot, '.cacd.json'),
		path.join(projectRoot, '.cacd', 'config.json'),
	];

	for (const configPath of configPaths) {
		if (existsSync(configPath)) {
			try {
				const content = readFileSync(configPath, 'utf-8');
				const config = JSON.parse(content) as ProjectConfig;
				return config;
			} catch (error) {
				console.warn(
					`Failed to parse project config at ${configPath}: ${error}`,
				);
				return null;
			}
		}
	}

	return null;
}

/**
 * Build environment variables for hook execution
 */
export function buildHookEnvironment(opts: {
	rootPath: string;
	worktreePath: string;
	worktreeName: string;
	branch: string;
}): Record<string, string> {
	return {
		CACD_ROOT_PATH: opts.rootPath,
		CACD_WORKTREE_PATH: opts.worktreePath,
		CACD_WORKTREE_NAME: opts.worktreeName,
		CACD_BRANCH: opts.branch,
	};
}
