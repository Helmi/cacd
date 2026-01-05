import Fastify, { FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import cors from '@fastify/cors';
import { Server } from 'socket.io';
import { coreService } from './coreService.js';
import { logger } from '../utils/logger.js';
import { configurationManager } from './configurationManager.js';
import { projectManager } from './projectManager.js';
import { ConfigurationData } from '../types/index.js';
import { Effect } from 'effect';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import { generateRandomPort } from '../constants/env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class APIServer {
    private app: FastifyInstance;
    private io: Server | undefined;
    private token: string;
    private setupPromise: Promise<void>;

    constructor() {
        this.app = Fastify({ logger: false });
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
        } catch (e) {
            logger.warn(`Failed to register static files from ${clientDistPath}. Client might not be built.`);
        }

        this.setupRoutes();
        this.setupSocketHandlers();
        this.setupCoreListeners();
    }

    private setupRoutes() {
        // --- State ---
        this.app.get('/api/state', async () => {
            return coreService.getState();
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
                 projects: projects
             };
        });

        this.app.post<{ Body: { path: string; description?: string } }>('/api/project/add', async (request, reply) => {
            const { path, description } = request.body;
            const result = projectManager.addProject(path, description);

            if (result) {
                logger.info(`API: Added project ${result.name}`);
                return { success: true, project: result };
            } else {
                logger.error(`API: Failed to add project: ${path}`);
                reply.status(400);
                return { success: false, error: 'Not a valid git repository' };
            }
        });

        this.app.post<{ Body: { path: string } }>('/api/project/remove', async (request, reply) => {
            const { path } = request.body;
            const removed = projectManager.removeProject(path);

            if (removed) {
                logger.info(`API: Removed project: ${path}`);
                return { success: true };
            } else {
                logger.error(`API: Failed to remove project (not found): ${path}`);
                reply.status(404);
                return { success: false, error: 'Project not found' };
            }
        });

        this.app.post<{ Body: { path: string } }>('/api/project/select', async (request, reply) => {
            const { path } = request.body;
            const pm = projectManager.instance;

            // Get project from registry
            const project = pm.getProject(path);

            if (!project) {
                return reply.code(404).send({ error: 'Project not found in registry' });
            }

            // Block selection of invalid projects
            if (project.isValid === false) {
                return reply.code(400).send({ error: 'Project path is invalid or no longer exists' });
            }

            // Convert to GitProject and select (updates lastAccessed automatically)
            const gitProject = pm.toGitProject(project);
            pm.selectProject(gitProject);
            await coreService.selectProject(gitProject);

            return { success: true };
        });

        // --- Worktrees ---
        this.app.get('/api/worktrees', async () => {
             const result = await coreService.refreshWorktrees();
             if (result._tag === 'Right') {
                 return result.right;
             }
             throw new Error("Failed to fetch worktrees");
        });

        this.app.get('/api/branches', async (request, reply) => {
            const effect = coreService.worktreeService.getAllBranchesEffect();
            const result = await Effect.runPromise(Effect.either(effect));
            
            if (result._tag === 'Left') {
                return reply.code(500).send({ error: result.left.message });
            }
            return result.right;
        });

        this.app.post<{ Body: { 
            path: string; 
            branch: string; 
            baseBranch: string; 
            copySessionData: boolean; 
            copyClaudeDirectory: boolean 
        } }>('/api/worktree/create', async (request, reply) => {
            const { path, branch, baseBranch, copySessionData, copyClaudeDirectory } = request.body;
            logger.info(`API: Creating worktree ${path} from ${baseBranch}`);
            
            const effect = coreService.worktreeService.createWorktreeEffect(
                path, branch, baseBranch, copySessionData, copyClaudeDirectory
            );
            const result = await Effect.runPromise(Effect.either(effect));
            
            if (result._tag === 'Left') {
                return reply.code(500).send({ error: result.left.message });
            }
            
            // Refresh worktrees
            await coreService.refreshWorktrees();
            return { success: true, worktree: result.right };
        });

        this.app.post<{ Body: { path: string; deleteBranch: boolean } }>('/api/worktree/delete', async (request, reply) => {
            const { path, deleteBranch } = request.body;
            logger.info(`API: Deleting worktree ${path} (deleteBranch: ${deleteBranch})`);
            
            const effect = coreService.worktreeService.deleteWorktreeEffect(path, { deleteBranch });
            const result = await Effect.runPromise(Effect.either(effect));
            
            if (result._tag === 'Left') {
                return reply.code(500).send({ error: result.left.message });
            }
            
            await coreService.refreshWorktrees();
            return { success: true };
        });

        this.app.post<{ Body: { sourceBranch: string; targetBranch: string; useRebase: boolean } }>('/api/worktree/merge', async (request, reply) => {
            const { sourceBranch, targetBranch, useRebase } = request.body;
            logger.info(`API: Merging ${sourceBranch} into ${targetBranch} (rebase: ${useRebase})`);
            
            const effect = coreService.worktreeService.mergeWorktreeEffect(sourceBranch, targetBranch, useRebase);
            const result = await Effect.runPromise(Effect.either(effect));
            
            if (result._tag === 'Left') {
                return reply.code(500).send({ error: result.left.message });
            }
            
            await coreService.refreshWorktrees();
            return { success: true };
        });

        // --- Sessions ---
        this.app.get('/api/sessions', async () => {
            const sessions = coreService.sessionManager.getAllSessions();
            return sessions.map(s => ({
                id: s.id,
                path: s.worktreePath,
                state: s.stateMutex.getSnapshot().state,
                isActive: s.isActive
            }));
        });

        this.app.post<{ Body: { path: string; presetId?: string } }>('/api/session/create', async (request, reply) => {
            const { path, presetId } = request.body;
            logger.info(`API: Creating session for ${path} with preset: ${presetId || 'default'}`);
            
            const effect = coreService.sessionManager.createSessionWithPresetEffect(path, presetId);
            const result = await Effect.runPromise(Effect.either(effect));
            
            if (result._tag === 'Left') {
                return reply.code(500).send({ error: result.left.message });
            }
            
            // Session created successfully
            const session = result.right;
            // Ensure it's marked active
            coreService.sessionManager.setSessionActive(path, true);
            
            return { success: true, id: session.id };
        });

        this.app.post<{ Body: { id: string } }>('/api/session/stop', async (request, reply) => {
            const { id } = request.body;
            logger.info(`API: Stopping session ${id}`);
            
            const sessions = coreService.sessionManager.getAllSessions();
            const session = sessions.find(s => s.id === id);
            
            if (!session) {
                return reply.code(404).send({ error: 'Session not found' });
            }
            
            coreService.sessionManager.destroySession(session.worktreePath);
            return { success: true };
        });

        // --- Configuration ---
        this.app.get('/api/presets', async () => {
            return configurationManager.getAllPresets();
        });

        this.app.get('/api/config', async () => {
            return configurationManager.getConfiguration();
        });

        this.app.post<{ Body: any }>('/api/config', async (request, reply) => {
            const newConfig = request.body;
            
            // Validate
            const validation = configurationManager.validateConfig(newConfig);
            if (validation._tag === 'Left') {
                // @ts-ignore - accessing internal error structure
                return reply.code(400).send({ error: validation.left.message || "Invalid configuration" });
            }
            
            // Save
            const effect = configurationManager.saveConfigEffect(newConfig as ConfigurationData);
            const result = await Effect.runPromise(Effect.either(effect));
            
            if (result._tag === 'Left') {
                return reply.code(500).send({ error: result.left.message });
            }
            
            return { success: true };
        });
    }

    private setupSocketHandlers() {
        this.app.ready().then(() => {
            this.io = new Server(this.app.server, {
                cors: {
                    origin: "*",
                    methods: ["GET", "POST"]
                }
            });

            this.io.on('connection', (socket) => {
                logger.info(`Web client connected: ${socket.id}`);

                socket.on('subscribe_session', (sessionId: string) => {
                    // Force leave other session rooms to prevent crosstalk
                    for (const room of socket.rooms) {
                        if (room.startsWith('session:') && room !== `session:${sessionId}`) {
                            socket.leave(room);
                        }
                    }

                    logger.info(`Client ${socket.id} subscribed to session ${sessionId}`);
                    socket.join(`session:${sessionId}`);
                    
                    // Find session and send current history
                    const sessions = coreService.sessionManager.getAllSessions();
                    const session = sessions.find(s => s.id === sessionId);
                    if (session) {
                        const fullHistory = Buffer.concat(session.outputHistory).toString('utf8');
                        // Send as object to match new protocol
                        socket.emit('terminal_data', { sessionId: session.id, data: fullHistory });
                    }
                });

                socket.on('input', ({ sessionId, data }: { sessionId: string, data: string }) => {
                     const sessions = coreService.sessionManager.getAllSessions();
                     const session = sessions.find(s => s.id === sessionId);
                     if (session) {
                         session.process.write(data);
                     }
                });
                
                socket.on('resize', ({ sessionId, cols, rows }: { sessionId: string, cols: number, rows: number }) => {
                     const sessions = coreService.sessionManager.getAllSessions();
                     const session = sessions.find(s => s.id === sessionId);
                     if (session) {
                         session.process.resize(cols, rows);
                     }
                });
            });
        });
    }

    private setupCoreListeners() {
        coreService.on('sessionData', (session, data) => {
            this.io?.to(`session:${session.id}`).emit('terminal_data', { 
                sessionId: session.id, 
                data 
            });
        });
        
        const notifyUpdate = (session: any) => {
            this.io?.emit('session_update', { id: session.id, state: session.stateMutex.getSnapshot().state });
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
    public async start(port: number = 80, host: string = '0.0.0.0', devMode: boolean = false): Promise<{ address: string; port: number }> {
        // Wait for setup to complete before starting
        await this.setupPromise;

        const maxRetries = devMode ? 10 : 1;
        let currentPort = port;

        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                const address = await this.app.listen({ port: currentPort, host });
                logger.info(`API Server running at ${address}`);
                logger.info(`Open in browser: http://${host === '0.0.0.0' ? 'localhost' : host}:${currentPort}`);
                return { address, port: currentPort };
            } catch (err: unknown) {
                const isAddressInUse = err instanceof Error &&
                    ('code' in err && (err as NodeJS.ErrnoException).code === 'EADDRINUSE');

                if (isAddressInUse && devMode && attempt < maxRetries - 1) {
                    // In dev mode, silently try a new random port
                    currentPort = generateRandomPort();
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