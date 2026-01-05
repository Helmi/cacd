import {Effect, Either} from 'effect';
import {EventEmitter} from 'events';
import {SessionManager} from './sessionManager.js';
import {WorktreeService} from './worktreeService.js';
import {globalSessionOrchestrator} from './globalSessionOrchestrator.js';
import {projectManager} from './projectManager.js';
// import {configurationManager} from './configurationManager.js'; // TODO: integrate config
import {GitProject, Worktree, Session} from '../types/index.js';
import {AppError} from '../types/errors.js';

// Define the global application state
export interface AppState {
	selectedProject: GitProject | null;
	activeSession: Session | null;
	worktrees: Worktree[];
	// We might add more UI-agnostic state here
}

export class CoreService extends EventEmitter {
	private static instance: CoreService;

	// Services
	public sessionManager: SessionManager;
	public worktreeService: WorktreeService;

	// State
	private state: AppState = {
		selectedProject: null,
		activeSession: null,
		worktrees: [],
	};

	private constructor() {
		super();
		// Initialize with default services
		this.sessionManager = globalSessionOrchestrator.getManagerForProject();
		this.worktreeService = new WorktreeService();

		// Setup initial listeners
		this.setupServiceListeners();
	}

	public static getInstance(): CoreService {
		if (!CoreService.instance) {
			CoreService.instance = new CoreService();
		}
		return CoreService.instance;
	}

	private setupServiceListeners() {
		// Forward session events
		this.sessionManager.on('sessionCreated', session =>
			this.emit('sessionCreated', session),
		);
		this.sessionManager.on('sessionExit', session =>
			this.handleSessionExit(session),
		);
		this.sessionManager.on('sessionStateChanged', session =>
			this.emit('sessionStateChanged', session),
		);
		this.sessionManager.on('sessionData', (session, data) =>
			this.emit('sessionData', session, data),
		);
		this.sessionManager.on('sessionDestroyed', session =>
			this.emit('sessionDestroyed', session),
		);
	}

	private handleSessionExit(session: Session) {
		if (this.state.activeSession?.id === session.id) {
			this.state.activeSession = null;
			this.emit('activeSessionChanged', null);
		}
		this.emit('sessionExit', session);
	}

	// --- State Accessors ---

	public getState(): AppState {
		return {...this.state};
	}

	public getActiveSession(): Session | null {
		return this.state.activeSession;
	}

	public getSelectedProject(): GitProject | null {
		return this.state.selectedProject;
	}

	// --- Actions ---

	public async selectProject(project: GitProject): Promise<void> {
		this.state.selectedProject = project;

		// Update services for the new project
		this.worktreeService = new WorktreeService(project.path);
		this.sessionManager = globalSessionOrchestrator.getManagerForProject(
			project.path,
		);

		// Re-bind listeners to the new session manager
		this.sessionManager.removeAllListeners(); // Be careful not to remove internal listeners if any
		this.setupServiceListeners();

		// Update lastAccessed in project registry
		projectManager.instance.selectProject(project);

		this.emit('projectSelected', project);
		this.emit('servicesUpdated', {
			sessionManager: this.sessionManager,
			worktreeService: this.worktreeService,
		});
	}

	public resetProject(): void {
		this.state.selectedProject = null;
		this.worktreeService = new WorktreeService();
		this.sessionManager = globalSessionOrchestrator.getManagerForProject();

		// Re-bind listeners
		this.sessionManager.removeAllListeners();
		this.setupServiceListeners();

		this.emit('projectSelected', null);
		this.emit('servicesUpdated', {
			sessionManager: this.sessionManager,
			worktreeService: this.worktreeService,
		});
	}

	public setActiveSession(session: Session | null): void {
		this.state.activeSession = session;
		if (session) {
			this.sessionManager.setSessionActive(session.worktreePath, true);
		}
		this.emit('activeSessionChanged', session);
	}

	public async refreshWorktrees(): Promise<
		Either.Either<Worktree[], AppError>
	> {
		const result = await Effect.runPromise(
			Effect.either(this.worktreeService.getWorktreesEffect()),
		);
		if (result._tag === 'Right') {
			this.state.worktrees = result.right;
			this.emit('worktreesUpdated', result.right);
		}
		return result;
	}
}

export const coreService = CoreService.getInstance();
