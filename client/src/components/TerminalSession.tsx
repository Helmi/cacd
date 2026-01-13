import {useEffect, useLayoutEffect, useRef, useState} from 'react';
import {Terminal as XTerm} from 'xterm';
import {FitAddon} from 'xterm-addon-fit';
import {WebLinksAddon} from 'xterm-addon-web-links';
import 'xterm/css/xterm.css';
import {useAppStore} from '@/lib/store';
import {StatusIndicator} from '@/components/StatusIndicator';
import {AgentIcon} from '@/components/AgentIcon';
import {Button} from '@/components/ui/button';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
	X,
	Maximize2,
	Minimize2,
	MoreVertical,
	Copy,
	Trash2,
	Info,
	GitBranch,
} from 'lucide-react';
import {cn} from '@/lib/utils';
import type {Session} from '@/lib/types';
import {mapSessionState} from '@/lib/types';

interface TerminalSessionProps {
	session: Session;
	slotIndex?: number;
	isFocused?: boolean;
	onFocus?: () => void;
	onRemove: () => void;
}

// Get theme colors from CSS custom properties
function getTerminalTheme(): {
	background: string;
	foreground: string;
	cursor: string;
	selectionBackground: string;
} {
	const styles = getComputedStyle(document.documentElement);
	const bg =
		styles.getPropertyValue('--terminal-bg').trim() || 'hsl(222, 47%, 5%)';
	const fg =
		styles.getPropertyValue('--foreground').trim() || 'hsl(0, 0%, 88%)';
	const cursor =
		styles.getPropertyValue('--primary').trim() || 'hsl(160, 70%, 45%)';

	return {
		background: bg.startsWith('hsl') ? bg : `hsl(${bg})`,
		foreground: fg.startsWith('hsl') ? fg : `hsl(${fg})`,
		cursor: cursor.startsWith('hsl') ? cursor : `hsl(${cursor})`,
		selectionBackground: 'rgba(100, 200, 150, 0.3)',
	};
}

export function TerminalSession({
	session,
	slotIndex,
	isFocused = false,
	onFocus,
	onRemove,
}: TerminalSessionProps) {
	const {
		socket,
		toggleContextSidebar,
		contextSidebarSessionId,
		stopSession,
		theme,
		font,
		fontScale,
		selectedSessions,
		worktrees,
	} = useAppStore();
	const hasMultipleSessions = selectedSessions.length > 1;

	// Find worktree for this session to get git status
	const worktree = worktrees.find(w => w.path === session.path);

	// Map font type to font family string
	const fontFamilyMap: Record<string, string> = {
		jetbrains: "'JetBrains Mono', monospace",
		fira: "'Fira Code', monospace",
		source: "'Source Code Pro', monospace",
		ibm: "'IBM Plex Mono', monospace",
	};
	const fontFamily = fontFamilyMap[font] || fontFamilyMap.jetbrains;
	const [isMaximized, setIsMaximized] = useState(false);
	const terminalRef = useRef<HTMLDivElement>(null);
	const xtermRef = useRef<XTerm | null>(null);
	const fitAddonRef = useRef<FitAddon | null>(null);
	const sessionIdRef = useRef(session.id);

	const isContextOpen = contextSidebarSessionId === session.id;

	// Format name from path
	const formatName = (path: string) => path.split('/').pop() || path;

	// Keep sessionIdRef in sync
	useEffect(() => {
		sessionIdRef.current = session.id;
	}, [session.id]);

	useLayoutEffect(() => {
		if (!terminalRef.current) return;

		// isMounted flag to prevent old listeners from firing after cleanup
		let isMounted = true;

		const term = new XTerm({
			cursorBlink: true,
			fontFamily: fontFamily,
			fontSize: Math.round(16 * (fontScale / 100)),
			theme: getTerminalTheme(),
		});

		const fitAddon = new FitAddon();
		const webLinksAddon = new WebLinksAddon();

		term.loadAddon(fitAddon);
		term.loadAddon(webLinksAddon);

		term.open(terminalRef.current);
		fitAddon.fit();
		// Don't auto-focus on mount - let isFocused prop control this
		if (isFocused) {
			term.focus();
		}

		xtermRef.current = term;
		fitAddonRef.current = fitAddon;

		// Capture current socket and sessionId for cleanup
		const currentSocket = socket;
		const currentSessionId = session.id;
		const isDevMode = import.meta.env.DEV;

		// Debug log in dev mode
		if (isDevMode) {
			console.log(
				`[TerminalSession] Subscribing to session ${currentSessionId}, socket ${currentSocket.id}`,
			);
		}

		// Subscribe to session
		currentSocket.emit('subscribe_session', currentSessionId);

		// Handle incoming data - uses ref for latest session.id check
		const handleData = (msg: {sessionId: string; data: string} | string) => {
			const content = typeof msg === 'string' ? msg : msg.data;
			const msgSessionId = typeof msg === 'string' ? null : msg.sessionId;

			// Guard: Return immediately if component has been unmounted
			if (!isMounted) {
				return;
			}

			// Strict check: Ignore data from other sessions using ref for current value
			if (msgSessionId && msgSessionId !== sessionIdRef.current) {
				return;
			}

			term.write(content);
		};

		currentSocket.on('terminal_data', handleData);

		// Handle outgoing data - uses ref for current session.id
		const onDataDisposable = term.onData(data => {
			currentSocket.emit('input', {sessionId: sessionIdRef.current, data});
		});

		// Handle resize
		const handleResize = () => {
			if (fitAddonRef.current && xtermRef.current) {
				fitAddonRef.current.fit();
				currentSocket.emit('resize', {
					sessionId: sessionIdRef.current,
					cols: xtermRef.current.cols,
					rows: xtermRef.current.rows,
				});
			}
		};

		window.addEventListener('resize', handleResize);
		// Initial fit - but don't emit resize to PTY immediately to avoid Claude redrawing
		setTimeout(() => {
			if (fitAddonRef.current) {
				fitAddonRef.current.fit();
			}
		}, 100);

		// Create resize observer for container
		const resizeObserver = new ResizeObserver(() => {
			handleResize();
		});

		if (terminalRef.current) {
			resizeObserver.observe(terminalRef.current);
		}

		return () => {
			// Mark as unmounted to prevent old listeners from firing
			isMounted = false;

			// Debug log in dev mode
			if (isDevMode) {
				console.log(
					`[TerminalSession] Unsubscribing from session ${currentSessionId}, socket ${currentSocket.id}`,
				);
			}

			// Unsubscribe BEFORE removing listeners to ensure proper cleanup
			currentSocket.emit('unsubscribe_session', currentSessionId);

			// Use captured references for cleanup to ensure correct socket/session
			currentSocket.off('terminal_data', handleData);
			window.removeEventListener('resize', handleResize);
			resizeObserver.disconnect();
			onDataDisposable.dispose();
			term.dispose();
			xtermRef.current = null;
			fitAddonRef.current = null;
		};
	}, [session.id, socket]);

	// Re-fit when maximized state changes
	useEffect(() => {
		setTimeout(() => {
			if (fitAddonRef.current) {
				fitAddonRef.current.fit();
			}
		}, 100);
	}, [isMaximized]);

	// Update terminal theme when app theme changes
	useEffect(() => {
		if (xtermRef.current) {
			// Give CSS time to apply new theme variables
			setTimeout(() => {
				if (xtermRef.current) {
					xtermRef.current.options.theme = getTerminalTheme();
				}
			}, 50);
		}
	}, [theme]);

	// Update terminal font size when fontScale changes
	useEffect(() => {
		if (xtermRef.current) {
			xtermRef.current.options.fontSize = Math.round(16 * (fontScale / 100));
			fitAddonRef.current?.fit();
		}
	}, [fontScale]);

	// Update terminal font family when font changes
	useEffect(() => {
		if (xtermRef.current) {
			xtermRef.current.options.fontFamily = fontFamily;
			fitAddonRef.current?.fit();
		}
	}, [font, fontFamily]);

	// Focus terminal when isFocused becomes true
	useEffect(() => {
		if (isFocused && xtermRef.current) {
			// Small delay to ensure DOM is ready after state updates
			requestAnimationFrame(() => {
				xtermRef.current?.focus();
			});
		}
	}, [isFocused]);

	const handleCopyOutput = () => {
		if (xtermRef.current) {
			const selection = xtermRef.current.getSelection();
			if (selection) {
				navigator.clipboard.writeText(selection);
			}
		}
	};

	const handleDeleteSession = async () => {
		await stopSession(session.id);
	};

	// Handle clicking the terminal area to focus
	const handleTerminalClick = (e: React.MouseEvent) => {
		e.stopPropagation();
		onFocus?.();
		// Ensure xterm gets focus
		requestAnimationFrame(() => {
			xtermRef.current?.focus();
		});
	};

	return (
		<div
			className={cn(
				'flex flex-col bg-terminal-bg outline-none',
				isMaximized && 'fixed inset-0 z-50',
				hasMultipleSessions && isFocused && 'border-2 border-primary',
			)}
			onClick={handleTerminalClick}
		>
			{/* Terminal header */}
			<div
				className={cn(
					'flex h-7 items-center justify-between border-b border-border bg-card px-2',
					slotIndex !== undefined && 'cursor-pointer',
					isFocused && 'bg-primary/10',
				)}
			>
				<div className="flex items-center gap-2 text-xs min-w-0">
					<StatusIndicator status={mapSessionState(session.state)} />
					{/* Session name with agent icon */}
					{/* TODO: Pass actual agent icon when sessions track their agent */}
					<AgentIcon icon="claude" className="h-4 w-4 shrink-0" />
					<span className="font-medium text-card-foreground truncate">
						{session.name || formatName(session.path)}
					</span>
					{/* Branch name with git icon */}
					{worktree && (
						<>
							<span className="text-border shrink-0">•</span>
							<GitBranch className="h-3 w-3 text-accent shrink-0" />
							<span className={cn(
								'text-muted-foreground truncate',
								worktree.isMainWorktree && 'text-yellow-500'
							)}>
								{worktree.branch || formatName(worktree.path)}
							</span>
						</>
					)}
					<span className="text-muted-foreground shrink-0">({session.state})</span>
					{/* Git status badge */}
					{worktree?.gitStatus &&
						(worktree.gitStatus.filesAdded > 0 ||
							worktree.gitStatus.filesDeleted > 0) && (
							<span className="flex items-center gap-1 font-mono text-[11px] shrink-0">
								{worktree.gitStatus.filesAdded > 0 && (
									<span className="text-green-500">
										+{worktree.gitStatus.filesAdded}
									</span>
								)}
								{worktree.gitStatus.filesDeleted > 0 && (
									<span className="text-red-500">
										-{worktree.gitStatus.filesDeleted}
									</span>
								)}
							</span>
						)}
				</div>

				<div className="flex items-center gap-0.5">
					{/* Info button */}
					<Button
						variant="ghost"
						size="icon"
						className={cn(
							'h-5 w-5',
							isContextOpen
								? 'text-foreground'
								: 'text-muted-foreground hover:text-foreground',
						)}
						onClick={() => toggleContextSidebar(session.id)}
						title="Show session context"
					>
						<Info className="h-3 w-3" />
					</Button>

					{/* Maximize/Minimize */}
					<Button
						variant="ghost"
						size="icon"
						className="h-5 w-5 text-muted-foreground hover:text-foreground"
						onClick={() => setIsMaximized(!isMaximized)}
					>
						{isMaximized ? (
							<Minimize2 className="h-3 w-3" />
						) : (
							<Maximize2 className="h-3 w-3" />
						)}
					</Button>

					{/* More menu */}
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								variant="ghost"
								size="icon"
								className="h-5 w-5 text-muted-foreground hover:text-foreground"
							>
								<MoreVertical className="h-3 w-3" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" className="text-xs">
							<DropdownMenuItem onClick={handleCopyOutput}>
								<Copy className="mr-2 h-3 w-3" />
								Copy selection
							</DropdownMenuItem>
							<DropdownMenuItem
								className="text-destructive"
								onClick={handleDeleteSession}
							>
								<Trash2 className="mr-2 h-3 w-3" />
								Stop session
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>

					{/* Close (remove from view) */}
					<Button
						variant="ghost"
						size="icon"
						className="h-5 w-5 text-muted-foreground hover:text-foreground"
						onClick={onRemove}
					>
						<X className="h-3 w-3" />
					</Button>
				</div>
			</div>

			{/* Terminal content */}
			<div ref={terminalRef} className="flex-1 overflow-hidden" />
		</div>
	);
}
