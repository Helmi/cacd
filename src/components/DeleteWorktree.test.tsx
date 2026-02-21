import React from 'react';
import {render} from 'ink-testing-library';
import {describe, it, expect, vi, beforeEach} from 'vitest';
import DeleteWorktree from './DeleteWorktree.js';
import {Worktree} from '../types/index.js';

const {mockFetchWorktrees} = vi.hoisted(() => ({
	mockFetchWorktrees: vi.fn(),
}));

vi.mock('./tuiApiClient.js', () => ({
	tuiApiClient: {
		fetchWorktrees: mockFetchWorktrees,
	},
	worktreeBelongsToProject: vi.fn(() => true),
}));

vi.mock('../services/shortcutManager.js', () => ({
	shortcutManager: {
		matchesShortcut: vi.fn(),
		getShortcutDisplay: vi.fn(() => 'Esc'),
	},
}));

// Mock stdin to avoid useInput errors
vi.mock('ink', async () => {
	const actual = await vi.importActual<typeof import('ink')>('ink');
	return {
		...actual,
		useInput: vi.fn(),
	};
});

// Mock SelectInput to render items as simple text
vi.mock('ink-select-input', async () => {
	const React = await vi.importActual<typeof import('react')>('react');
	const {Text, Box} = await vi.importActual<typeof import('ink')>('ink');

	return {
		default: ({items}: {items: Array<{label: string; value: string}>}) => {
			return React.createElement(
				Box,
				{flexDirection: 'column'},
				items.map((item: {label: string}, index: number) =>
					React.createElement(Text, {key: index}, item.label),
				),
			);
		},
	};
});

describe('DeleteWorktree - Effect Integration', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('should load worktrees using Effect-based method', async () => {
		// GIVEN: Mock worktrees returned by API client
		const mockWorktrees: Worktree[] = [
			{
				path: '/test/worktree1',
				branch: 'feature-1',
				isMainWorktree: false,
				hasSession: false,
			},
			{
				path: '/test/worktree2',
				branch: 'feature-2',
				isMainWorktree: false,
				hasSession: false,
			},
		];

		mockFetchWorktrees.mockResolvedValue(mockWorktrees);

		const onComplete = vi.fn();
		const onCancel = vi.fn();

		// WHEN: Component is rendered
		const {lastFrame} = render(
			<DeleteWorktree onComplete={onComplete} onCancel={onCancel} />,
		);

		// Wait for Effect to execute
		await new Promise(resolve => setTimeout(resolve, 50));

		// THEN: API method should be called
		expect(mockFetchWorktrees).toHaveBeenCalled();

		// AND: Worktrees should be displayed
		const output = lastFrame();
		expect(output).toContain('feature-1');
		expect(output).toContain('feature-2');
	});

	it('should handle GitError from getWorktreesEffect gracefully', async () => {
		// GIVEN: API request that fails
		mockFetchWorktrees.mockRejectedValue(
			new Error('git worktree list --porcelain\nnot a git repository'),
		);

		const onComplete = vi.fn();
		const onCancel = vi.fn();

		// WHEN: Component is rendered
		const {lastFrame} = render(
			<DeleteWorktree onComplete={onComplete} onCancel={onCancel} />,
		);

		// Wait for Effect to execute
		await new Promise(resolve => setTimeout(resolve, 50));

		// THEN: Error should be displayed
		const output = lastFrame();
		expect(output).toContain('Error loading worktrees:');
		expect(output).toContain('not a git repository');
	});

	it('should filter out main worktree from deletable list', async () => {
		// GIVEN: Mock worktrees including main worktree
		const mockWorktrees: Worktree[] = [
			{
				path: '/test/main',
				branch: 'main',
				isMainWorktree: true,
				hasSession: false,
			},
			{
				path: '/test/feature',
				branch: 'feature-1',
				isMainWorktree: false,
				hasSession: false,
			},
		];

		mockFetchWorktrees.mockResolvedValue(mockWorktrees);

		const onComplete = vi.fn();
		const onCancel = vi.fn();

		// WHEN: Component is rendered
		const {lastFrame} = render(
			<DeleteWorktree onComplete={onComplete} onCancel={onCancel} />,
		);

		// Wait for Effect to execute
		await new Promise(resolve => setTimeout(resolve, 50));

		// THEN: Only non-main worktree should be shown
		const output = lastFrame();
		expect(output).toContain('feature-1');
		expect(output).not.toContain('main');
	});
});
