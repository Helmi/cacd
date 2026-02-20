import type {AgentConfig, StateDetectionStrategy} from '../types/index.js';
import {ClaudeAdapter} from './claude.js';
import {CodexAdapter} from './codex.js';
import {GeminiAdapter} from './gemini.js';
import {CursorAdapter} from './cursor.js';
import {GitHubCopilotAdapter} from './githubCopilot.js';
import {ClineAdapter} from './cline.js';
import {PiAdapter} from './pi.js';
import {KilocodeAdapter} from './kilocode.js';
import {OpencodeAdapter} from './opencode.js';
import {DroidAdapter} from './droid.js';
import {TerminalAdapter} from './terminal.js';
import {GenericAdapter} from './generic.js';
import type {AgentAdapter} from './types.js';

const BUILTIN_ADAPTERS: AgentAdapter[] = [
	new ClaudeAdapter(),
	new CodexAdapter(),
	new GeminiAdapter(),
	new CursorAdapter(),
	new GitHubCopilotAdapter(),
	new ClineAdapter(),
	new PiAdapter(),
	new KilocodeAdapter(),
	new OpencodeAdapter(),
	new DroidAdapter(),
	new TerminalAdapter(),
];

export class AdapterRegistry {
	private adapters = new Map<string, AgentAdapter>();

	constructor(initialAdapters: AgentAdapter[] = BUILTIN_ADAPTERS) {
		for (const adapter of initialAdapters) {
			this.adapters.set(adapter.id, adapter);
		}
	}

	getAll(): AgentAdapter[] {
		return Array.from(this.adapters.values());
	}

	getById(id: string | undefined): AgentAdapter | null {
		if (!id) return null;
		return this.adapters.get(id) || null;
	}

	getByStrategy(strategy: StateDetectionStrategy): AgentAdapter | null {
		for (const adapter of this.adapters.values()) {
			if (adapter.detectionStrategy === strategy) {
				return adapter;
			}
		}
		return null;
	}

	getByAgentType(agentType: string | undefined): AgentAdapter | null {
		if (!agentType) return null;
		const normalized = agentType.toLowerCase();
		if (this.adapters.has(normalized)) {
			return this.adapters.get(normalized) || null;
		}

		for (const adapter of this.adapters.values()) {
			if (adapter.detectionStrategy === normalized) {
				return adapter;
			}
		}

		return null;
	}

	createGeneric(agentConfig: AgentConfig): AgentAdapter {
		return new GenericAdapter(agentConfig);
	}
}

export const adapterRegistry = new AdapterRegistry();
