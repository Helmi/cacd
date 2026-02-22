import {describe, expect, it} from 'vitest';
import {detectStateForStrategy} from './stateDetection.js';
import type {
	Terminal,
	SessionState,
	StateDetectionStrategy,
} from '../types/index.js';

function terminalFromLines(lines: string[]): Terminal {
	const padded = lines.slice();
	return {
		buffer: {
			active: {
				length: padded.length,
				getLine: (index: number) => {
					const text = padded[index];
					if (text === undefined) return undefined;
					return {
						translateToString: () => text,
					};
				},
			},
		},
	} as unknown as Terminal;
}

function detect(
	strategy: StateDetectionStrategy,
	lines: string[],
	currentState: SessionState = 'idle',
): SessionState {
	return detectStateForStrategy(
		strategy,
		terminalFromLines(lines),
		currentState,
	);
}

describe('detectStateForStrategy', () => {
	it('preserves Claude current state while Ctrl+R search hint is shown', () => {
		expect(
			detect('claude', ['Press Ctrl+R to toggle history search'], 'busy'),
		).toBe('busy');
	});

	it('detects Codex confirmation as waiting_input', () => {
		expect(detect('codex', ['Press Enter to confirm or Esc to cancel'])).toBe(
			'waiting_input',
		);
	});

	it('detects Gemini busy from esc-to-cancel prompt', () => {
		expect(detect('gemini', ['Running...', 'Esc to cancel'])).toBe('busy');
	});

	it('detects Cursor confirmation prompts as waiting_input', () => {
		expect(detect('cursor', ['Keep (n)', '(y) (enter)'])).toBe('waiting_input');
	});

	it('detects Cline ready banner as idle', () => {
		expect(
			detect('cline', ['[act mode] Cline is ready for your message']),
		).toBe('idle');
	});

	it('detects Pi confirmation prompts as waiting_input', () => {
		expect(detect('pi', ['Do you want to continue? [y/n]'])).toBe(
			'waiting_input',
		);
	});

	it('falls back to current state for unknown strategies', () => {
		expect(
			detectStateForStrategy(
				'unknown' as StateDetectionStrategy,
				terminalFromLines(['unrelated output']),
				'busy',
			),
		).toBe('busy');
	});
});
