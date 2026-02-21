import {describe, expect, it} from 'vitest';
import type {SessionState} from '../types/index.js';
import {
	toApiSessionPayload,
	toSessionUpdatePayload,
} from './sessionStateMetadata.js';

type SessionSnapshot = {
	state: SessionState;
	autoApprovalFailed: boolean;
	autoApprovalReason: string | undefined;
};

type SessionLike = {
	id: string;
	name?: string;
	worktreePath: string;
	isActive: boolean;
	agentId?: string;
	stateMutex: {
		getSnapshot: () => SessionSnapshot;
	};
};

function createSession(
	overrides: Partial<SessionLike> = {},
	snapshotOverrides: Partial<SessionSnapshot> = {},
): SessionLike {
	return {
		id: 'session-1',
		name: 'Session 1',
		worktreePath: '/repo/.worktrees/feat',
		isActive: true,
		agentId: 'codex',
		stateMutex: {
			getSnapshot: () => ({
				state: 'idle',
				autoApprovalFailed: false,
				autoApprovalReason: undefined,
				...snapshotOverrides,
			}),
		},
		...overrides,
	};
}

describe('sessionStateMetadata', () => {
	it('maps HTTP session payload with auto-approval metadata', () => {
		const payload = toApiSessionPayload(
			createSession(
				{isActive: false},
				{
					state: 'pending_auto_approval',
					autoApprovalFailed: true,
					autoApprovalReason: 'Approval verifier denied',
				},
			),
		);

		expect(payload).toEqual({
			id: 'session-1',
			name: 'Session 1',
			path: '/repo/.worktrees/feat',
			state: 'pending_auto_approval',
			autoApprovalFailed: true,
			autoApprovalReason: 'Approval verifier denied',
			isActive: false,
			agentId: 'codex',
		});
	});

	it('maps websocket session_update payload with auto-approval metadata', () => {
		const payload = toSessionUpdatePayload(
			createSession(
				{id: 'session-2'},
				{
					state: 'waiting_input',
					autoApprovalFailed: false,
					autoApprovalReason: undefined,
				},
			),
		);

		expect(payload).toEqual({
			id: 'session-2',
			state: 'waiting_input',
			autoApprovalFailed: false,
			autoApprovalReason: undefined,
		});
	});
});
