import {existsSync, readFileSync} from 'fs';
import path from 'path';

/**
 * Project-local configuration schema
 * Loaded from .acd.json or .acd/config.json in project root
 */
export interface ProjectConfig {
	scripts?: {
		setup?: string;
		teardown?: string;
	};
}

/**
 * Load project configuration from .acd.json or .acd/config.json
 * @param projectRoot - Path to the project root (git root)
 * @returns ProjectConfig or null if no config found
 */
export function loadProjectConfig(projectRoot: string): ProjectConfig | null {
	// Discovery order
	const configPaths = [
		path.join(projectRoot, '.acd.json'),
		path.join(projectRoot, '.acd', 'config.json'),
	];

	for (const configPath of configPaths) {
		if (existsSync(configPath)) {
			try {
				const content = readFileSync(configPath, 'utf-8');
				const config = JSON.parse(content) as ProjectConfig;
				return config;
			} catch (error) {
				console.warn(`Failed to parse project config at ${configPath}: ${error}`);
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
		ACD_ROOT_PATH: opts.rootPath,
		ACD_WORKTREE_PATH: opts.worktreePath,
		ACD_WORKTREE_NAME: opts.worktreeName,
		ACD_BRANCH: opts.branch,
	};
}
