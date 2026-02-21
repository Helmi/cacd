import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Box, Text, useStdout} from 'ink';
import {shortcutManager} from '../services/shortcutManager.js';
import {
	tuiApiClient,
	type ApiSession,
	type SessionUpdatePayload,
	type TerminalDataPayload,
} from './tuiApiClient.js';

interface SessionProps {
	session: ApiSession;
	onReturnToMenu: () => void;
}

type StatusVariant = 'error' | 'pending' | null;

const Session: React.FC<SessionProps> = ({session, onReturnToMenu}) => {
	const {stdout} = useStdout();
	const [liveSession, setLiveSession] = useState(session);
	const liveSessionRef = useRef(session);
	const [columns, setColumns] = useState(
		() => stdout?.columns ?? process.stdout.columns ?? 80,
	);

	const deriveStatus = (
		currentSession: ApiSession,
	): {message: string | null; variant: StatusVariant} => {
		if (currentSession.autoApprovalFailed) {
			const reason = currentSession.autoApprovalReason
				? ` Reason: ${currentSession.autoApprovalReason}.`
				: '';
			return {
				message: `Auto-approval failed.${reason} Manual approval required—respond to the prompt.`,
				variant: 'error',
			};
		}

		if (currentSession.state === 'pending_auto_approval') {
			return {
				message:
					'Auto-approval pending... verifying permissions (press any key to cancel)',
				variant: 'pending',
			};
		}

		return {message: null, variant: null};
	};

	const {message: statusMessage, variant: statusVariant} = useMemo(
		() => deriveStatus(liveSession),
		[liveSession],
	);

	const {statusLineText, backgroundColor, textColor} = useMemo(() => {
		if (!statusMessage || !statusVariant) {
			return {
				statusLineText: null,
				backgroundColor: undefined,
				textColor: undefined,
			};
		}

		const maxContentWidth = Math.max(columns - 4, 0);
		const prefix =
			statusVariant === 'error'
				? '[AUTO-APPROVAL REQUIRED]'
				: '[AUTO-APPROVAL]';
		const prefixed = `${prefix} ${statusMessage}`;
		const trimmed =
			prefixed.length > maxContentWidth
				? prefixed.slice(0, maxContentWidth)
				: prefixed;

		return {
			statusLineText: ` ${trimmed}`.padEnd(columns, ' '),
			backgroundColor: statusVariant === 'error' ? '#d90429' : '#ffd166',
			textColor: statusVariant === 'error' ? 'white' : '#1c1c1c',
		};
	}, [columns, statusMessage, statusVariant]);

	const sanitizeReplayBuffer = useCallback((input: string): string => {
		return input
			.replace(/\x1B\](?:10|11);[^\x07\x1B]*(?:\x07|\x1B\\)/g, '')
			.replace(/\x1B\[>4;?\d*m/g, '')
			.replace(/\x1B\[>[0-9;]*u/g, '')
			.replace(/\x1B\[\?1004[hl]/g, '')
			.replace(/\x1B\[\?2004[hl]/g, '');
	}, []);

	useEffect(() => {
		setLiveSession(session);
		liveSessionRef.current = session;
	}, [session]);

	useEffect(() => {
		liveSessionRef.current = liveSession;
	}, [liveSession]);

	useEffect(() => {
		if (!stdout) return;

		const resetTerminalInputModes = () => {
			stdout.write('\x1b[>0u');
			stdout.write('\x1b[>4m');
			stdout.write('\x1b[?1004l');
			stdout.write('\x1b[?2004l');
		};

		let isFirstChunk = true;
		const stdin = process.stdin;
		const originalIsRaw = stdin.isRaw;
		const originalIsPaused = stdin.isPaused();

		const handleSessionUpdate = (payload: SessionUpdatePayload) => {
			if (payload.id !== session.id) return;
			setLiveSession(current => ({
				...current,
				state: payload.state,
				autoApprovalFailed: payload.autoApprovalFailed,
				autoApprovalReason: payload.autoApprovalReason,
			}));
		};

		const handleTerminalData = (payload: TerminalDataPayload) => {
			if (payload.sessionId !== session.id) return;

			let output = sanitizeReplayBuffer(payload.data);
			if (isFirstChunk) {
				isFirstChunk = false;
				output = output.replace(/\x1B\[2J/g, '').replace(/\x1B\[H/g, '');
			}

			if (output.length > 0) {
				stdout.write(output);
			}
		};

		const handleResize = () => {
			const cols = process.stdout.columns || 80;
			const rows = process.stdout.rows || 24;
			setColumns(cols);
			tuiApiClient.resizeSession(session.id, cols, rows);
		};

		const handleStdinData = (data: string) => {
			if (shortcutManager.matchesRawInput('returnToMenu', data)) {
				resetTerminalInputModes();
				stdin.removeListener('data', handleStdinData);
				if (stdin.isTTY) {
					stdin.setRawMode(false);
				}
				stdin.pause();
				onReturnToMenu();
				return;
			}

			if (liveSessionRef.current.state === 'pending_auto_approval') {
				void tuiApiClient
					.cancelAutoApproval(
						session.id,
						'User input received during auto-approval',
					)
					.catch(() => {
						/* ignore transient cancellation errors */
					});
			}

			tuiApiClient.sendInput(session.id, data);
		};

		resetTerminalInputModes();
		stdout.write('\x1B[2J\x1B[H');

		tuiApiClient.on('session_update', handleSessionUpdate);
		tuiApiClient.on('terminal_data', handleTerminalData);
		tuiApiClient.subscribeSession(session.id);
		void tuiApiClient.setSessionActive(session.id, true).catch(() => {
			/* ignore transient activation errors */
		});

		const currentCols = process.stdout.columns || 80;
		const currentRows = process.stdout.rows || 24;
		tuiApiClient.resizeSession(session.id, currentCols, currentRows);

		if (stdin.isTTY) {
			stdin.setRawMode(true);
		}
		stdin.resume();
		stdin.setEncoding('utf8');
		stdin.on('data', handleStdinData);

		stdout.on('resize', handleResize);

		return () => {
			stdin.removeListener('data', handleStdinData);
			resetTerminalInputModes();

			if (stdin.isTTY) {
				stdin.setRawMode(originalIsRaw || false);
				if (originalIsPaused) {
					stdin.pause();
				} else {
					stdin.resume();
				}
			}

			stdout.off('resize', handleResize);
			tuiApiClient.off('session_update', handleSessionUpdate);
			tuiApiClient.off('terminal_data', handleTerminalData);
			tuiApiClient.unsubscribeSession(session.id);
			void tuiApiClient.setSessionActive(session.id, false).catch(() => {
				/* ignore transient deactivation errors */
			});
		};
	}, [onReturnToMenu, sanitizeReplayBuffer, session.id, stdout]);

	return statusLineText ? (
		<Box width="100%">
			<Text backgroundColor={backgroundColor} color={textColor} bold>
				{statusLineText}
			</Text>
		</Box>
	) : null;
};

export default Session;
