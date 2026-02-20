import {BaseAgentAdapter} from './base.js';

export class TerminalAdapter extends BaseAgentAdapter {
	constructor() {
		super({
			id: 'terminal',
			name: 'Terminal',
			icon: 'terminal',
			iconColor: '#6B7280',
			command: '$SHELL',
			sessionFormat: 'none',
		});
	}
}
