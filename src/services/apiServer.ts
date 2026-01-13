import Fastify, {FastifyInstance} from 'fastify';
import fastifyStatic from '@fastify/static';
import cors from '@fastify/cors';
import {Server} from 'socket.io';
import {coreService} from './coreService.js';
import {logger} from '../utils/logger.js';
import {configurationManager} from './configurationManager.js';
import {projectManager} from './projectManager.js';
import {ConfigurationData} from '../types/index.js';
import {ValidationError} from '../types/errors.js';
import {Effect} from 'effect';
import path from 'path';
import {fileURLToPath} from 'url';
import {getGitStatusLimited, getChangedFilesLimited, getFileDiff} from '../utils/gitStatus.js';
import {randomUUID} from 'crypto';
import {generateRandomPort, isDevMode} from '../constants/env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class APIServer {
	private app: FastifyInstance;
	private io: Server | undefined;
	private token: string;
	private setupPromise: Promise<void>;

	// Track socket subscriptions to prevent duplicates in dev mode
	private socketSubscriptions = new Map<string, string>(); // socketId -> sessionId

	constructor() {
		this.app = Fastify({logger: false});
		this.token = randomUUID();
		this.setupPromise = this.setup();
	}

	private async setup(): Promise<void> {
		// Register CORS
		await this.app.register(cors, {
			origin: true, // Allow all origins for now (dev mode)
		});

		// Register Static Files (Serve the React App)
		const clientDistPath = path.resolve(__dirname, '../../client/dist');

		try {
			await this.app.register(fastifyStatic, {
				root: clientDistPath,
				prefix: '/',
			});
			logger.info(`Serving static files from ${clientDistPath}`);
		} catch (_e) {
			logger.warn(
				`Failed to register static files from ${clientDistPath}. Client might not be built.`,
			);
		}

		this.setupRoutes();
		this.setupSocketHandlers();
		this.setupCoreListeners();
	}

	private setupRoutes() {
		// --- State ---
		this.app.get('/api/state', async () => {
			return {
				...coreService.getState(),
				isDevMode: isDevMode(),
			};
		});

		// --- Projects (registry-based API) ---
		this.app.get('/api/projects', async () => {
			const pm = projectManager.instance;

			// Validate projects (marks invalid paths)
			pm.validateProjects();

			// Get all projects from registry, sorted by lastAccessed
			const projects = pm.getProjects();

			logger.info(`API: Fetched ${projects.length} projects from registry`);

			return {
				projects: projects,
			};
		});

		this.app.post<{Body: {path: string; description?: string}}>(
			'/api/project/add',
			async (request, reply) => {
				const {path, description} = request.body;
				const result = projectManager.addProject(path, description);

				if (result) {
					logger.info(`API: Added project ${result.name}`);
					return {success: true, project: result};
				} else {
					logger.error(`API: Failed to add project: ${path}`);
					reply.status(400);
					return {success: false, error: 'Not a valid git repository'};
				}
			},
		);

		this.app.post<{Body: {path: string}}>(
			'/api/project/remove',
			async (request, reply) => {
				const {path} = request.body;
				const removed = projectManager.removeProject(path);

				if (removed) {
					logger.info(`API: Removed project: ${path}`);
					return {success: true};
				} else {
					logger.error(`API: Failed to remove project (not found): ${path}`);
					reply.status(404);
					return {success: false, error: 'Project not found'};
				}
			},
		);

		this.app.post<{Body: {path: string}}>(
			'/api/project/select',
			async (request, reply) => {
				const {path} = request.body;
				const pm = projectManager.instance;

				// Get project from registry
				const project = pm.getProject(path);

				if (!project) {
					return reply.code(404).send({error: 'Project not found in registry'});
				}

				// Block selection of invalid projects
				if (project.isValid === false) {
					return reply
						.code(400)
						.send({error: 'Project path is invalid or no longer exists'});
				}

				// Convert to GitProject and select (updates lastAccessed automatically)
				const gitProject = pm.toGitProject(project);
				pm.selectProject(gitProject);
				await coreService.selectProject(gitProject);

				return {success: true};
			},
		);

		// --- Worktrees ---
		// Returns worktrees for ALL registered projects
		this.app.get('/api/worktrees', async () => {
			const projects = projectManager.getProjects();
			const allWorktrees: Array<{
				path: string;
				branch?: string;
				isMainWorktree: boolean;
				hasSession: boolean;
				gitStatus?: {
					filesAdded: number;
					filesDeleted: number;
					aheadCount: number;
					behindCount: number;
					parentBranch: string | null;
				};
				gitStatusError?: string;
			}> = [];

			for (const project of projects) {
				if (!project.isValid) continue;
				try {
					const worktreeService = projectManager.instance.getWorktreeService(
						project.path,
					);
					const result = await Effect.runPromise(
						Effect.either(worktreeService.getWorktreesEffect()),
					);
					if (result._tag === 'Right') {
						// Fetch git status for each worktree in parallel
						const worktreesWithStatus = await Promise.all(
							result.right.map(async wt => {
								const gitResult = await Effect.runPromise(
									Effect.either(getGitStatusLimited(wt.path)),
								);
								return {
									...wt,
									gitStatus:
										gitResult._tag === 'Right' ? gitResult.right : undefined,
									gitStatusError:
										gitResult._tag === 'Left'
											? gitResult.left.message
											: undefined,
								};
							}),
						);
						for (const wt of worktreesWithStatus) {
							allWorktrees.push(wt);
						}
					}
				} catch (error) {
					logger.warn(
						`Failed to get worktrees for project ${project.path}:`,
						error,
					);
				}
			}

			return allWorktrees;
		});

		// --- Git Status Endpoints ---
		// Get list of changed files for a worktree
		this.app.get<{
			Querystring: {path: string};
		}>('/api/worktree/files', async (request, reply) => {
			const {path: worktreePath} = request.query;

			if (!worktreePath) {
				return reply.code(400).send({error: 'path query parameter required'});
			}

			const result = await Effect.runPromise(
				Effect.either(getChangedFilesLimited(worktreePath)),
			);

			if (result._tag === 'Left') {
				return reply.code(500).send({error: result.left.message});
			}

			return result.right;
		});

		// Get diff for a specific file in a worktree
		this.app.get<{
			Querystring: {path: string; file: string};
		}>('/api/worktree/diff', async (request, reply) => {
			const {path: worktreePath, file: filePath} = request.query;

			if (!worktreePath || !filePath) {
				return reply
					.code(400)
					.send({error: 'path and file query parameters required'});
			}

			const result = await Effect.runPromise(
				Effect.either(getFileDiff(worktreePath, filePath)),
			);

			if (result._tag === 'Left') {
				return reply.code(500).send({error: result.left.message});
			}

			return {diff: result.right};
		});

		this.app.get<{
			Querystring: {projectPath?: string};
		}>('/api/branches', async (request, reply) => {
			const {projectPath} = request.query;

			// If projectPath provided, get branches for that specific project
			if (projectPath) {
				try {
					const {execFileSync} = await import('child_process');
					const output = execFileSync(
						'git',
						['branch', '-a', '--format=%(refname:short)'],
						{
							cwd: projectPath,
							encoding: 'utf8',
						},
					);

					const branches = output
						.split('\n')
						.map((b: string) => b.trim())
						.filter((b: string) => b.length > 0 && !b.includes('HEAD'))
						.map((b: string) => b.replace(/^origin\//, ''))
						.filter(
							(b: string, i: number, arr: string[]) => arr.indexOf(b) === i,
						)
						.sort();

					return branches;
				} catch (error) {
					logger.error(`Failed to get branches for ${projectPath}:`, error);
					return [];
				}
			}

			// Fallback to current worktree service (for backwards compatibility)
			const effect = coreService.worktreeService.getAllBranchesEffect();
			const result = await Effect.runPromise(Effect.either(effect));

			if (result._tag === 'Left') {
				return reply.code(500).send({error: result.left.message});
			}
			return result.right;
		});

		this.app.post<{
			Body: {
				path: string;
				branch: string;
				baseBranch: string;
				copySessionData: boolean;
				copyClaudeDirectory: boolean;
				projectPath?: string;
			};
		}>('/api/worktree/create', async (request, reply) => {
			const {
				path,
				branch,
				baseBranch,
				copySessionData,
				copyClaudeDirectory,
				projectPath,
			} = request.body;
			logger.info(
				`API: Creating worktree ${path} from ${baseBranch} in project ${projectPath || 'default'}`,
			);

			// Get worktree service for the specified project, or fall back to default
			const worktreeService = projectPath
				? projectManager.instance.getWorktreeService(projectPath)
				: coreService.worktreeService;

			const effect = worktreeService.createWorktreeEffect(
				path,
				branch,
				baseBranch,
				copySessionData,
				copyClaudeDirectory,
			);
			const result = await Effect.runPromise(Effect.either(effect));

			if (result._tag === 'Left') {
				return reply.code(500).send({error: result.left.message});
			}

			// Refresh worktrees
			await coreService.refreshWorktrees();
			return {success: true, worktree: result.right};
		});

		this.app.post<{Body: {path: string; deleteBranch: boolean; projectPath?: string}}>(
			'/api/worktree/delete',
			async (request, reply) => {
				const {path, deleteBranch, projectPath} = request.body;
				logger.info(
					`API: Deleting worktree ${path} (deleteBranch: ${deleteBranch}) in project ${projectPath || 'default'}`,
				);

				// Get worktree service for the specified project, or fall back to default
				const worktreeService = projectPath
					? projectManager.instance.getWorktreeService(projectPath)
					: coreService.worktreeService;

				const effect = worktreeService.deleteWorktreeEffect(path, {
					deleteBranch,
				});
				const result = await Effect.runPromise(Effect.either(effect));

				if (result._tag === 'Left') {
					return reply.code(500).send({error: result.left.message});
				}

				await coreService.refreshWorktrees();
				return {success: true};
			},
		);

		this.app.post<{
			Body: {sourceBranch: string; targetBranch: string; useRebase: boolean};
		}>('/api/worktree/merge', async (request, reply) => {
			const {sourceBranch, targetBranch, useRebase} = request.body;
			logger.info(
				`API: Merging ${sourceBranch} into ${targetBranch} (rebase: ${useRebase})`,
			);

			const effect = coreService.worktreeService.mergeWorktreeEffect(
				sourceBranch,
				targetBranch,
				useRebase,
			);
			const result = await Effect.runPromise(Effect.either(effect));

			if (result._tag === 'Left') {
				return reply.code(500).send({error: result.left.message});
			}

			await coreService.refreshWorktrees();
			return {success: true};
		});

		// --- Sessions ---
		this.app.get('/api/sessions', async () => {
			const sessions = coreService.sessionManager.getAllSessions();
			return sessions.map(s => ({
				id: s.id,
				name: s.name,
				path: s.worktreePath,
				state: s.stateMutex.getSnapshot().state,
				isActive: s.isActive,
				agentId: s.agentId,
			}));
		});

		this.app.post<{Body: {path: string; presetId?: string; sessionName?: string}}>(
			'/api/session/create',
			async (request, reply) => {
				const {path, presetId, sessionName} = request.body;
				logger.info(
					`API: Creating session "${sessionName || 'unnamed'}" for ${path} with preset: ${presetId || 'default'}`,
				);

				const effect = coreService.sessionManager.createSessionWithPresetEffect(
					path,
					presetId,
					sessionName,
				);
				const result = await Effect.runPromise(Effect.either(effect));

				if (result._tag === 'Left') {
					return reply.code(500).send({error: result.left.message});
				}

				// Session created successfully
				const session = result.right;
				// Ensure it's marked active
				coreService.sessionManager.setSessionActive(session.id, true);

				return {success: true, id: session.id, name: session.name, agentId: session.agentId};
			},
		);

		this.app.post<{Body: {id: string}}>(
			'/api/session/stop',
			async (request, reply) => {
				const {id} = request.body;
				logger.info(`API: Stopping session ${id}`);

				const session = coreService.sessionManager.getSession(id);

				if (!session) {
					return reply.code(404).send({error: 'Session not found'});
				}

				coreService.sessionManager.destroySession(id);
				return {success: true};
			},
		);

		// --- Configuration ---
		this.app.get('/api/presets', async () => {
			return configurationManager.getAllPresets();
		});

		this.app.get('/api/config', async () => {
			return configurationManager.getConfiguration();
		});

		this.app.post<{Body: Partial<ConfigurationData>}>(
			'/api/config',
			async (request, reply) => {
				const partialConfig = request.body;

				// Merge with existing config to preserve fields not sent by frontend
				// (e.g., agents, commandPresets, shortcuts are managed separately)
				const existingConfig = configurationManager.getConfiguration();
				const mergedConfig: ConfigurationData = {
					...existingConfig,
					...partialConfig,
					// Preserve these sections that are managed via separate endpoints
					agents: existingConfig.agents,
					commandPresets: existingConfig.commandPresets,
					shortcuts: existingConfig.shortcuts,
					command: existingConfig.command,
					port: existingConfig.port,
				};

				// Validate
				const validation = configurationManager.validateConfig(mergedConfig);
				if (validation._tag === 'Left') {
					const error = validation.left as ValidationError;
					return reply
						.code(400)
						.send({error: `${error.field}: ${error.constraint}`});
				}

				// Save
				const effect = configurationManager.saveConfigEffect(mergedConfig);
				const result = await Effect.runPromise(Effect.either(effect));

				if (result._tag === 'Left') {
					return reply.code(500).send({error: result.left.message});
				}

				return {success: true};
			},
		);

		// --- Agents ---
		this.app.get('/api/agents', async () => {
			return configurationManager.getAgentsConfig();
		});

		this.app.get<{Params: {id: string}}>('/api/agents/:id', async (request, reply) => {
			const agent = configurationManager.getAgentById(request.params.id);
			if (!agent) {
				return reply.code(404).send({error: 'Agent not found'});
			}
			return agent;
		});

		this.app.put<{Params: {id: string}; Body: import('../types/index.js').AgentConfig}>(
			'/api/agents/:id',
			async (request, reply) => {
				const {id} = request.params;
				const agent = request.body;

				// Ensure ID matches
				if (agent.id !== id) {
					return reply.code(400).send({error: 'Agent ID mismatch'});
				}

				configurationManager.saveAgent(agent);
				logger.info(`API: Saved agent ${id}`);
				return {success: true, agent};
			},
		);

		this.app.post<{Body: import('../types/index.js').AgentConfig}>(
			'/api/agents',
			async (request, reply) => {
				const agent = request.body;

				// Check if agent with this ID already exists
				if (configurationManager.getAgentById(agent.id)) {
					return reply.code(409).send({error: 'Agent with this ID already exists'});
				}

				configurationManager.saveAgent(agent);
				logger.info(`API: Created agent ${agent.id}`);
				return {success: true, agent};
			},
		);

		this.app.delete<{Params: {id: string}}>('/api/agents/:id', async (request, reply) => {
			const {id} = request.params;
			const deleted = configurationManager.deleteAgent(id);

			if (!deleted) {
				return reply.code(400).send({error: 'Cannot delete agent (last agent or default)'});
			}

			logger.info(`API: Deleted agent ${id}`);
			return {success: true};
		});

		this.app.post<{Body: {id: string}}>('/api/agents/default', async (request, reply) => {
			const {id} = request.body;
			const success = configurationManager.setDefaultAgent(id);

			if (!success) {
				return reply.code(404).send({error: 'Agent not found'});
			}

			logger.info(`API: Set default agent to ${id}`);
			return {success: true};
		});

		// Create session with agent (new endpoint)
		this.app.post<{
			Body: {
				path: string;
				agentId: string;
				options?: Record<string, boolean | string>;
				sessionName?: string;
			};
		}>('/api/session/create-with-agent', async (request, reply) => {
			const {path, agentId, options = {}, sessionName} = request.body;
			logger.info(
				`API: Creating session "${sessionName || 'unnamed'}" for ${path} with agent: ${agentId}`,
			);

			const agent = configurationManager.getAgentById(agentId);
			if (!agent) {
				return reply.code(404).send({error: 'Agent not found'});
			}

			// Validate options
			const validationErrors = configurationManager.validateAgentOptions(agent, options);
			if (validationErrors.length > 0) {
				return reply.code(400).send({error: validationErrors.join('; ')});
			}

			// Build args
			const args = configurationManager.buildAgentArgs(agent, options);

			// Resolve command ($SHELL for terminal)
			let command = agent.command;
			if (command === '$SHELL') {
				command = process.env['SHELL'] || '/bin/sh';
			}

			// Create session with resolved command and args
			const effect = coreService.sessionManager.createSessionWithAgentEffect(
				path,
				command,
				args,
				agent.detectionStrategy,
				sessionName,
				agentId,
			);
			const result = await Effect.runPromise(Effect.either(effect));

			if (result._tag === 'Left') {
				return reply.code(500).send({error: result.left.message});
			}

			// Session created successfully
			const session = result.right;
			coreService.sessionManager.setSessionActive(session.id, true);

			return {success: true, id: session.id, name: session.name, agentId: session.agentId};
		});
	}

	private setupSocketHandlers() {
		this.app.ready().then(() => {
			this.io = new Server(this.app.server, {
				cors: {
					origin: '*',
					methods: ['GET', 'POST'],
				},
			});

			this.io.on('connection', socket => {
				logger.info(`Web client connected: ${socket.id}`);

				socket.on('subscribe_session', (sessionId: string) => {
					const socketId = socket.id;

					// Check if switching sessions - leave previous room explicitly
					const previousSessionId = this.socketSubscriptions.get(socketId);
					if (previousSessionId && previousSessionId !== sessionId) {
						socket.leave(`session:${previousSessionId}`);
						if (isDevMode()) {
							logger.info(
								`Client ${socketId} switched from ${previousSessionId} to ${sessionId}`,
							);
						}
					}

					// Force leave ALL other session rooms (belt and suspenders)
					for (const room of socket.rooms) {
						if (
							room.startsWith('session:') &&
							room !== `session:${sessionId}`
						) {
							socket.leave(room);
						}
					}

					// Track subscription
					this.socketSubscriptions.set(socketId, sessionId);
					socket.join(`session:${sessionId}`);

					logger.info(`Client ${socketId} subscribed to session ${sessionId}`);

					// Find session and send current history
					const sessions = coreService.sessionManager.getAllSessions();
					const session = sessions.find(s => s.id === sessionId);
					if (session) {
						const fullHistory = Buffer.concat(session.outputHistory).toString(
							'utf8',
						);
						// Send as object to match new protocol
						socket.emit('terminal_data', {
							sessionId: session.id,
							data: fullHistory,
						});
					}
				});

				socket.on('unsubscribe_session', (sessionId: string) => {
					const socketId = socket.id;
					logger.info(`Client ${socketId} unsubscribed from session ${sessionId}`);

					// Clear from tracking if this was the tracked session
					if (this.socketSubscriptions.get(socketId) === sessionId) {
						this.socketSubscriptions.delete(socketId);
					}

					socket.leave(`session:${sessionId}`);
				});

				socket.on(
					'input',
					({sessionId, data}: {sessionId: string; data: string}) => {
						const sessions = coreService.sessionManager.getAllSessions();
						const session = sessions.find(s => s.id === sessionId);
						if (session) {
							session.process.write(data);
						}
					},
				);

				socket.on(
					'resize',
					({
						sessionId,
						cols,
						rows,
					}: {
						sessionId: string;
						cols: number;
						rows: number;
					}) => {
						const sessions = coreService.sessionManager.getAllSessions();
						const session = sessions.find(s => s.id === sessionId);
						if (session) {
							session.process.resize(cols, rows);
						}
					},
				);

				// Cleanup on disconnect
				socket.on('disconnect', () => {
					const socketId = socket.id;
					this.socketSubscriptions.delete(socketId);
					logger.info(`Client ${socketId} disconnected`);
				});
			});
		});
	}

	private setupCoreListeners() {
		coreService.on('sessionData', (session, data) => {
			this.io?.to(`session:${session.id}`).emit('terminal_data', {
				sessionId: session.id,
				data,
			});
		});

		const notifyUpdate = (session: {
			id: string;
			stateMutex: {getSnapshot: () => {state: string}};
		}) => {
			this.io?.emit('session_update', {
				id: session.id,
				state: session.stateMutex.getSnapshot().state,
			});
		};

		coreService.on('sessionStateChanged', notifyUpdate);
		coreService.on('sessionCreated', notifyUpdate);
		coreService.on('sessionDestroyed', notifyUpdate);
	}

	public getToken(): string {
		return '';
	}

	/**
	 * Start the API server.
	 * @param port - Port to listen on
	 * @param host - Host to bind to
	 * @param devMode - If true, retry with random ports on EADDRINUSE
	 * @returns Object containing the address and actual port used
	 */
	public async start(
		port: number = 3000,
		host: string = '0.0.0.0',
		devMode: boolean = false,
	): Promise<{address: string; port: number}> {
		// Wait for setup to complete before starting
		await this.setupPromise;

		const maxRetries = devMode ? 10 : 1;
		let currentPort = port;

		for (let attempt = 0; attempt < maxRetries; attempt++) {
			try {
				const address = await this.app.listen({port: currentPort, host});
				logger.info(`API Server running at ${address}`);
				logger.info(
					`Open in browser: http://${host === '0.0.0.0' ? 'localhost' : host}:${currentPort}`,
				);
				return {address, port: currentPort};
			} catch (err: unknown) {
				const isAddressInUse =
					err instanceof Error &&
					'code' in err &&
					(err as NodeJS.ErrnoException).code === 'EADDRINUSE';

				if (isAddressInUse && devMode && attempt < maxRetries - 1) {
					// In dev mode, try a new random port
					const newPort = generateRandomPort();
					logger.info(
						`Port ${currentPort} in use, retrying with port ${newPort} (attempt ${attempt + 2}/${maxRetries})`,
					);
					currentPort = newPort;
					continue;
				}

				logger.error('Failed to start API server', err);
				throw err;
			}
		}

		// Should not reach here, but satisfy TypeScript
		throw new Error('Failed to start API server after all retries');
	}
}

export const apiServer = new APIServer();
