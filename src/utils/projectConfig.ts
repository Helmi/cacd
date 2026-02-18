import {existsSync, readFileSync, readdirSync} from 'fs';
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
	td?: {
		/** Enable td integration for this project (default: auto-detect) */
		enabled?: boolean;
		/** Auto-run `td start` when launching sessions linked to a task */
		autoStart?: boolean;
		/** Default prompt template to use for agent sessions */
		defaultPrompt?: string;
	};
}

/**
 * A prompt template stored in .cacd/prompts/
 */
export interface PromptTemplate {
	/** Filename without extension */
	name: string;
	/** Full path to the template file */
	path: string;
	/** Template content */
	content: string;
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
 * Get the .cacd/ directory path for a project.
 * Returns null if it doesn't exist.
 */
export function getCacdDir(projectRoot: string): string | null {
	const cacdDir = path.join(projectRoot, '.cacd');
	return existsSync(cacdDir) ? cacdDir : null;
}

/**
 * Get the prompts directory path (.cacd/prompts/).
 * Returns null if it doesn't exist.
 */
export function getPromptsDir(projectRoot: string): string | null {
	const promptsDir = path.join(projectRoot, '.cacd', 'prompts');
	return existsSync(promptsDir) ? promptsDir : null;
}

/**
 * Load all prompt templates from .cacd/prompts/ directory.
 * Templates are plain text files (*.md or *.txt).
 */
export function loadPromptTemplates(projectRoot: string): PromptTemplate[] {
	const promptsDir = getPromptsDir(projectRoot);
	if (!promptsDir) return [];

	try {
		const files = readdirSync(promptsDir);
		const templates: PromptTemplate[] = [];

		for (const file of files) {
			if (!file.endsWith('.md') && !file.endsWith('.txt')) continue;

			const filePath = path.join(promptsDir, file);
			try {
				const content = readFileSync(filePath, 'utf-8');
				const name = file.replace(/\.(md|txt)$/, '');
				templates.push({name, path: filePath, content});
			} catch {
				// Skip unreadable files
			}
		}

		return templates;
	} catch {
		return [];
	}
}

/**
 * Load a specific prompt template by name.
 */
export function loadPromptTemplate(
	projectRoot: string,
	name: string,
): PromptTemplate | null {
	const templates = loadPromptTemplates(projectRoot);
	return templates.find((t) => t.name === name) ?? null;
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
