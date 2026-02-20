import type {AgentConfig} from '../types/index.js';
import {BaseAgentAdapter} from './base.js';

export class GenericAdapter extends BaseAgentAdapter {
	constructor(agentConfig: AgentConfig) {
		super({
			id: agentConfig.id,
			name: agentConfig.name,
			icon: agentConfig.icon || 'bot',
			iconColor: agentConfig.iconColor,
			description: agentConfig.description,
			command: agentConfig.command,
			defaultOptions: agentConfig.options,
			baseArgs: agentConfig.baseArgs,
			detectionStrategy: agentConfig.detectionStrategy,
			sessionFormat: 'none',
		});
	}
}
