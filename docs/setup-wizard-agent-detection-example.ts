/**
 * Agent Detection Utility
 * 
 * Detects which agent binaries are installed on the system.
 * Used during setup wizard to show which agents are available.
 */

import {execSync} from 'child_process';
import {AgentConfig} from '../types/index.js';

/**
 * Detect which agents from the provided list are installed on the system.
 * 
 * @param agents - Array of agent configurations to check
 * @returns Array of agent IDs that are installed
 * 
 * @example
 * ```typescript
 * const agents = configurationManager.getAgents();
 * const detected = detectInstalledAgents(agents);
 * // Returns: ['claude', 'terminal']
 * ```
 */
export function detectInstalledAgents(agents: AgentConfig[]): AgentConfig[] {
	return agents.filter(agent => {
		// Terminal is always available (uses $SHELL)
		if (agent.command === '$SHELL') {
			return true;
		}

		// Check if command exists using 'which' (Unix) or 'where' (Windows)
		try {
			const command = process.platform === 'win32' ? 'where' : 'which';
			execSync(`${command} ${agent.command}`, {
				stdio: 'ignore', // Suppress output
			});
			return true;
		} catch {
			// Command not found
			return false;
		}
	});
}

/**
 * Get detection status for all agents (installed/not installed).
 * 
 * @param agents - Array of agent configurations to check
 * @returns Map of agent ID to boolean (true = installed)
 */
export function getAgentDetectionStatus(
	agents: AgentConfig[],
): Map<string, boolean> {
	const status = new Map<string, boolean>();

	for (const agent of agents) {
		if (agent.command === '$SHELL') {
			status.set(agent.id, true);
			continue;
		}

		try {
			const command = process.platform === 'win32' ? 'where' : 'which';
			execSync(`${command} ${agent.command}`, {stdio: 'ignore'});
			status.set(agent.id, true);
		} catch {
			status.set(agent.id, false);
		}
	}

	return status;
}

/**
 * Check if a specific agent is installed.
 * 
 * @param agent - Agent configuration to check
 * @returns true if agent command is available
 */
export function isAgentInstalled(agent: AgentConfig): boolean {
	if (agent.command === '$SHELL') {
		return true;
	}

	try {
		const command = process.platform === 'win32' ? 'where' : 'which';
		execSync(`${command} ${agent.command}`, {stdio: 'ignore'});
		return true;
	} catch {
		return false;
	}
}

/**
 * Alternative: Async version using promises (if needed for non-blocking detection)
 * 
 * @param agents - Array of agent configurations to check
 * @returns Promise resolving to array of installed agent IDs
 */
export async function detectInstalledAgentsAsync(
	agents: AgentConfig[],
): Promise<AgentConfig[]> {
	const {exec} = await import('child_process');
	const {promisify} = await import('util');
	const execAsync = promisify(exec);

	const results = await Promise.allSettled(
		agents.map(async agent => {
			if (agent.command === '$SHELL') {
				return {agent, installed: true};
			}

			try {
				const command = process.platform === 'win32' ? 'where' : 'which';
				await execAsync(`${command} ${agent.command}`);
				return {agent, installed: true};
			} catch {
				return {agent, installed: false};
			}
		}),
	);

	return results
		.filter(
			(result): result is PromiseFulfilledResult<{agent: AgentConfig; installed: boolean}> =>
				result.status === 'fulfilled' && result.value.installed,
		)
		.map(result => result.value.agent);
}
