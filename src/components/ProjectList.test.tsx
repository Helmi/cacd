import React from 'react';
import {render} from 'ink-testing-library';
import {describe, it, expect, vi, beforeEach} from 'vitest';
import {Project} from '../types/index.js';

// Mock node-pty to avoid native module loading issues
vi.mock('node-pty', () => ({
	spawn: vi.fn(),
}));

// Import the actual component code but skip the useInput hook
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

// Mock TextInputWrapper to render as simple text
vi.mock('./TextInputWrapper.js', async () => {
	const React = await vi.importActual<typeof import('react')>('react');
	const {Text} = await vi.importActual<typeof import('ink')>('ink');

	return {
		default: ({value, placeholder}: {value?: string; placeholder?: string}) => {
			return React.createElement(Text, {}, value || placeholder || '');
		},
	};
});

// Mock the projectManager with registry-based API
vi.mock('../services/projectManager.js', () => ({
	projectManager: {
		instance: {
			validateProjects: vi.fn(),
		},
		getProjects: vi.fn().mockReturnValue([]),
		addProject: vi.fn(),
	},
}));

// Mock globalSessionOrchestrator
vi.mock('../services/globalSessionOrchestrator.js', () => ({
	globalSessionOrchestrator: {
		getProjectSessions: vi.fn().mockReturnValue([]),
	},
}));

// Mock SessionManager
vi.mock('../services/sessionManager.js', () => ({
	SessionManager: {
		getSessionCounts: vi.fn().mockReturnValue({
			idle: 0,
			busy: 0,
			waiting_input: 0,
			pending_auto_approval: 0,
			total: 0,
		}),
		formatSessionCounts: vi.fn().mockReturnValue(''),
	},
}));

// Now import after mocking
const {default: ProjectList} = await import('./ProjectList.js');
const {projectManager} = await import('../services/projectManager.js');

describe('ProjectList', () => {
	const mockOnSelectProject = vi.fn();
	const mockOnDismissError = vi.fn();
	const mockProjects: Project[] = [
		{
			name: 'project1',
			path: '/projects/project1',
			lastAccessed: Date.now(),
			isValid: true,
		},
		{
			name: 'project2',
			path: '/projects/project2',
			lastAccessed: Date.now() - 1000,
			isValid: true,
		},
		{
			name: 'project3',
			path: '/projects/project3',
			lastAccessed: Date.now() - 2000,
			isValid: true,
		},
	];

	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(projectManager.getProjects).mockReturnValue(mockProjects);
	});

	it('should render project list with correct title', async () => {
		const {lastFrame} = render(
			<ProjectList
				onSelectProject={mockOnSelectProject}
				error={null}
				onDismissError={mockOnDismissError}
			/>,
		);

		// Wait for component to render
		await new Promise(resolve => setTimeout(resolve, 50));

		expect(lastFrame()).toContain('Agent Control Desk - Project Manager');
		expect(lastFrame()).toContain('Select a project:');
	});

	it('should display projects from registry', async () => {
		const {lastFrame} = render(
			<ProjectList
				onSelectProject={mockOnSelectProject}
				error={null}
				onDismissError={mockOnDismissError}
			/>,
		);

		// Wait for component to render
		await new Promise(resolve => setTimeout(resolve, 50));

		const frame = lastFrame();
		expect(frame).toContain('project1');
		expect(frame).toContain('project2');
		expect(frame).toContain('project3');
	});

	it('should display empty state when no projects', async () => {
		vi.mocked(projectManager.getProjects).mockReturnValue([]);

		const {lastFrame} = render(
			<ProjectList
				onSelectProject={mockOnSelectProject}
				error={null}
				onDismissError={mockOnDismissError}
			/>,
		);

		// Wait for component to render
		await new Promise(resolve => setTimeout(resolve, 50));

		const frame = lastFrame();
		expect(frame).toContain('No projects tracked yet');
		expect(frame).toContain('acd add');
	});

	it('should display invalid project indicator', async () => {
		const projectsWithInvalid: Project[] = [
			{
				name: 'valid-project',
				path: '/projects/valid',
				lastAccessed: Date.now(),
				isValid: true,
			},
			{
				name: 'invalid-project',
				path: '/projects/invalid',
				lastAccessed: Date.now(),
				isValid: false,
			},
		];
		vi.mocked(projectManager.getProjects).mockReturnValue(projectsWithInvalid);

		const {lastFrame} = render(
			<ProjectList
				onSelectProject={mockOnSelectProject}
				error={null}
				onDismissError={mockOnDismissError}
			/>,
		);

		// Wait for component to render
		await new Promise(resolve => setTimeout(resolve, 50));

		const frame = lastFrame();
		expect(frame).toContain('⚠️'); // Invalid indicator
	});

	it('should show number shortcuts for projects 0-9', async () => {
		const {lastFrame} = render(
			<ProjectList
				onSelectProject={mockOnSelectProject}
				error={null}
				onDismissError={mockOnDismissError}
			/>,
		);

		// Wait for component to render
		await new Promise(resolve => setTimeout(resolve, 50));

		const frame = lastFrame();
		expect(frame).toContain('0 ❯');
		expect(frame).toContain('1 ❯');
		expect(frame).toContain('2 ❯');
	});

	it('should show add project option', async () => {
		const {lastFrame} = render(
			<ProjectList
				onSelectProject={mockOnSelectProject}
				error={null}
				onDismissError={mockOnDismissError}
			/>,
		);

		// Wait for component to render
		await new Promise(resolve => setTimeout(resolve, 50));

		const frame = lastFrame();
		expect(frame).toContain('Add Project');
	});

	it('should display error when provided', async () => {
		const {lastFrame} = render(
			<ProjectList
				onSelectProject={mockOnSelectProject}
				error="Test error message"
				onDismissError={mockOnDismissError}
			/>,
		);

		// Wait for component to render
		await new Promise(resolve => setTimeout(resolve, 50));

		const frame = lastFrame();
		expect(frame).toContain('Error');
		expect(frame).toContain('Test error message');
	});
});
