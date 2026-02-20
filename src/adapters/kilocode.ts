import path from 'path';
import {BaseAgentAdapter} from './base.js';
import {
	buildPreview,
	extractString,
	homePath,
	normalizeRole,
	normalizeTimestamp,
	recursiveFindFiles,
	safeReadJsonFile,
	withinRecentWindow,
} from './helpers.js';
import type {ConversationMessage, SessionFileMetadata} from './types.js';

export class KilocodeAdapter extends BaseAgentAdapter {
	constructor() {
		super({
			id: 'kilocode',
			name: 'Kilocode',
			icon: 'kilo',
			command: 'kilocode',
			sessionFormat: 'json',
		});
	}

	override async findSessionFile(
		_worktreePath: string,
		afterTimestamp?: Date,
	): Promise<string | null> {
		const root = homePath('.kilocode', 'cli', 'global', 'tasks');
		const candidates = recursiveFindFiles(
			root,
			fileName => fileName.endsWith('.json'),
			100,
		).filter(candidate => withinRecentWindow(candidate, afterTimestamp, 300000));
		return candidates[0] || null;
	}

	override async parseMessages(
		sessionFilePath: string,
	): Promise<ConversationMessage[]> {
		const parsed = safeReadJsonFile(sessionFilePath);
		if (!parsed || typeof parsed !== 'object') {
			return [];
		}

		const record = parsed as Record<string, unknown>;
		const items =
			(Array.isArray(record['messages']) && record['messages']) ||
			(Array.isArray(record['events']) && record['events']) ||
			[];

		return items
			.map((item, index) => {
				if (!item || typeof item !== 'object') return null;
				const row = item as Record<string, unknown>;
				const content = extractString(row['content'] || row['message'] || row['text']);
				if (!content) return null;
				const role = normalizeRole(row['role'] || row['type']);
				const timestamp = normalizeTimestamp(row['timestamp'] || row['created_at']);
				return {
					id: `kilocode-${index}`,
					role,
					timestamp,
					content,
					preview: buildPreview(content),
					rawType: typeof row['type'] === 'string' ? row['type'] : undefined,
				};
			})
			.filter(Boolean) as ConversationMessage[];
	}

	override async extractMetadata(
		sessionFilePath: string,
	): Promise<SessionFileMetadata> {
		const messages = await this.parseMessages(sessionFilePath);
		const firstTimestamp = messages.find(message => message.timestamp)?.timestamp;
		const lastTimestamp =
			[...messages].reverse().find(message => message.timestamp)?.timestamp;
		return {
			agentSessionId: path.basename(sessionFilePath, path.extname(sessionFilePath)),
			startedAt: firstTimestamp ?? undefined,
			endedAt: lastTimestamp ?? undefined,
			messageCount: messages.length,
		};
	}
}
