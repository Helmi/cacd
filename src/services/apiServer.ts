import Fastify, {FastifyInstance} from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyCookie from '@fastify/cookie';
import cors from '@fastify/cors';
import {Server} from 'socket.io';
import {coreService} from './coreService.js';
import {logger} from '../utils/logger.js';
import {configurationManager} from './configurationManager.js';
import {projectManager} from './projectManager.js';
import {authService} from './authService.js';
import {ConfigurationData} from '../types/index.js';
import {ValidationError} from '../types/errors.js';
import {Effect} from 'effect';
import path from 'path';
import {fileURLToPath, URL} from 'url';
import {
	getGitStatusLimited,
	getChangedFilesLimited,
	getFileDiff,
} from '../utils/gitStatus.js';
import {randomUUID, randomBytes} from 'crypto';
import {writeFile, mkdir, readdir, unlink, stat} from 'fs/promises';
import {tmpdir} from 'os';
import {generateRandomPort, isDevMode} from '../constants/env.js';
import {
	validateWorktreePath,
	validatePathWithinBase,
} from '../utils/pathValidation.js';
import {getDefaultShell} from '../utils/platform.js';

// --- Clipboard Image Paste Constants ---
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_MIME_TYPES = [
	'image/png',
	'image/jpeg',
	'image/webp',
	'image/gif',
];
const TEMP_IMAGE_DIR = path.join(tmpdir(), 'cacd-images');

// Create temp directory on module load (async, fire-and-forget)
mkdir(TEMP_IMAGE_DIR, {recursive: true, mode: 0o700}).catch(() => {});

// Cleanup old temp images (older than 1 hour)
async function cleanupTempImages() {
	try {
		const files = await readdir(TEMP_IMAGE_DIR);
		const oneHourAgo = Date.now() - 60 * 60 * 1000;

		for (const file of files) {
			const filePath = path.join(TEMP_IMAGE_DIR, file);
			try {
				const stats = await stat(filePath);
				if (stats.mtimeMs < oneHourAgo) {
					await unlink(filePath).catch(() => {});
					logger.info(`Cleaned up old temp image: ${file}`);
				}
			} catch {
				// File might have been deleted already
			}
		}
	} catch {
		// Directory might not exist yet
	}
}

// Run cleanup on startup and every hour
cleanupTempImages();
setInterval(cleanupTempImages, 60 * 60 * 1000);

// Check if hostname is allowed (localhost, private network IP, or local hostname)
function isAllowedHost(hostname: string): boolean {
	// Localhost variants
	if (['localhost', '127.0.0.1', '::1'].includes(hostname)) {
		return true;
	}

	// Local network hostnames (mDNS/Bonjour .local domains)
	if (hostname.endsWith('.local')) {
		return true;
	}

	// Single-word hostnames (no dots) are local network names (e.g., "helmibook")
	if (!hostname.includes('.')) {
		return true;
	}

	// Check for private network IPs (RFC 1918)
	// 10.0.0.0/8
	if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
		return true;
	}
	// 172.16.0.0/12 (172.16.x.x - 172.31.x.x)
	if (/^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
		return true;
	}
	// 192.168.0.0/16
	if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
		return true;
	}

	return false;
}

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
		// Register cookie plugin for session management
		await this.app.register(fastifyCookie, {
			secret: randomUUID(), // Used for signing cookies
		});

		// Register CORS - allow localhost and private network origins
		await this.app.register(cors, {
			origin: (origin, cb) => {
				// Allow requests with no origin (like curl, mobile apps)
				if (!origin) {
					cb(null, true);
					return;
				}
				// Allow localhost and private network origins
				try {
					const url = new URL(origin);
					const allowed = isAllowedHost(url.hostname);
					if (isDevMode()) {
						logger.info(
							`CORS check: origin=${origin} hostname=${url.hostname} allowed=${allowed}`,
						);
					}
					if (allowed) {
						cb(null, true);
					} else {
						logger.warn(`CORS rejected origin: ${origin}`);
						cb(new Error('Not allowed by CORS'), false);
					}
				} catch (e) {
					logger.warn(`CORS invalid origin: ${origin}`);
					cb(new Error('Invalid origin'), false);
				}
			},
			credentials: true, // Allow cookies
		});

		// Host header validation middleware (DNS rebinding protection)
		this.app.addHook('preHandler', async (request, reply) => {
			const host = request.headers.host?.split(':')[0];
			if (host && !isAllowedHost(host)) {
				logger.warn(`Blocked request with invalid Host header: ${host}`);
				return reply.status(403).send({error: 'Invalid host'});
			}
		});

		// Register Static Files (Serve the React App)
		const clientDistPath = path.resolve(__dirname, '../../client/dist');

		try {
			await this.app.register(fastifyStatic, {
				root: clientDistPath,
				prefix: '/',
			});
			logger.info(`Serving static files from ${clientDistPath}`);

			// SPA fallback: serve index.html for non-API routes (React handles routing)
			this.app.setNotFoundHandler(async (request, reply) => {
				// Don't intercept API routes - let them 404 normally
				if (request.url.startsWith('/api/')) {
					return reply.status(404).send({error: 'Not Found', statusCode: 404});
				}
				// Serve index.html for all other routes (SPA client-side routing)
				return reply.sendFile('index.html');
			});
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
		// --- Authentication Routes (public) ---

		// Check auth status - returns whether user has valid session
		this.app.get('/api/auth/status', async request => {
			const sessionId = request.cookies['cacd_session'];
			if (!sessionId) {
				return {authenticated: false};
			}

			const session = authService.validateSession(sessionId);
			return {
				authenticated: !!session,
				expiresAt: session?.expiresAt,
			};
		});

		// Verify passcode and create session
		this.app.post<{Body: {passcode: string}}>(
			'/api/auth/passcode',
			async (request, reply) => {
				const ip = request.ip || 'unknown';

				// Check rate limiting
				const rateLimit = authService.checkRateLimit(ip);
				if (!rateLimit.allowed) {
					reply.status(429);
					return {
						success: false,
						error: 'Too many attempts',
						retryAfter: rateLimit.retryAfter,
					};
				}

				const {passcode} = request.body;
				if (!passcode) {
					reply.status(400);
					return {success: false, error: 'Passcode required'};
				}

				// Get stored passcode hash from config
				const config = configurationManager.getConfiguration();
				const passcodeHash = config.passcodeHash;

				if (!passcodeHash) {
					// No passcode set - this shouldn't happen if onboarding completed
					reply.status(500);
					return {success: false, error: 'Authentication not configured'};
				}

				// Verify passcode
				const valid = await authService.verifyPasscode(passcode, passcodeHash);
				authService.recordAttempt(ip, valid);

				if (!valid) {
					const updatedRateLimit = authService.checkRateLimit(ip);
					reply.status(401);
					return {
						success: false,
						error: 'Invalid passcode',
						attemptsRemaining: updatedRateLimit.attemptsRemaining,
					};
				}

				// Create session and set cookie
				const session = authService.createSession();
				reply.setCookie('cacd_session', session.id, {
					path: '/',
					httpOnly: true,
					sameSite: 'strict',
					maxAge: 7 * 24 * 60 * 60, // 7 days
				});

				logger.info('User authenticated successfully');
				return {success: true};
			},
		);

		// Logout - invalidate session
		this.app.post('/api/auth/logout', async (request, reply) => {
			const sessionId = request.cookies['cacd_session'];
			if (sessionId) {
				authService.invalidateSession(sessionId);
			}

			reply.clearCookie('cacd_session', {path: '/'});
			return {success: true};
		});

		// Validate access token (for token-based URL access)
		this.app.get('/api/auth/validate-token', async request => {
			const config = configurationManager.getConfiguration();
			const storedToken = config.accessToken;

			// If no token is configured, auth is not set up
			if (!storedToken) {
				return {valid: false, reason: 'not_configured'};
			}

			// Get token from query parameter
			const providedToken = (request.query as {token?: string}).token;
			if (!providedToken || providedToken !== storedToken) {
				return {valid: false, reason: 'invalid_token'};
			}

			return {valid: true, authRequired: !!config.passcodeHash};
		});

		// --- Session Middleware for Protected Routes ---
		// All /api/* routes (except auth) require valid session
		this.app.addHook('preHandler', async (request, reply) => {
			// Skip auth routes
			if (request.url.startsWith('/api/auth/')) {
				return;
			}

			// Skip non-API routes
			if (!request.url.startsWith('/api/')) {
				return;
			}

			// Check for valid session
			const sessionId = request.cookies['cacd_session'];
			if (!sessionId) {
				return reply.status(401).send({error: 'Authentication required'});
			}

			const session = authService.validateSession(sessionId);
			if (!session) {
				reply.clearCookie('cacd_session', {path: '/'});
				return reply.status(401).send({error: 'Session expired'});
			}

			// Session is valid, continue
		});

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
					coreService.emitProjectAdded(result.path);
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
					coreService.emitProjectRemoved(path);
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

			// Validate worktree path is a real git directory
			let validatedPath: string;
			try {
				validatedPath = validateWorktreePath(worktreePath);
			} catch (_error) {
				logger.warn(`Invalid worktree path requested: ${worktreePath}`);
				return reply.code(400).send({error: 'Invalid worktree path'});
			}

			const result = await Effect.runPromise(
				Effect.either(getChangedFilesLimited(validatedPath)),
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

			// Validate worktree path is a real git directory
			let validatedWorktreePath: string;
			try {
				validatedWorktreePath = validateWorktreePath(worktreePath);
			} catch (_error) {
				logger.warn(`Invalid worktree path requested: ${worktreePath}`);
				return reply.code(400).send({error: 'Invalid worktree path'});
			}

			// Validate file path doesn't escape worktree (prevents ../../../etc/passwd)
			try {
				validatePathWithinBase(validatedWorktreePath, filePath);
			} catch (_error) {
				logger.warn(
					`Path traversal attempt blocked: ${filePath} in ${worktreePath}`,
				);
				return reply.code(400).send({error: 'Invalid file path'});
			}

			const result = await Effect.runPromise(
				Effect.either(getFileDiff(validatedWorktreePath, filePath)),
			);

			if (result._tag === 'Left') {
				return reply.code(500).send({error: result.left.message});
			}

			return {diff: result.right};
		});

		// Get directory listing for file browser
		this.app.get<{
			Querystring: {path: string; dir?: string};
		}>('/api/worktree/tree', async (request, reply) => {
			const {path: worktreePath, dir: subDir} = request.query;

			if (!worktreePath) {
				return reply.code(400).send({error: 'path query parameter required'});
			}

			// Validate worktree path is a real git directory
			let validatedWorktreePath: string;
			try {
				validatedWorktreePath = validateWorktreePath(worktreePath);
			} catch (_error) {
				logger.warn(`Invalid worktree path requested: ${worktreePath}`);
				return reply.code(400).send({error: 'Invalid worktree path'});
			}

			// Validate subdir if provided
			let targetDir = validatedWorktreePath;
			if (subDir) {
				try {
					targetDir = validatePathWithinBase(validatedWorktreePath, subDir);
				} catch (_error) {
					logger.warn(
						`Path traversal attempt blocked: ${subDir} in ${worktreePath}`,
					);
					return reply.code(400).send({error: 'Invalid directory path'});
				}
			}

			try {
				const fs = await import('fs/promises');
				const entries = await fs.readdir(targetDir, {withFileTypes: true});

				interface DirectoryEntry {
					name: string;
					path: string;
					type: 'file' | 'directory';
					size?: number;
				}

				const result: DirectoryEntry[] = [];

				for (const entry of entries) {
					// Skip .git directory
					if (entry.name === '.git') continue;

					const relativePath = subDir ? `${subDir}/${entry.name}` : entry.name;

					if (entry.isDirectory()) {
						result.push({
							name: entry.name,
							path: relativePath,
							type: 'directory',
						});
					} else if (entry.isFile()) {
						// Get file size
						const fullPath = path.join(targetDir, entry.name);
						try {
							const stat = await fs.stat(fullPath);
							result.push({
								name: entry.name,
								path: relativePath,
								type: 'file',
								size: stat.size,
							});
						} catch {
							// Skip files we can't stat
							continue;
						}
					}
				}

				// Sort: directories first, then alphabetically
				result.sort((a, b) => {
					if (a.type !== b.type) {
						return a.type === 'directory' ? -1 : 1;
					}
					return a.name.localeCompare(b.name);
				});

				return {entries: result};
			} catch (error) {
				logger.error(`Failed to read directory: ${targetDir}`, error);
				return reply.code(500).send({error: 'Failed to read directory'});
			}
		});

		// Get file content for file viewer
		this.app.get<{
			Querystring: {path: string; file: string};
		}>('/api/worktree/file', async (request, reply) => {
			const {path: worktreePath, file: filePath} = request.query;

			if (!worktreePath || !filePath) {
				return reply
					.code(400)
					.send({error: 'path and file query parameters required'});
			}

			// Validate worktree path
			let validatedWorktreePath: string;
			try {
				validatedWorktreePath = validateWorktreePath(worktreePath);
			} catch (_error) {
				logger.warn(`Invalid worktree path requested: ${worktreePath}`);
				return reply.code(400).send({error: 'Invalid worktree path'});
			}

			// Validate file path doesn't escape worktree
			let fullPath: string;
			try {
				fullPath = validatePathWithinBase(validatedWorktreePath, filePath);
			} catch (_error) {
				logger.warn(
					`Path traversal attempt blocked: ${filePath} in ${worktreePath}`,
				);
				return reply.code(400).send({error: 'Invalid file path'});
			}

			try {
				const fs = await import('fs/promises');
				const stat = await fs.stat(fullPath);

				// Max 1MB file size
				const MAX_SIZE = 1024 * 1024;
				if (stat.size > MAX_SIZE) {
					return {
						content: '',
						size: stat.size,
						isBinary: false,
						tooLarge: true,
					};
				}

				// Read file content
				const buffer = await fs.readFile(fullPath);

				// Simple binary detection: check for null bytes in first 8KB
				const sampleSize = Math.min(8192, buffer.length);
				let isBinary = false;
				for (let i = 0; i < sampleSize; i++) {
					if (buffer[i] === 0) {
						isBinary = true;
						break;
					}
				}

				if (isBinary) {
					return {
						content: '',
						size: stat.size,
						isBinary: true,
					};
				}

				return {
					content: buffer.toString('utf8'),
					size: stat.size,
					isBinary: false,
				};
			} catch (error) {
				logger.error(`Failed to read file: ${fullPath}`, error);
				return reply.code(500).send({error: 'Failed to read file'});
			}
		});

		this.app.get<{
			Querystring: {projectPath?: string};
		}>('/api/branches', async (request, reply) => {
			const {projectPath} = request.query;

			// If projectPath provided, get branches for that specific project
			if (projectPath) {
				// Validate project path is a real git directory
				let validatedPath: string;
				try {
					validatedPath = validateWorktreePath(projectPath);
				} catch (_error) {
					logger.warn(`Invalid project path requested: ${projectPath}`);
					return reply.code(400).send({error: 'Invalid project path'});
				}

				try {
					const {execFileSync} = await import('child_process');
					const output = execFileSync(
						'git',
						['branch', '-a', '--format=%(refname:short)'],
						{
							cwd: validatedPath,
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

		this.app.post<{
			Body: {path: string; deleteBranch: boolean; projectPath?: string};
		}>('/api/worktree/delete', async (request, reply) => {
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
		});

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

		// Legacy /api/session/create endpoint removed - use /api/session/create-with-agent instead

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
		// Legacy /api/presets endpoint removed - use /api/agents instead

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

		this.app.get<{Params: {id: string}}>(
			'/api/agents/:id',
			async (request, reply) => {
				const agent = configurationManager.getAgentById(request.params.id);
				if (!agent) {
					return reply.code(404).send({error: 'Agent not found'});
				}
				return agent;
			},
		);

		this.app.put<{
			Params: {id: string};
			Body: import('../types/index.js').AgentConfig;
		}>('/api/agents/:id', async (request, reply) => {
			const {id} = request.params;
			const agent = request.body;

			// Ensure ID matches
			if (agent.id !== id) {
				return reply.code(400).send({error: 'Agent ID mismatch'});
			}

			configurationManager.saveAgent(agent);
			logger.info(`API: Saved agent ${id}`);
			return {success: true, agent};
		});

		this.app.post<{Body: import('../types/index.js').AgentConfig}>(
			'/api/agents',
			async (request, reply) => {
				const agent = request.body;

				// Check if agent with this ID already exists
				if (configurationManager.getAgentById(agent.id)) {
					return reply
						.code(409)
						.send({error: 'Agent with this ID already exists'});
				}

				configurationManager.saveAgent(agent);
				logger.info(`API: Created agent ${agent.id}`);
				return {success: true, agent};
			},
		);

		this.app.delete<{Params: {id: string}}>(
			'/api/agents/:id',
			async (request, reply) => {
				const {id} = request.params;
				const deleted = configurationManager.deleteAgent(id);

				if (!deleted) {
					return reply
						.code(400)
						.send({error: 'Cannot delete agent (last agent or default)'});
				}

				logger.info(`API: Deleted agent ${id}`);
				return {success: true};
			},
		);

		this.app.post<{Body: {id: string}}>(
			'/api/agents/default',
			async (request, reply) => {
				const {id} = request.body;
				const success = configurationManager.setDefaultAgent(id);

				if (!success) {
					return reply.code(404).send({error: 'Agent not found'});
				}

				logger.info(`API: Set default agent to ${id}`);
				return {success: true};
			},
		);

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
				logger.error(`API: Agent not found: ${agentId}`);
				return reply.code(404).send({error: 'Agent not found'});
			}

			logger.info(
				`API: Found agent "${agent.name}" (id=${agent.id}, command=${agent.command})`,
			);

			// Validate options
			const validationErrors = configurationManager.validateAgentOptions(
				agent,
				options,
			);
			if (validationErrors.length > 0) {
				return reply.code(400).send({error: validationErrors.join('; ')});
			}

			// Build args
			const args = configurationManager.buildAgentArgs(agent, options);
			logger.info(`API: Built args for ${agent.id}: [${args.join(', ')}]`);

			// Resolve command ($SHELL for terminal)
			let command = agent.command;
			if (command === '$SHELL') {
				command = getDefaultShell();
			}
			logger.info(`API: Spawning command: ${command} ${args.join(' ')}`);

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

			return {
				success: true,
				id: session.id,
				name: session.name,
				agentId: session.agentId,
			};
		});
	}

	private setupSocketHandlers() {
		this.app.ready().then(() => {
			this.io = new Server(this.app.server, {
				cors: {
					origin: (origin, cb) => {
						// Allow requests with no origin
						if (!origin) {
							cb(null, true);
							return;
						}
						// Allow localhost and private network origins
						try {
							const url = new URL(origin);
							if (isAllowedHost(url.hostname)) {
								cb(null, true);
							} else {
								cb(new Error('Not allowed by CORS'));
							}
						} catch {
							cb(new Error('Invalid origin'));
						}
					},
					methods: ['GET', 'POST'],
					credentials: true, // Allow cookies
				},
			});

			// Socket.IO authentication middleware
			this.io.use((socket, next) => {
				// Parse cookies from handshake
				const cookieHeader = socket.handshake.headers.cookie;
				if (!cookieHeader) {
					return next(new Error('Authentication required'));
				}

				// Simple cookie parsing
				const cookies: Record<string, string> = {};
				cookieHeader.split(';').forEach(cookie => {
					const [name, value] = cookie.trim().split('=');
					if (name && value) {
						cookies[name] = value;
					}
				});

				const sessionId = cookies['cacd_session'];
				if (!sessionId) {
					return next(new Error('Authentication required'));
				}

				const session = authService.validateSession(sessionId);
				if (!session) {
					return next(new Error('Session expired'));
				}

				// Store session info on socket for later use
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				(socket as any).authSession = session;
				next();
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
					logger.info(
						`Client ${socketId} unsubscribed from session ${sessionId}`,
					);

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

				// Handle clipboard image paste
				socket.on(
					'paste_image',
					async ({
						sessionId,
						imageData,
						mimeType,
					}: {
						sessionId: string;
						imageData: string; // base64 data URL
						mimeType: string;
					}) => {
						try {
							// Validate MIME type
							if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
								socket.emit('image_path', {
									sessionId,
									error: 'Invalid image type',
								});
								return;
							}

							// Parse and validate data URL format
							const match = imageData.match(/^data:(image\/\w+);base64,(.+)$/);
							if (!match || !match[2]) {
								socket.emit('image_path', {
									sessionId,
									error: 'Invalid image data',
								});
								return;
							}

							const base64Data = match[2];

							// Check size before decoding (base64 is ~33% larger than binary)
							const estimatedSize = (base64Data.length * 3) / 4;
							if (estimatedSize > MAX_IMAGE_SIZE) {
								socket.emit('image_path', {
									sessionId,
									error: 'Image too large (max 10MB)',
								});
								return;
							}

							const buffer = Buffer.from(base64Data, 'base64');

							// Determine extension from mime type
							const ext = mimeType.split('/')[1] || 'png';

							// Generate secure random filename
							const randomName = randomBytes(16).toString('hex');
							const filename = `${randomName}.${ext}`;
							const filePath = path.join(TEMP_IMAGE_DIR, filename);

							// Write file with restrictive permissions
							await writeFile(filePath, buffer, {mode: 0o600});

							// Send path back to client
							socket.emit('image_path', {sessionId, filePath});

							logger.info(`Saved clipboard image to ${filePath}`);
						} catch (error) {
							logger.error('Failed to save clipboard image:', error);
							socket.emit('image_path', {
								sessionId,
								error: 'Failed to save image',
							});
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

	/**
	 * Get the access token for WebUI URL
	 */
	public getAccessToken(): string {
		const config = configurationManager.getConfiguration();
		return config.accessToken || '';
	}

	/**
	 * Check if authentication is configured
	 */
	public isAuthConfigured(): boolean {
		const config = configurationManager.getConfiguration();
		return !!(config.accessToken && config.passcodeHash);
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
		host: string = '127.0.0.1', // Bind to localhost only for security
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

				// Display access URL with auth token if configured
				const accessToken = configurationManager.getAccessToken();
				const baseUrl = `http://${host === '0.0.0.0' ? 'localhost' : host}:${currentPort}`;
				if (accessToken) {
					logger.info(`WebUI: ${baseUrl}/${accessToken}`);
					if (devMode) {
						logger.info(`Dev passcode: devdev`);
					}
				} else {
					logger.info(`Open in browser: ${baseUrl}`);
				}
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
