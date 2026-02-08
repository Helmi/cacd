import {SessionState, Terminal} from '../../types/index.js';
import {BaseStateDetector} from './base.js';

export class PiStateDetector extends BaseStateDetector {
	detectState(terminal: Terminal, _currentState: SessionState): SessionState {
		const content = this.getTerminalContent(terminal);
		const lowerContent = content.toLowerCase();

		// Pi doesn't do explicit permission prompts, but resume/session selection and
		// generic confirmation prompts should be treated as "waiting_input".
		if (
			lowerContent.includes('[y/n]') ||
			/press (enter|return) to (confirm|continue)/i.test(content) ||
			/(do you want|would you like|select a session|choose a session)/i.test(
				content,
			)
		) {
			return 'waiting_input';
		}

		// Busy indicators (generic)
		if (
			lowerContent.includes('ctrl+c to interrupt') ||
			lowerContent.includes('esc to interrupt') ||
			lowerContent.includes('esc to cancel')
		) {
			return 'busy';
		}

		return 'idle';
	}
}
