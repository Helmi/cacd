import {describe, it, expect, beforeEach} from 'vitest';
import {PiStateDetector} from '../stateDetector.js';
import type {Terminal} from '../../types/index.js';
import {createMockTerminal} from './testUtils.js';

describe('PiStateDetector', () => {
	let detector: PiStateDetector;
	let terminal: Terminal;

	beforeEach(() => {
		detector = new PiStateDetector();
	});

	it('should detect waiting_input state for [y/n] pattern', () => {
		terminal = createMockTerminal(['Continue? [y/n]', '> ']);
		const state = detector.detectState(terminal, 'idle');
		expect(state).toBe('waiting_input');
	});

	it('should detect waiting_input state for session selection prompts', () => {
		terminal = createMockTerminal(['Select a session to resume', '> ']);
		const state = detector.detectState(terminal, 'idle');
		expect(state).toBe('waiting_input');
	});

	it('should detect busy state for interrupt patterns', () => {
		terminal = createMockTerminal(['Working...', 'Ctrl+C to interrupt']);
		const state = detector.detectState(terminal, 'idle');
		expect(state).toBe('busy');
	});

	it('should prioritize waiting_input over busy', () => {
		terminal = createMockTerminal(['Esc to interrupt', '[y/n]']);
		const state = detector.detectState(terminal, 'idle');
		expect(state).toBe('waiting_input');
	});

	it('should detect idle state when no patterns match', () => {
		terminal = createMockTerminal(['Normal output', 'Ready']);
		const state = detector.detectState(terminal, 'idle');
		expect(state).toBe('idle');
	});
});
