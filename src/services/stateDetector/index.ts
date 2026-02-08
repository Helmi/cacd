import {StateDetectionStrategy} from '../../types/index.js';
import {StateDetector} from './types.js';
import {ClaudeStateDetector} from './claude.js';
import {GeminiStateDetector} from './gemini.js';
import {CodexStateDetector} from './codex.js';
import {CursorStateDetector} from './cursor.js';
import {GitHubCopilotStateDetector} from './github-copilot.js';
import {ClineStateDetector} from './cline.js';
import {PiStateDetector} from './pi.js';

export function createStateDetector(
	strategy: StateDetectionStrategy = 'claude',
): StateDetector {
	switch (strategy) {
		case 'claude':
			return new ClaudeStateDetector();
		case 'gemini':
			return new GeminiStateDetector();
		case 'codex':
			return new CodexStateDetector();
		case 'cursor':
			return new CursorStateDetector();
		case 'github-copilot':
			return new GitHubCopilotStateDetector();
		case 'cline':
			return new ClineStateDetector();
		case 'pi':
			return new PiStateDetector();
		default:
			return new ClaudeStateDetector();
	}
}

// Re-export types and base class for convenience
export type {StateDetector} from './types.js';
export {BaseStateDetector} from './base.js';
export {ClaudeStateDetector} from './claude.js';
export {GeminiStateDetector} from './gemini.js';
export {CodexStateDetector} from './codex.js';
export {CursorStateDetector} from './cursor.js';
export {GitHubCopilotStateDetector} from './github-copilot.js';
export {ClineStateDetector} from './cline.js';
export {PiStateDetector} from './pi.js';
