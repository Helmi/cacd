import React from 'react';
import {render} from 'ink-testing-library';
import NewWorktree from './NewWorktree.js';
import {vi, describe, it, expect, beforeEach, afterEach} from 'vitest';

const {mockFetchBranches, mockFetchDefaultBranch} = vi.hoisted(() => ({
	mockFetchBranches: vi.fn(),
	mockFetchDefaultBranch: vi.fn(),
}));

vi.mock('./tuiApiClient.js', () => ({
	tuiApiClient: {
		fetchBranches: mockFetchBranches,
		fetchDefaultBranch: mockFetchDefaultBranch,
	},
}));

// Mock node-pty to avoid native module issues in tests
vi.mock('node-pty', () => ({
	spawn: vi.fn(),
}));

// Mock ink to avoid stdin issues
vi.mock('ink', async () => {
	const actual = await vi.importActual<typeof import('ink')>('ink');
	return {
		...actual,
		useInput: vi.fn(),
	};
});

// Mock TextInputWrapper
vi.mock('./TextInputWrapper.js', async () => {
	const React = await vi.importActual<typeof import('react')>('react');
	const {Text} = await vi.importActual<typeof import('ink')>('ink');

	return {
		default: ({value}: {value: string}) => {
			return React.createElement(Text, {}, value || 'input');
		},
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

// Mock dependencies
vi.mock('../services/shortcutManager.js', () => ({
	shortcutManager: {
		getShortcutDisplay: () => 'Ctrl+C',
		matchesShortcut: () => false,
	},
}));

vi.mock('../services/configurationManager.js', () => ({
	configurationManager: {
		getWorktreeConfig: () => ({
			autoDirectory: false,
			autoDirectoryPattern: '../{project}-{branch}',
			copySessionData: true,
		}),
	},
}));

vi.mock('../hooks/useSearchMode.js', () => ({
	useSearchMode: () => ({
		isSearchMode: false,
		searchQuery: '',
		selectedIndex: 0,
		setSearchQuery: vi.fn(),
	}),
}));

describe('NewWorktree component API integration', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockFetchBranches.mockResolvedValue(['main']);
		mockFetchDefaultBranch.mockResolvedValue('main');
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('should show loading indicator while branches load', () => {
		mockFetchBranches.mockImplementation(
			() =>
				new Promise<string[]>(() => {
					// keep pending to test loading state
				}),
		);
		mockFetchDefaultBranch.mockImplementation(
			() =>
				new Promise<string>(() => {
					// keep pending to test loading state
				}),
		);

		const onComplete = vi.fn();
		const onCancel = vi.fn();

		const {lastFrame} = render(
			<NewWorktree onComplete={onComplete} onCancel={onCancel} />,
		);

		const output = lastFrame();
		expect(output).toContain('Loading branches...');
		expect(output).toContain('Create New Worktree');
	});

	it('should display error message when branch loading fails', async () => {
		mockFetchBranches.mockRejectedValue(
			new Error('git branch --all\nfatal: not a git repository'),
		);
		mockFetchDefaultBranch.mockResolvedValue('main');

		const onComplete = vi.fn();
		const onCancel = vi.fn();

		const {lastFrame} = render(
			<NewWorktree onComplete={onComplete} onCancel={onCancel} />,
		);

		await new Promise(resolve => setTimeout(resolve, 100));

		const output = lastFrame();
		expect(output).toContain('Error loading branches:');
		expect(output).toContain('git branch --all');
		expect(output).toContain('fatal: not a git repository');
	});

	it('should load branches and default branch in parallel', async () => {
		const mockBranches = ['main', 'feature-1', 'feature-2'];
		const mockDefault = 'main';
		mockFetchBranches.mockResolvedValue(mockBranches);
		mockFetchDefaultBranch.mockResolvedValue(mockDefault);

		const onComplete = vi.fn();
		const onCancel = vi.fn();

		render(<NewWorktree onComplete={onComplete} onCancel={onCancel} />);
		await new Promise(resolve => setTimeout(resolve, 100));

		expect(mockFetchBranches).toHaveBeenCalled();
		expect(mockFetchDefaultBranch).toHaveBeenCalled();
	});

	it('should handle default branch loading failure and display error', async () => {
		mockFetchBranches.mockResolvedValue(['main', 'develop']);
		mockFetchDefaultBranch.mockRejectedValue(
			new Error(
				'git symbolic-ref refs/remotes/origin/HEAD\nfatal: ref refs/remotes/origin/HEAD is not a symbolic ref',
			),
		);

		const onComplete = vi.fn();
		const onCancel = vi.fn();

		const {lastFrame} = render(
			<NewWorktree onComplete={onComplete} onCancel={onCancel} />,
		);

		await new Promise(resolve => setTimeout(resolve, 100));

		const output = lastFrame();
		expect(output).toContain('Error loading branches:');
		expect(output).toContain('git symbolic-ref');
		expect(output).toContain(
			'fatal: ref refs/remotes/origin/HEAD is not a symbolic ref',
		);
	});

	it('should handle empty branch list', async () => {
		const {configurationManager} = await import(
			'../services/configurationManager.js'
		);
		vi.spyOn(configurationManager, 'getWorktreeConfig').mockReturnValue({
			autoDirectory: true,
			autoDirectoryPattern: '../{project}-{branch}',
			copySessionData: true,
		});

		mockFetchBranches.mockResolvedValue([]);
		mockFetchDefaultBranch.mockResolvedValue('main');

		const onComplete = vi.fn();
		const onCancel = vi.fn();

		const {lastFrame} = render(
			<NewWorktree onComplete={onComplete} onCancel={onCancel} />,
		);

		await new Promise(resolve => setTimeout(resolve, 100));

		const output = lastFrame();
		expect(output).toContain('Create New Worktree');
		expect(output).toContain('Select base branch');
	});

	it('should display branches after successful loading', async () => {
		const {configurationManager} = await import(
			'../services/configurationManager.js'
		);
		vi.spyOn(configurationManager, 'getWorktreeConfig').mockReturnValue({
			autoDirectory: true,
			autoDirectoryPattern: '../{project}-{branch}',
			copySessionData: true,
		});

		mockFetchBranches.mockResolvedValue(['main', 'feature-1', 'develop']);
		mockFetchDefaultBranch.mockResolvedValue('main');

		const onComplete = vi.fn();
		const onCancel = vi.fn();

		const {lastFrame} = render(
			<NewWorktree onComplete={onComplete} onCancel={onCancel} />,
		);

		await new Promise(resolve => setTimeout(resolve, 100));

		const output = lastFrame();
		expect(output).toContain('Create New Worktree');
		expect(output).toContain('Select base branch');
		expect(output).toContain('main (default)');
		expect(output).toContain('feature-1');
	});

	it('should execute branch loading requests before showing errors', async () => {
		let branchesRequested = false;
		mockFetchBranches.mockImplementation(async () => {
			branchesRequested = true;
			throw new Error('branch load failed');
		});
		mockFetchDefaultBranch.mockResolvedValue('main');

		const onComplete = vi.fn();
		const onCancel = vi.fn();

		render(<NewWorktree onComplete={onComplete} onCancel={onCancel} />);
		await new Promise(resolve => setTimeout(resolve, 100));

		expect(branchesRequested).toBe(true);
	});
});
