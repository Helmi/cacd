import type {Session, SessionState} from '../types/index.js';

type SessionStateMetadataSource = Pick<Session, 'stateMutex'>;
type SessionUpdatePayloadSource = Pick<Session, 'id' | 'stateMutex'>;
type ApiSessionPayloadSource = Pick<
	Session,
	| 'id'
	| 'name'
	| 'worktreePath'
	| 'isActive'
	| 'agentId'
	| 'stateMutex'
	| 'process'
>;

export interface SessionStateMetadata {
	state: SessionState;
	autoApprovalFailed: boolean;
	autoApprovalReason: string | undefined;
}

export function resolveSessionStateMetadata(
	session: SessionStateMetadataSource,
): SessionStateMetadata {
	const snapshot = session.stateMutex.getSnapshot();
	return {
		state: snapshot.state,
		autoApprovalFailed: snapshot.autoApprovalFailed,
		autoApprovalReason: snapshot.autoApprovalReason,
	};
}

export function toSessionUpdatePayload(session: SessionUpdatePayloadSource): {
	id: string;
	state: SessionState;
	autoApprovalFailed: boolean;
	autoApprovalReason: string | undefined;
} {
	return {
		id: session.id,
		...resolveSessionStateMetadata(session),
	};
}

export function toApiSessionPayload(session: ApiSessionPayloadSource): {
	id: string;
	name: string | undefined;
	path: string;
	state: SessionState;
	autoApprovalFailed: boolean;
	autoApprovalReason: string | undefined;
	isActive: boolean;
	agentId: string | undefined;
	pid: number;
} {
	return {
		id: session.id,
		name: session.name,
		path: session.worktreePath,
		...resolveSessionStateMetadata(session),
		isActive: session.isActive,
		agentId: session.agentId,
		pid: session.process.pid,
	};
}
