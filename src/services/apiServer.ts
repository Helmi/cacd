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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class APIServer {
    private app: FastifyInstance;
    private io: Server | undefined;
    private token: string;

    constructor() {
        this.app = Fastify({ logger: false });
        this.token = randomUUID();
        this.setup();
    }

    private async setup() {
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

        // API Authentication Hook
        this.app.addHook('onRequest', async (request, reply) => {
            if (request.url.startsWith('/api')) {
                const headerToken = request.headers['x-access-token'] as string;
                const queryToken = (request.query as any)?.token;
                
                if (headerToken !== this.token && queryToken !== this.token) {
                    return reply.code(401).send({ error: 'Unauthorized' });
                }
            }
        });

        this.setupRoutes();
        // Socket handlers must wait for ready() so underlying server exists
        this.setupSocketHandlers();
        this.setupCoreListeners();
    }
    
    // ... existing methods ...

    private setupRoutes() {
        this.app.get('/api/state', async () => {
            return coreService.getState();
        });

        this.app.get('/api/projects', async () => {
             const pm = projectManager.instance;
             const isEnabled = pm.isMultiProjectEnabled();
             const dir = pm.getProjectsDir();
             
             logger.info(`API: Fetching projects. Multi-project: ${isEnabled}, Dir: ${dir}`);
             
             if (isEnabled && dir) {
                 const result = await Effect.runPromise(Effect.either(pm.discoverProjectsEffect(dir)));
                 if (result._tag === 'Right') {
                     logger.info(`API: Discovered ${result.right.length} projects`);
                     return result.right;
                 } else {
                     logger.error(`API: Discovery failed: ${result.left.message}`);
                 }
             }
             const recent = pm.getRecentProjects();
             logger.info(`API: Returning ${recent.length} recent projects`);
             return recent;
        });

        this.app.post<{ Body: { path: string } }>('/api/project/select', async (request, reply) => {
            const { path } = request.body;
            const pm = projectManager.instance;
            
            // Validate and load project details
            const project = await pm.refreshProject(path);
            
            if (project) {
                await coreService.selectProject(project);
                return { success: true };
            }
            
            return reply.code(404).send({ error: 'Project not found or invalid git repository' });
        });

                this.app.get('/api/worktrees', async () => {

                     const result = await coreService.refreshWorktrees();

                     if (result._tag === 'Right') {

                         return result.right;

                     }

                     throw new Error("Failed to fetch worktrees");

                });

        

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

        

                            // Effect.Either.isLeft check (manual since we can't import isLeft easily from here without types)

        

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

        

                        

        

                        this.app.get('/api/sessions', async () => {

                    const sessions = coreService.sessionManager.getAllSessions();

                    logger.info(`API: Listing ${sessions.length} sessions`);

                    return sessions.map(s => ({

                        id: s.id,

                        path: s.worktreePath,

                        state: s.state,

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

            }

        

            private setupSocketHandlers() {
        this.app.ready().then(() => {
            this.io = new Server(this.app.server, {
                cors: {
                    origin: "*",
                    methods: ["GET", "POST"]
                }
            });

            // Socket.IO Authentication Middleware
            this.io.use((socket, next) => {
                const token = socket.handshake.auth['token'] || socket.handshake.query['token'];
                if (token === this.token) {
                    next();
                } else {
                    logger.warn(`Socket Auth Failed. Expected: ${this.token}, Got: ${token}`);
                    next(new Error("Unauthorized"));
                }
            });

            this.io.on('connection', (socket) => {
                logger.info(`Web client connected: ${socket.id}`);

                socket.on('subscribe_session', (sessionId: string) => {
                    logger.info(`Client ${socket.id} subscribed to session ${sessionId}`);
                    socket.join(`session:${sessionId}`);
                    
                    // Find session and send current history
                    const sessions = coreService.sessionManager.getAllSessions();
                    const session = sessions.find(s => s.id === sessionId);
                    if (session) {
                        const fullHistory = Buffer.concat(session.outputHistory).toString('utf8');
                        socket.emit('terminal_data', fullHistory);
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
            this.io?.to(`session:${session.id}`).emit('terminal_data', data);
        });
        
        const notifyUpdate = (session: any) => {
            this.io?.emit('session_update', { id: session.id, state: session.state });
        };

        coreService.on('sessionStateChanged', notifyUpdate);
        coreService.on('sessionCreated', notifyUpdate);
        coreService.on('sessionDestroyed', notifyUpdate);
    }

    public getToken(): string {
        return this.token;
    }

    public async start(port: number = 3000, host: string = '0.0.0.0') {
        try {
            const address = await this.app.listen({ port, host });
            logger.info(`API Server running at ${address}`);
            logger.info(`Web Access Token: ${this.token}`);
            logger.info(`Open in browser: http://${host}:${port}/?token=${this.token}`);
            return address;
        } catch (err) {
            logger.error('Failed to start API server', err);
            process.exit(1);
        }
    }
}

export const apiServer = new APIServer();
