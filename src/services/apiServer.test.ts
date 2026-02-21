import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from 'vitest';
import {Effect} from 'effect';

const mockExecFileSync = vi.fn();
const mockLoadPromptTemplatesByScope = vi.fn();
const mockTdReaderGetIssueWithDetails = vi.fn();
const mockCreateWorktreeEffect = vi.fn();

vi.mock('child_process', async importOriginal => {
	const actual = await importOriginal<typeof import('child_process')>();
	return {
		...actual,
		execFileSync: mockExecFileSync,
	};
});

vi.mock('../utils/projectConfig.js', () => ({
	loadProjectConfig: vi.fn(() => ({td: {enabled: true, autoStart: true}})),
	getProjectConfigPath: vi.fn(() => '/repo/.cacd/config.json'),
	saveProjectConfig: vi.fn(() => '/repo/.cacd/config.json'),
	loadPromptTemplatesByScope: mockLoadPromptTemplatesByScope,
	loadPromptTemplateByScope: vi.fn(() => null),
	savePromptTemplateByScope: vi.fn(),
	deletePromptTemplateByScope: vi.fn(() => true),
}));

vi.mock('./configurationManager.js', () => ({
	configurationManager: {
		getTdConfig: vi.fn(() => ({
			enabled: true,
			autoStart: true,
			injectTdUsage: true,
		})),
		getAccessToken: vi.fn(() => ''),
		setTdConfig: vi.fn(),
		getConfiguration: vi.fn(() => ({accessToken: '', passcodeHash: 'hash'})),
		getAgentById: vi.fn(() => ({
			id: 'codex',
			name: 'Codex',
			kind: 'agent',
			command: 'codex',
			options: [],
			enabled: true,
		})),
		validateAgentOptions: vi.fn(() => []),
		buildAgentArgs: vi.fn(() => []),
	},
}));

vi.mock('./projectManager.js', () => ({
	projectManager: {
		getProjects: vi.fn(() => [{path: '/repo', name: 'Repo'}]),
		instance: {
			addTaskListName: vi.fn(),
			getTaskListNames: vi.fn(() => []),
			removeTaskListName: vi.fn(() => true),
		},
	},
}));

vi.mock('./authService.js', () => ({
	authService: {
		validateSession: vi.fn(() => ({
			id: 'session',
			expiresAt: Date.now() + 60000,
		})),
		checkRateLimit: vi.fn(() => ({allowed: true, attemptsRemaining: 3})),
		verifyPasscode: vi.fn(async () => true),
		recordAttempt: vi.fn(),
		createSession: vi.fn(() => ({id: 'session'})),
		invalidateSession: vi.fn(),
	},
}));

vi.mock('./coreService.js', () => ({
	coreService: {
		on: vi.fn(),
		getSelectedProject: vi.fn(() => null),
		getState: vi.fn(() => ({
			worktrees: [],
			sessions: [],
			selectedWorktree: undefined,
			availableBranches: [],
			repositoryPath: null,
			mainWorktreePath: null,
		})),
		selectProject: vi.fn(async () => {}),
		emitProjectAdded: vi.fn(),
		emitProjectRemoved: vi.fn(),
		refreshWorktrees: vi.fn(async () => {}),
		worktreeService: {
			getAllBranchesEffect: vi.fn(),
			createWorktreeEffect: (...args: unknown[]) =>
				mockCreateWorktreeEffect(...args),
			deleteWorktreeEffect: vi.fn(),
			mergeWorktreeEffect: vi.fn(),
		},
		sessionManager: {
			getSession: vi.fn(),
			destroySession: vi.fn(),
			renameSession: vi.fn(),
			getAllSessions: vi.fn(() => []),
			createSessionWithAgentEffect: vi.fn(),
			setSessionActive: vi.fn(),
		},
	},
}));

vi.mock('./tdService.js', () => ({
	tdService: {
		isAvailable: vi.fn(() => true),
		checkAvailability: vi.fn(() => ({
			binaryAvailable: true,
			version: 'test',
			binaryPath: '/usr/bin/td',
		})),
		resolveProjectState: vi.fn(() => ({
			enabled: true,
			initialized: true,
			binaryAvailable: true,
			todosDir: '/repo/.todos',
			dbPath: '/repo/.todos/issues.db',
			tdRoot: '/repo',
		})),
	},
}));

vi.mock('./tdReader.js', () => ({
	TdReader: vi.fn().mockImplementation(() => ({
		getIssueWithDetails: mockTdReaderGetIssueWithDetails,
		listIssues: vi.fn(() => []),
		close: vi.fn(),
	})),
}));

describe('APIServer td create-with-agent validation ordering', () => {
	interface InjectRequest {
		method: string;
		url: string;
		headers?: Record<string, string>;
		payload?: unknown;
	}

	interface InjectResponse {
		statusCode: number;
		body: string;
	}

	interface TestApp {
		inject: (req: InjectRequest) => Promise<InjectResponse>;
		close: () => Promise<void>;
	}

	let apiServer: {setupPromise: Promise<void>; app: TestApp};

	beforeAll(async () => {
		mockLoadPromptTemplatesByScope.mockReturnValue([
			{
				name: 'Begin Work on Task',
				path: '/tmp/Begin Work on Task.md',
				content: 'Work on {{task.id}}: {{task.title}}',
				source: 'global',
			},
		]);
		const mod = await import('./apiServer.js');
		apiServer = mod.apiServer as unknown as {
			setupPromise: Promise<void>;
			app: TestApp;
		};
		await apiServer.setupPromise;
	});

	afterAll(async () => {
		await apiServer.app.close();
	});

	beforeEach(() => {
		mockExecFileSync.mockReset();
		mockTdReaderGetIssueWithDetails.mockReset();
		mockCreateWorktreeEffect.mockReset();
		mockLoadPromptTemplatesByScope.mockReturnValue([
			{
				name: 'Begin Work on Task',
				path: '/tmp/Begin Work on Task.md',
				content: 'Work on {{task.id}}: {{task.title}}',
				source: 'global',
			},
		]);
	});

	it('does not auto-start td task when prompt validation fails with 400', async () => {
		const response = await apiServer.app.inject({
			method: 'POST',
			url: '/api/session/create-with-agent',
			headers: {cookie: 'cacd_session=test'},
			payload: {
				path: '/repo/.worktrees/feat',
				agentId: 'codex',
				options: {},
				tdTaskId: 'td-abc123',
				promptTemplate: 'Missing Template',
			},
		});

		expect(response.statusCode).toBe(400);
		expect(mockExecFileSync).not.toHaveBeenCalledWith(
			'td',
			expect.arrayContaining(['start']),
			expect.anything(),
		);
	});

	it('does not auto-start td task when task validation fails with 404', async () => {
		mockTdReaderGetIssueWithDetails.mockReturnValue(null);

		const response = await apiServer.app.inject({
			method: 'POST',
			url: '/api/session/create-with-agent',
			headers: {cookie: 'cacd_session=test'},
			payload: {
				path: '/repo/.worktrees/feat',
				agentId: 'codex',
				options: {},
				tdTaskId: 'td-abc123',
				promptTemplate: 'Begin Work on Task',
			},
		});

		expect(response.statusCode).toBe(404);
		expect(mockExecFileSync).not.toHaveBeenCalledWith(
			'td',
			expect.arrayContaining(['start']),
			expect.anything(),
		);
	});

	it('preserves worktree hook warnings at top-level and nested response fields', async () => {
		mockCreateWorktreeEffect.mockReturnValue(
			Effect.succeed({
				path: '/repo/.worktrees/feat-warning',
				branch: 'feat-warning',
				isMainWorktree: false,
				hasSession: false,
				warnings: ['setup hook warning'],
			}),
		);

		const response = await apiServer.app.inject({
			method: 'POST',
			url: '/api/worktree/create',
			headers: {cookie: 'cacd_session=test'},
			payload: {
				path: '/repo/.worktrees/feat-warning',
				branch: 'feat-warning',
				baseBranch: 'main',
				copySessionData: false,
				copyClaudeDirectory: false,
			},
		});

		expect(response.statusCode).toBe(200);
		const payload = JSON.parse(response.body) as {
			success: boolean;
			warnings?: string[];
			worktree?: {warnings?: string[]};
		};
		expect(payload.success).toBe(true);
		expect(payload.warnings).toEqual(['setup hook warning']);
		expect(payload.worktree?.warnings).toEqual(['setup hook warning']);
	});
});
