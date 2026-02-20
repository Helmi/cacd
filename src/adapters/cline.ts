import {BaseAgentAdapter} from './base.js';

export class ClineAdapter extends BaseAgentAdapter {
	constructor() {
		super({
			id: 'cline',
			name: 'Cline',
			icon: 'bot',
			command: 'cline',
			detectionStrategy: 'cline',
			sessionFormat: 'none',
		});
	}
}
