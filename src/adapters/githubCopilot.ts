import {BaseAgentAdapter} from './base.js';

export class GitHubCopilotAdapter extends BaseAgentAdapter {
	constructor() {
		super({
			id: 'github-copilot',
			name: 'GitHub Copilot CLI',
			icon: 'github',
			command: 'gh copilot',
			detectionStrategy: 'github-copilot',
			sessionFormat: 'none',
		});
	}
}
