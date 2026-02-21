import Database from 'better-sqlite3';
import path from 'path';
import {existsSync, readFileSync} from 'fs';
import {BaseAgentAdapter} from './base.js';
import {
	buildPreview,
	extractString,
	homePath,
	normalizeRole,
	normalizeTimestamp,
	recursiveFindFiles,
	safeReadJsonFile,
	safeReadJsonLines,
	withinRecentWindow,
} from './helpers.js';
import type {ConversationMessage, SessionFileMetadata} from './types.js';

function safeReadSqliteMessages(
	sessionFilePath: string,
): ConversationMessage[] {
	let db: Database.Database | null = null;
	try {
		db = new Database(sessionFilePath, {readonly: true, fileMustExist: true});
		const tables = db
			.prepare(
				"SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
			)
			.all() as Array<{name: string}>;
		const table =
			tables.find(entry => /message|chat|conversation/i.test(entry.name))
				?.name || tables[0]?.name;
		if (!table) {
			return [];
		}

		const columns = db
			.prepare(`PRAGMA table_info("${table.replace(/"/g, '""')}")`)
			.all() as Array<{name: string}>;
		const columnNames = columns.map(column => column.name);
		const pickColumn = (candidates: string[]) =>
			candidates.find(candidate => columnNames.includes(candidate));

		const roleColumn = pickColumn(['role', 'sender', 'author', 'type']);
		const contentColumn = pickColumn([
			'content',
			'message',
			'text',
			'body',
			'payload',
		]);
		const timestampColumn = pickColumn([
			'timestamp',
			'created_at',
			'createdAt',
			'time',
		]);
		const modelColumn = pickColumn(['model', 'model_name', 'modelName']);

		if (!contentColumn) {
			return [];
		}

		const rows = db
			.prepare(
				`SELECT * FROM "${table.replace(/"/g, '""')}" ORDER BY rowid ASC LIMIT 5000`,
			)
			.all() as Record<string, unknown>[];

		return rows
			.map((row, index) => {
				const content = extractString(row[contentColumn]);
				if (!content) return null;
				const role = normalizeRole(roleColumn ? row[roleColumn] : 'assistant');
				const timestamp = normalizeTimestamp(
					timestampColumn ? row[timestampColumn] : undefined,
				);
				return {
					id: `cursor-sqlite-${index}`,
					role,
					timestamp,
					content,
					preview: buildPreview(content),
					model:
						modelColumn && typeof row[modelColumn] === 'string'
							? (row[modelColumn] as string)
							: undefined,
				};
			})
			.filter(Boolean) as ConversationMessage[];
	} catch {
		return [];
	} finally {
		try {
			db?.close();
		} catch {
			// ignore
		}
	}
}

function parseGenericMessages(sessionFilePath: string): ConversationMessage[] {
	const ext = path.extname(sessionFilePath).toLowerCase();

	if (ext === '.json') {
		const parsed = safeReadJsonFile(sessionFilePath);
		if (!parsed || typeof parsed !== 'object') {
			return [];
		}
		const record = parsed as Record<string, unknown>;
		const items =
			(Array.isArray(record['messages']) && record['messages']) ||
			(Array.isArray(record['events']) && record['events']) ||
			(Array.isArray(record['entries']) && record['entries']) ||
			[];
		return items
			.map((item, index) => {
				if (!item || typeof item !== 'object') return null;
				const row = item as Record<string, unknown>;
				const content = extractString(
					row['content'] || row['message'] || row['text'],
				);
				if (!content) return null;
				return {
					id: `cursor-json-${index}`,
					role: normalizeRole(row['role'] || row['type']),
					timestamp: normalizeTimestamp(row['timestamp'] || row['created_at']),
					content,
					preview: buildPreview(content),
				};
			})
			.filter(Boolean) as ConversationMessage[];
	}

	const rows = safeReadJsonLines(sessionFilePath) as Record<string, unknown>[];
	return rows
		.map((row, index) => {
			const content = extractString(
				row['content'] || row['message'] || row['text'],
			);
			if (!content) return null;
			return {
				id: `cursor-jsonl-${index}`,
				role: normalizeRole(row['role'] || row['type']),
				timestamp: normalizeTimestamp(row['timestamp'] || row['created_at']),
				content,
				preview: buildPreview(content),
			};
		})
		.filter(Boolean) as ConversationMessage[];
}

function parseCursorMessages(sessionFilePath: string): ConversationMessage[] {
	const ext = path.extname(sessionFilePath).toLowerCase();
	if (ext === '.db' || ext === '.sqlite' || ext === '.sqlite3') {
		const fromSqlite = safeReadSqliteMessages(sessionFilePath);
		if (fromSqlite.length > 0) {
			return fromSqlite;
		}
	}

	return parseGenericMessages(sessionFilePath);
}

function fileContainsPath(
	candidatePath: string,
	worktreePath: string,
): boolean {
	const ext = path.extname(candidatePath).toLowerCase();
	if (ext === '.db' || ext === '.sqlite' || ext === '.sqlite3') {
		return false;
	}
	try {
		const content = readFileSync(candidatePath, 'utf8');
		return content.includes(path.resolve(worktreePath));
	} catch {
		return false;
	}
}

export class CursorAdapter extends BaseAgentAdapter {
	constructor() {
		super({
			id: 'cursor',
			name: 'Cursor Agent',
			icon: 'cursor',
			command: 'cursor agent',
			detectionStrategy: 'cursor',
			sessionFormat: 'sqlite',
		});
	}

	override async findSessionFile(
		worktreePath: string,
		afterTimestamp?: Date,
	): Promise<string | null> {
		const roots = [
			homePath('.cursor'),
			homePath('Library', 'Application Support', 'Cursor'),
			path.join(worktreePath, '.cursor'),
		].filter(root => existsSync(root));

		const candidates = roots
			.flatMap(root =>
				recursiveFindFiles(
					root,
					fileName =>
						/(conversation|session|chat|history)/i.test(fileName) &&
						/(\.db|\.sqlite|\.sqlite3|\.jsonl|\.json)$/i.test(fileName),
					120,
				),
			)
			.filter(candidate =>
				withinRecentWindow(candidate, afterTimestamp, 300000),
			);

		if (candidates.length === 0) {
			return null;
		}

		const withWorktreeHint = candidates.find(candidate =>
			fileContainsPath(candidate, worktreePath),
		);
		return withWorktreeHint || candidates[0] || null;
	}

	override async parseMessages(
		sessionFilePath: string,
	): Promise<ConversationMessage[]> {
		return parseCursorMessages(sessionFilePath);
	}

	override async extractMetadata(
		sessionFilePath: string,
	): Promise<SessionFileMetadata> {
		const messages = parseCursorMessages(sessionFilePath);
		const firstTimestamp = messages.find(
			message => message.timestamp,
		)?.timestamp;
		const lastTimestamp = [...messages]
			.reverse()
			.find(message => message.timestamp)?.timestamp;
		return {
			agentSessionId: path.basename(
				sessionFilePath,
				path.extname(sessionFilePath),
			),
			startedAt: firstTimestamp ?? undefined,
			endedAt: lastTimestamp ?? undefined,
			messageCount: messages.length,
			model: messages.find(message => message.model)?.model,
		};
	}
}
