import {SessionManager} from './sessionManager.js';
import {Session} from '../types/index.js';

class GlobalSessionOrchestrator {
	private static instance: GlobalSessionOrchestrator;
	private projectManagers: Map<string, SessionManager> = new Map();
	private globalManager: SessionManager;

	private constructor() {
		// Create a global session manager for single-project mode
		this.globalManager = new SessionManager();
	}

	static getInstance(): GlobalSessionOrchestrator {
		if (!GlobalSessionOrchestrator.instance) {
			GlobalSessionOrchestrator.instance = new GlobalSessionOrchestrator();
		}
		return GlobalSessionOrchestrator.instance;
	}

	getManagerForProject(projectPath?: string): SessionManager {
		// If no project path, return the global manager (single-project mode)
		if (!projectPath) {
			return this.globalManager;
		}

		// Get or create a session manager for this project
		let manager = this.projectManagers.get(projectPath);
		if (!manager) {
			manager = new SessionManager();
			this.projectManagers.set(projectPath, manager);
		}
		return manager;
	}

	findSession(
		sessionId: string,
	): {session: Session; manager: SessionManager} | undefined {
		const globalHit = this.globalManager.getSession(sessionId);
		if (globalHit) return {session: globalHit, manager: this.globalManager};

		for (const manager of this.projectManagers.values()) {
			const hit = manager.getSession(sessionId);
			if (hit) return {session: hit, manager};
		}
		return undefined;
	}

	getAllActiveSessions(): Session[] {
		const seen = new Set<string>();
		const sessions: Session[] = [];

		for (const s of this.globalManager.getAllSessions()) {
			if (!seen.has(s.id)) {
				seen.add(s.id);
				sessions.push(s);
			}
		}

		for (const manager of this.projectManagers.values()) {
			for (const s of manager.getAllSessions()) {
				if (!seen.has(s.id)) {
					seen.add(s.id);
					sessions.push(s);
				}
			}
		}

		return sessions;
	}

	destroyAllSessions(): void {
		// Destroy sessions in global manager
		this.globalManager.destroy();

		// Destroy sessions in all project managers
		for (const manager of this.projectManagers.values()) {
			manager.destroy();
		}

		// Clear the project managers map
		this.projectManagers.clear();
	}

	destroyProjectSessions(projectPath: string): void {
		const manager = this.projectManagers.get(projectPath);
		if (manager) {
			manager.destroy();
			this.projectManagers.delete(projectPath);
		}
	}

	getProjectSessions(projectPath: string): Session[] {
		const manager = this.projectManagers.get(projectPath);
		if (manager) {
			return manager.getAllSessions();
		}
		return [];
	}
}

export const globalSessionOrchestrator =
	GlobalSessionOrchestrator.getInstance();
