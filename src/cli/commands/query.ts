import {spawnSync} from 'child_process';
import dgram from 'dgram';
import dns from 'dns';
import os from 'os';
import type {DaemonWebConfig} from '../../utils/daemonControl.js';
import {ApiClientError, createApiClient} from '../apiClient.js';
import type {CliCommandContext} from '../types.js';
import {runDaemonLifecycleCommand} from './daemonLifecycle.js';

interface ApiSessionPayload {
	id: string;
	name?: string;
	path: string;
	state: string;
	autoApprovalFailed?: boolean;
	autoApprovalReason?: string;
	isActive: boolean;
	agentId?: string;
	pid?: number;
}

interface ApiConversationSession {
	id: string;
	agentProfileName: string;
	agentOptions: Record<string, unknown>;
	worktreePath: string;
	branchName: string | null;
	tdTaskId: string | null;
	createdAt: number;
	state: string;
	isActive: boolean;
}

interface ApiConversationSessionResponse {
	session: ApiConversationSession;
}

interface ApiAgentsConfigResponse {
	agents: Array<{
		id: string;
		name: string;
		kind: 'agent' | 'terminal';
		enabled?: boolean;
	}>;
	defaultAgentId: string;
	schemaVersion: number;
}

interface SessionSummary {
	id: string;
	agent: string;
	model: string;
	branch: string;
	status: string;
	elapsed: string;
	pid: number | null;
	tdTaskId: string | null;
	worktreePath: string;
}

interface DaemonStatusOutput {
	running: boolean;
	pid?: number;
	webConfig?: DaemonWebConfig;
	uptime?: string;
}

function getProcessUptime(pid: number): string | undefined {
	const result = spawnSync('ps', ['-p', `${pid}`, '-o', 'etime='], {
		encoding: 'utf-8',
	});

	if (result.status !== 0) {
		return undefined;
	}

	const uptime = result.stdout.trim();
	return uptime.length > 0 ? uptime : undefined;
}

function getExternalIP(): Promise<string | undefined> {
	return new Promise(resolve => {
		const socket = dgram.createSocket('udp4');
		socket.connect(80, '8.8.8.8', () => {
			const addr = socket.address();
			socket.close();
			resolve(typeof addr === 'string' ? undefined : addr.address);
		});
		socket.on('error', () => {
			socket.close();
			resolve(undefined);
		});
	});
}

function getLocalHostname(
	externalIP: string | undefined,
): Promise<string | undefined> {
	if (!externalIP) {
		return Promise.resolve(undefined);
	}

	return new Promise(resolve => {
		const hostname = os.hostname();
		dns.lookup(hostname, {family: 4}, (err, addr) => {
			if (!err && addr === externalIP) {
				resolve(hostname);
			} else {
				resolve(undefined);
			}
		});
	});
}

async function withNetworkLinks(
	baseConfig: DaemonWebConfig,
	token: string | undefined,
): Promise<DaemonWebConfig> {
	const externalIP = await getExternalIP();
	const hostname = await getLocalHostname(externalIP);
	const tokenPath = token ? `/${token}` : '';

	return {
		...baseConfig,
		externalUrl: externalIP
			? `http://${externalIP}:${baseConfig.port}${tokenPath}`
			: undefined,
		hostname: hostname
			? `http://${hostname}:${baseConfig.port}${tokenPath}`
			: undefined,
	};
}

function normalizeApiError(error: unknown): Error {
	if (error instanceof ApiClientError) {
		if (error.status === 401 || error.status === 403) {
			return new Error(
				'Daemon API authentication failed. Verify local config token and daemon state.',
			);
		}

		if (error.message.includes('Unable to connect to CACD daemon at')) {
			return new Error(
				'No running CA⚡CD daemon found. Start it with `cacd start`.',
			);
		}

		return new Error(error.message);
	}

	if (error instanceof Error) {
		return error;
	}

	return new Error(String(error));
}

function createDaemonApiClient(context: CliCommandContext) {
	return createApiClient({
		host: '127.0.0.1',
		port: context.port,
		accessToken: context.accessToken,
	});
}

async function fetchDaemonApi<T>(
	context: CliCommandContext,
	path: string,
): Promise<T> {
	try {
		const client = createDaemonApiClient(context);
		return await client.get<T>(path);
	} catch (error) {
		throw normalizeApiError(error);
	}
}

function formatElapsedFromCreatedAt(createdAtSeconds: number | undefined): string {
	if (!createdAtSeconds || !Number.isFinite(createdAtSeconds)) {
		return '-';
	}

	const elapsed = Math.max(0, Math.floor(Date.now() / 1000) - createdAtSeconds);
	const days = Math.floor(elapsed / 86400);
	const hours = Math.floor((elapsed % 86400) / 3600);
	const minutes = Math.floor((elapsed % 3600) / 60);
	const seconds = elapsed % 60;

	if (days > 0) {
		return `${days}d ${hours}h`;
	}
	if (hours > 0) {
		return `${hours}h ${minutes}m`;
	}
	if (minutes > 0) {
		return `${minutes}m ${seconds}s`;
	}
	return `${seconds}s`;
}

function resolveSessionModel(
	agentOptions: Record<string, unknown> | undefined,
): string {
	if (!agentOptions) {
		return '-';
	}

	const preferredKeys = ['model', 'modelName', 'selectedModel'];
	for (const key of preferredKeys) {
		const value = agentOptions[key];
		if (typeof value === 'string' && value.trim().length > 0) {
			return value.trim();
		}
	}

	const modelEntry = Object.entries(agentOptions).find(([key, value]) => {
		return key.toLowerCase().includes('model') && typeof value === 'string';
	});
	if (modelEntry && typeof modelEntry[1] === 'string') {
		const value = modelEntry[1].trim();
		return value.length > 0 ? value : '-';
	}

	return '-';
}

function buildTableLines(headers: string[], rows: string[][]): string[] {
	const widths = headers.map((header, index) => {
		const rowWidths = rows.map(row => row[index]?.length ?? 0);
		return Math.max(header.length, ...rowWidths);
	});

	const formatRow = (cells: string[]) =>
		cells.map((cell, index) => cell.padEnd(widths[index] || 0)).join('  ');

	const lines = [formatRow(headers), widths.map(width => '-'.repeat(width)).join('  ')];
	for (const row of rows) {
		lines.push(formatRow(row));
	}
	return lines;
}

async function fetchConversationSession(
	context: CliCommandContext,
	sessionId: string,
): Promise<ApiConversationSession | null> {
	try {
		const response = await fetchDaemonApi<ApiConversationSessionResponse>(
			context,
			`/api/conversations/${encodeURIComponent(sessionId)}`,
		);
		return response.session;
	} catch {
		return null;
	}
}

async function buildSessionSummary(
	context: CliCommandContext,
	session: ApiSessionPayload,
): Promise<SessionSummary> {
	const conversation = await fetchConversationSession(context, session.id);
	const model = resolveSessionModel(conversation?.agentOptions);

	return {
		id: session.id,
		agent: conversation?.agentProfileName || session.agentId || '-',
		model,
		branch: conversation?.branchName || '-',
		status: session.state,
		elapsed: formatElapsedFromCreatedAt(conversation?.createdAt),
		pid: session.pid ?? null,
		tdTaskId: conversation?.tdTaskId || null,
		worktreePath: conversation?.worktreePath || session.path,
	};
}

async function listActiveSessionSummaries(
	context: CliCommandContext,
): Promise<SessionSummary[]> {
	const sessions = await fetchDaemonApi<ApiSessionPayload[]>(context, '/api/sessions');
	const summaries = await Promise.all(
		sessions.map(session => buildSessionSummary(context, session)),
	);
	return summaries.sort((a, b) => a.id.localeCompare(b.id));
}

async function getDaemonStatusOutput(
	context: CliCommandContext,
): Promise<DaemonStatusOutput> {
	const pid = await context.daemon.lifecycle.readDaemonPidFile(
		context.daemonPidFilePath,
	);
	if (pid === undefined || !context.daemon.lifecycle.isProcessRunning(pid)) {
		if (pid !== undefined) {
			await context.daemon.lifecycle.cleanupDaemonPidFile(
				context.daemonPidFilePath,
				pid,
			);
		}
		return {running: false};
	}

	const baseConfig = context.daemon.control.buildDaemonWebConfig({
		configDir: context.configDir,
		port: context.port,
		accessToken: context.accessToken,
		isCustomConfigDir: context.customConfigDir,
		isDevMode: context.devModeActive,
	});

	return {
		running: true,
		pid,
		webConfig: await withNetworkLinks(baseConfig, context.accessToken),
		uptime: getProcessUptime(pid),
	};
}

async function runStatusWithSessions(context: CliCommandContext): Promise<number> {
	let statusOutput: DaemonStatusOutput;
	let sessions: SessionSummary[] = [];

	try {
		statusOutput = await getDaemonStatusOutput(context);
		if (statusOutput.running) {
			sessions = await listActiveSessionSummaries(context);
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		context.formatter.writeError({
			text: [`Failed to get daemon status: ${message}`],
			data: {
				ok: false,
				command: 'status',
				error: {
					message,
				},
			},
		});
		return 1;
	}

	if (!statusOutput.running) {
		context.formatter.write({
			text: [
				'Daemon is not running',
				`Config Dir: ${context.configDir}`,
				`PID File:   ${context.daemonPidFilePath}`,
				'Active sessions: 0',
			],
			data: {
				ok: true,
				command: 'status',
				running: false,
				configDir: context.configDir,
				pidFile: context.daemonPidFilePath,
				sessions: [],
			},
		});
		return 0;
	}

	const lines = [
		'Daemon is running',
		`PID:          ${statusOutput.pid}`,
		`Local URL:    ${statusOutput.webConfig?.url}`,
		`External URL: ${statusOutput.webConfig?.externalUrl || '(unavailable)'}`,
		`Config Dir:   ${context.configDir}`,
		`PID File:     ${context.daemonPidFilePath}`,
		`Log File:     ${context.daemonLogPath}`,
	];
	if (statusOutput.uptime) {
		lines.push(`Uptime:       ${statusOutput.uptime}`);
	}

	if (sessions.length === 0) {
		lines.push('', 'Active sessions: 0');
	} else {
		lines.push('', `Active sessions (${sessions.length}):`);
		lines.push(
			...buildTableLines(
				['id', 'agent', 'model', 'branch', 'status', 'elapsed'],
				sessions.map(session => [
					session.id,
					session.agent,
					session.model,
					session.branch,
					session.status,
					session.elapsed,
				]),
			),
		);
	}

	context.formatter.write({
		text: lines,
		data: {
			ok: true,
			command: 'status',
			running: true,
			pid: statusOutput.pid,
			webConfig: statusOutput.webConfig,
			uptime: statusOutput.uptime,
			configDir: context.configDir,
			pidFile: context.daemonPidFilePath,
			logFile: context.daemonLogPath,
			sessions,
		},
	});

	return 0;
}

async function runSessionsCommand(context: CliCommandContext): Promise<number> {
	const action = context.parsedArgs.input[1] ?? 'list';

	if (action === 'list') {
		let sessions: SessionSummary[];
		try {
			sessions = await listActiveSessionSummaries(context);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			context.formatter.writeError({
				text: [`Failed to query sessions: ${message}`],
				data: {
					ok: false,
					command: 'sessions list',
					error: {
						message,
					},
				},
			});
			return 1;
		}

		if (sessions.length === 0) {
			context.formatter.write({
				text: ['No active sessions'],
				data: {
					ok: true,
					command: 'sessions list',
					sessions: [],
				},
			});
			return 0;
		}

		context.formatter.write({
			text: buildTableLines(
				['id', 'agent', 'model', 'branch', 'status', 'elapsed'],
				sessions.map(session => [
					session.id,
					session.agent,
					session.model,
					session.branch,
					session.status,
					session.elapsed,
				]),
			),
			data: {
				ok: true,
				command: 'sessions list',
				sessions,
			},
		});
		return 0;
	}

	if (action === 'show') {
		const sessionId = context.parsedArgs.input[2];
		if (!sessionId) {
			context.formatter.writeError({
				text: ['Error: Missing session id', 'Usage: cacd sessions show <id>'],
				data: {
					ok: false,
					command: 'sessions show',
					error: {
						message: 'Missing session id',
						usage: 'cacd sessions show <id>',
					},
				},
			});
			return 1;
		}

		let liveSessions: ApiSessionPayload[];
		try {
			liveSessions = await fetchDaemonApi<ApiSessionPayload[]>(
				context,
				'/api/sessions',
			);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			context.formatter.writeError({
				text: [`Failed to query sessions: ${message}`],
				data: {
					ok: false,
					command: 'sessions show',
					error: {
						message,
					},
				},
			});
			return 1;
		}

		const liveSession = liveSessions.find(session => session.id === sessionId);
		const conversation = await fetchConversationSession(context, sessionId);
		if (!liveSession && !conversation) {
			context.formatter.writeError({
				text: [`Session not found: ${sessionId}`],
				data: {
					ok: false,
					command: 'sessions show',
					error: {
						message: `Session not found: ${sessionId}`,
					},
				},
			});
			return 1;
		}

		const summary: SessionSummary = {
			id: sessionId,
			agent:
				conversation?.agentProfileName || liveSession?.agentId || 'unknown',
			model: resolveSessionModel(conversation?.agentOptions),
			branch: conversation?.branchName || '-',
			status: liveSession?.state || conversation?.state || 'unknown',
			elapsed: formatElapsedFromCreatedAt(conversation?.createdAt),
			pid: liveSession?.pid ?? null,
			tdTaskId: conversation?.tdTaskId || null,
			worktreePath: conversation?.worktreePath || liveSession?.path || '-',
		};

		context.formatter.write({
			text: [
				`ID:        ${summary.id}`,
				`Agent:     ${summary.agent}`,
				`Model:     ${summary.model}`,
				`Branch:    ${summary.branch}`,
				`Status:    ${summary.status}`,
				`PID:       ${summary.pid ?? '-'}`,
				`Elapsed:   ${summary.elapsed}`,
				`TD Task:   ${summary.tdTaskId ?? '-'}`,
				`Worktree:  ${summary.worktreePath}`,
			],
			data: {
				ok: true,
				command: 'sessions show',
				session: summary,
			},
		});
		return 0;
	}

	context.formatter.writeError({
		text: [
			`Unknown sessions command: ${action}`,
			'Available sessions commands:',
			'  cacd sessions list',
			'  cacd sessions show <id>',
		],
		data: {
			ok: false,
			command: 'sessions',
			error: {
				message: `Unknown sessions command: ${action}`,
				available: ['list', 'show'],
			},
		},
	});
	return 1;
}

async function runAgentsCommand(context: CliCommandContext): Promise<number> {
	const action = context.parsedArgs.input[1] ?? 'list';
	if (action !== 'list') {
		context.formatter.writeError({
			text: [
				`Unknown agents command: ${action}`,
				'Available agents commands:',
				'  cacd agents list',
			],
			data: {
				ok: false,
				command: 'agents',
				error: {
					message: `Unknown agents command: ${action}`,
					available: ['list'],
				},
			},
		});
		return 1;
	}

	let agentsConfig: ApiAgentsConfigResponse;
	let sessions: ApiSessionPayload[];
	try {
		[agentsConfig, sessions] = await Promise.all([
			fetchDaemonApi<ApiAgentsConfigResponse>(
				context,
				'/api/agents?includeDisabled=true',
			),
			fetchDaemonApi<ApiSessionPayload[]>(context, '/api/sessions'),
		]);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		context.formatter.writeError({
			text: [`Failed to query agents: ${message}`],
			data: {
				ok: false,
				command: 'agents list',
				error: {
					message,
				},
			},
		});
		return 1;
	}

	const sessionsByAgent = new Map<string, ApiSessionPayload[]>();
	for (const session of sessions) {
		const key = session.agentId || 'unknown';
		const group = sessionsByAgent.get(key) || [];
		group.push(session);
		sessionsByAgent.set(key, group);
	}

	const payload = agentsConfig.agents.map(agent => ({
		id: agent.id,
		name: agent.name,
		kind: agent.kind,
		enabled: agent.enabled !== false,
		isDefault: agentsConfig.defaultAgentId === agent.id,
		sessions: (sessionsByAgent.get(agent.id) || []).map(session => ({
			id: session.id,
			state: session.state,
			pid: session.pid ?? null,
		})),
	}));

	if (payload.length === 0) {
		context.formatter.write({
			text: ['No agents configured'],
			data: {
				ok: true,
				command: 'agents list',
				agents: [],
			},
		});
		return 0;
	}

	context.formatter.write({
		text: buildTableLines(
			['id', 'name', 'kind', 'enabled', 'default', 'sessions'],
			payload.map(agent => [
				agent.id,
				agent.name,
				agent.kind,
				agent.enabled ? 'yes' : 'no',
				agent.isDefault ? 'yes' : 'no',
				agent.sessions.length === 0
					? '-'
					: agent.sessions
							.map(session => `${session.id}(${session.state})`)
							.join(', '),
			]),
		),
		data: {
			ok: true,
			command: 'agents list',
			agents: payload,
		},
	});
	return 0;
}

export async function runQueryCommand(context: CliCommandContext): Promise<number> {
	if (context.subcommand === 'status') {
		if (!context.parsedArgs.flags.sessions) {
			return runDaemonLifecycleCommand(context);
		}
		return runStatusWithSessions(context);
	}

	if (context.subcommand === 'sessions') {
		return runSessionsCommand(context);
	}

	if (context.subcommand === 'agents') {
		return runAgentsCommand(context);
	}

	context.formatter.writeError({
		text: [`Unsupported query command: ${context.subcommand}`],
		data: {
			ok: false,
			command: context.subcommand,
			error: {
				message: `Unsupported query command: ${context.subcommand}`,
			},
		},
	});
	return 1;
}
