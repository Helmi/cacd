import path from 'path';
import {Either} from 'effect';
import {getClaudeProjectsDir, pathToClaudeProjectName} from '../utils/claudeDir.js';
import {BaseAgentAdapter} from './base.js';
import {
	buildPreview,
	extractString,
	normalizeRole,
	normalizeTimestamp,
	safeReadJsonLines,
	sortedFilesByMtime,
	withinRecentWindow,
} from './helpers.js';
import type {ConversationMessage, SessionFileMetadata, ToolCallData} from './types.js';

interface ParsedClaudeLine {
	type?: string;
	role?: string;
	timestamp?: unknown;
	created_at?: unknown;
	message?: unknown;
	content?: unknown;
	model?: string;
	tool_calls?: unknown;
	tools?: unknown;
	thinking?: unknown;
	tokens?: unknown;
	usage?: unknown;
}

function parseToolCalls(raw: unknown): ToolCallData[] {
	if (!raw) return [];
	if (!Array.isArray(raw)) {
		return [];
	}

	return raw
		.map(item => {
			if (!item || typeof item !== 'object') return null;
			const record = item as Record<string, unknown>;
			const name =
				typeof record['name'] === 'string'
					? record['name']
					: typeof record['tool'] === 'string'
						? record['tool']
						: 'tool';
			const input =
				record['input'] === undefined
					? undefined
					: extractString(record['input']);
			const output =
				record['output'] === undefined
					? undefined
					: extractString(record['output']);
			const isError =
				record['is_error'] === true || record['status'] === 'error';
			return {name, input, output, isError};
		})
		.filter(Boolean) as ToolCallData[];
}

export class ClaudeAdapter extends BaseAgentAdapter {
	constructor() {
		super({
			id: 'claude',
			name: 'Claude Code',
			icon: 'claude',
			command: 'claude',
			detectionStrategy: 'claude',
			sessionFormat: 'jsonl',
		});
	}

	override async findSessionFile(
		worktreePath: string,
		afterTimestamp?: Date,
	): Promise<string | null> {
		const projectsDirEither = getClaudeProjectsDir();
		if (Either.isLeft(projectsDirEither)) {
			return null;
		}

		const projectDir = path.join(
			projectsDirEither.right,
			pathToClaudeProjectName(worktreePath),
		);
		const candidates = sortedFilesByMtime(projectDir, fileName =>
			fileName.endsWith('.jsonl'),
		).filter(filePath => withinRecentWindow(filePath, afterTimestamp));

		return candidates[0] || null;
	}

	override async parseMessages(
		sessionFilePath: string,
	): Promise<ConversationMessage[]> {
		const rows = safeReadJsonLines(sessionFilePath) as ParsedClaudeLine[];
		const messages: ConversationMessage[] = [];

		rows.forEach((row, index) => {
			const role = normalizeRole(row.role || row.type);
			const content = extractString(row.message || row.content);
			const timestamp = normalizeTimestamp(row.timestamp || row.created_at);
			const toolCalls = parseToolCalls(row.tool_calls || row.tools);

			if (!content && toolCalls.length === 0) {
				return;
			}

			messages.push({
				id: `claude-${index}`,
				role,
				timestamp,
				content,
				preview: buildPreview(content || '[tool activity]'),
				model: row.model,
				toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
				thinkingBlocks: row.thinking
					? [
							{
								content: extractString(row.thinking),
							},
						]
					: undefined,
				rawType: row.type,
			});
		});

		return messages;
	}

	override async extractMetadata(
		sessionFilePath: string,
	): Promise<SessionFileMetadata> {
		const rows = safeReadJsonLines(sessionFilePath) as ParsedClaudeLine[];
		const messages = await this.parseMessages(sessionFilePath);
		const firstTimestamp = messages.find(message => message.timestamp)?.timestamp;
		const lastTimestamp =
			[...messages].reverse().find(message => message.timestamp)?.timestamp;

		let totalTokens: number | undefined;
		for (const row of rows) {
			if (!row || typeof row !== 'object') continue;
			const usage = row.usage;
			if (usage && typeof usage === 'object') {
				const record = usage as Record<string, unknown>;
				const tokens = record['total_tokens'];
				if (typeof tokens === 'number' && Number.isFinite(tokens)) {
					totalTokens = tokens;
				}
			}
		}

		return {
			agentSessionId: path.basename(sessionFilePath, path.extname(sessionFilePath)),
			startedAt: firstTimestamp ?? undefined,
			endedAt: lastTimestamp ?? undefined,
			messageCount: messages.length,
			totalTokens,
			model: messages.find(message => message.model)?.model,
		};
	}

	override async findSubAgentSessions(sessionFilePath: string): Promise<string[]> {
		const rows = safeReadJsonLines(sessionFilePath) as Array<Record<string, unknown>>;
		const discovered = new Set<string>();

		for (const row of rows) {
			const keys = ['subagent_session_id', 'subagentSessionId', 'child_session_id'];
			for (const key of keys) {
				const candidate = row[key];
				if (typeof candidate === 'string' && candidate.trim().length > 0) {
					discovered.add(candidate.trim());
				}
			}
		}

		return Array.from(discovered);
	}
}
