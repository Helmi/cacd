// Re-export from the modular stateDetector directory for backward compatibility
export {
	createStateDetector,
	BaseStateDetector,
	ClaudeStateDetector,
	GeminiStateDetector,
	CodexStateDetector,
	CursorStateDetector,
	GitHubCopilotStateDetector,
	ClineStateDetector,
} from './stateDetector/index.js';

// Type-only re-export
export type {StateDetector} from './stateDetector/index.js';
