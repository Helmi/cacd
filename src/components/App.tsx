import React, {useState, useEffect, useCallback} from 'react';
import {useApp, Box, Text, useInput} from 'ink';
import Menu from './Menu.js';
import ProjectList from './ProjectList.js';
import Session from './Session.js';
import NewWorktree from './NewWorktree.js';
import DeleteWorktree from './DeleteWorktree.js';
import MergeWorktree from './MergeWorktree.js';
import Configuration from './Configuration.js';
import AgentSelector from './AgentSelector.js';
import RemoteBranchSelector from './RemoteBranchSelector.js';
import LoadingSpinner from './LoadingSpinner.js';
import {globalSessionOrchestrator} from '../services/globalSessionOrchestrator.js';
import {
	Worktree,
	DevcontainerConfig,
	GitProject,
	AmbiguousBranchError,
	RemoteBranchMatch,
} from '../types/index.js';
import {tuiApiClient, type ApiSession} from './tuiApiClient.js';

type View =
	| 'menu'
	| 'project-list'
	| 'session'
	| 'new-worktree'
	| 'creating-worktree'
	| 'creating-session'
	| 'delete-worktree'
	| 'deleting-worktree'
	| 'merge-worktree'
	| 'configuration'
	| 'agent-selector'
	| 'remote-branch-selector'
	| 'clearing';

interface AppProps {
	devcontainerConfig?: DevcontainerConfig;
	webConfig?: {
		url: string;
		externalUrl?: string;
		hostname?: string;
		port: number;
		configDir: string;
		isCustomConfigDir: boolean;
	};
}

const App: React.FC<AppProps> = ({devcontainerConfig, webConfig}) => {
	const {exit} = useApp();
	const [view, setView] = useState<View>('project-list');
	const [sessions, setSessions] = useState<ApiSession[]>([]);
	const [activeSession, setActiveSession] = useState<ApiSession | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [menuKey, setMenuKey] = useState(0);
	const [selectedWorktree, setSelectedWorktree] = useState<Worktree | null>(
		null,
	);
	const [selectedProject, setSelectedProject] = useState<GitProject | null>(
		null,
	);

	const [pendingWorktreeCreation, setPendingWorktreeCreation] = useState<{
		path: string;
		branch: string;
		baseBranch: string;
		copySessionData: boolean;
		copyClaudeDirectory: boolean;
		ambiguousError: AmbiguousBranchError;
	} | null>(null);

	const [loadingContext, setLoadingContext] = useState<{
		copySessionData?: boolean;
		deleteBranch?: boolean;
	}>({});

	const getErrorMessage = (issue: unknown): string =>
		issue instanceof Error ? issue.message : String(issue);

	const clearScreen = () => {
		if (process.stdout.isTTY) {
			process.stdout.write('\x1B[2J\x1B[H');
		}
	};

	const navigateWithClear = useCallback(
		(newView: View, callback?: () => void) => {
			clearScreen();
			setView('clearing');
			setTimeout(() => {
				setView(newView);
				if (callback) callback();
			}, 10);
		},
		[],
	);

	useEffect(() => {
		let mounted = true;
		tuiApiClient.configureFromWebConfig(webConfig);
		tuiApiClient.connectSocket();

		const refreshSessions = async () => {
			try {
				const loadedSessions = await tuiApiClient.fetchSessions();
				if (mounted) {
					setSessions(loadedSessions);
				}
			} catch {
				/* ignore transient refresh failures */
			}
		};

		const loadInitialState = async () => {
			try {
				const [state, loadedSessions] = await Promise.all([
					tuiApiClient.fetchState(),
					tuiApiClient.fetchSessions(),
				]);

				if (!mounted) {
					return;
				}

				setSelectedProject(state.selectedProject);
				setSessions(loadedSessions);
				setError(null);
			} catch (loadError) {
				if (mounted) {
					setError(
						`Failed to connect to daemon: ${getErrorMessage(loadError)}`,
					);
				}
			}
		};

		const handleSessionUpdate = () => {
			void refreshSessions();
		};

		tuiApiClient.on('session_update', handleSessionUpdate);
		void loadInitialState();

		return () => {
			mounted = false;
			tuiApiClient.off('session_update', handleSessionUpdate);
			tuiApiClient.disconnectSocket();
		};
	}, [webConfig]);

	useEffect(() => {
		if (!activeSession) {
			return;
		}

		const updatedSession = sessions.find(
			session => session.id === activeSession.id,
		);
		if (updatedSession) {
			if (
				updatedSession.state !== activeSession.state ||
				updatedSession.name !== activeSession.name ||
				updatedSession.isActive !== activeSession.isActive
			) {
				setActiveSession(updatedSession);
			}
			return;
		}

		setActiveSession(null);
		setError(null);

		const targetView = selectedProject ? 'menu' : 'project-list';
		navigateWithClear(targetView, () => {
			setMenuKey(prev => prev + 1);
			process.stdin.resume();
			process.stdin.setEncoding('utf8');
		});
	}, [activeSession, navigateWithClear, selectedProject, sessions]);

	const parseAmbiguousBranchError = (
		errorMessage: string,
	): AmbiguousBranchError | null => {
		const pattern =
			/Ambiguous branch '(.+?)' found in multiple remotes: (.+?)\. Please specify which remote to use\./;
		const match = errorMessage.match(pattern);

		if (!match) {
			return null;
		}

		const branchName = match[1]!;
		const remoteRefsText = match[2]!;
		const remoteRefs = remoteRefsText.split(', ');

		const matches: RemoteBranchMatch[] = remoteRefs.map(fullRef => {
			const parts = fullRef.split('/');
			const remote = parts[0]!;
			const branch = parts.slice(1).join('/');
			return {
				remote,
				branch,
				fullRef,
			};
		});

		return new AmbiguousBranchError(branchName, matches);
	};

	const handleReturnToMenu = () => {
		setActiveSession(null);

		const targetView = selectedProject ? 'menu' : 'project-list';
		navigateWithClear(targetView, () => {
			setMenuKey(prev => prev + 1);

			if (process.stdin.isTTY) {
				process.stdin.read();
				process.stdin.resume();
				process.stdin.setEncoding('utf8');
			}
		});
	};

	const handleWorktreeCreationResult = (
		result: {success: boolean; error?: string; warnings?: string[]},
		creationData: {
			path: string;
			branch: string;
			baseBranch: string;
			copySessionData: boolean;
			copyClaudeDirectory: boolean;
		},
	) => {
		if (result.success) {
			if (result.warnings && result.warnings.length > 0) {
				setError(
					`Worktree created with warnings:\n${result.warnings.join('\n')}`,
				);
			}
			handleReturnToMenu();
			return;
		}

		const errorMessage = result.error || 'Failed to create worktree';
		const ambiguousError = parseAmbiguousBranchError(errorMessage);

		if (ambiguousError) {
			setPendingWorktreeCreation({
				...creationData,
				ambiguousError,
			});
			navigateWithClear('remote-branch-selector');
			return;
		}

		setError(errorMessage);
		setView('new-worktree');
	};

	const handleSelectWorktree = async (worktree: Worktree) => {
		if (worktree.path === '') {
			navigateWithClear('new-worktree');
			return;
		}

		if (worktree.path === 'DELETE_WORKTREE') {
			navigateWithClear('delete-worktree');
			return;
		}

		if (worktree.path === 'MERGE_WORKTREE') {
			navigateWithClear('merge-worktree');
			return;
		}

		if (worktree.path === 'CONFIGURATION') {
			navigateWithClear('configuration');
			return;
		}

		if (worktree.path === 'EXIT_APPLICATION') {
			void handleBackToProjectList();
			return;
		}

		try {
			const existingSession =
				sessions.find(existing => existing.path === worktree.path) ||
				(await tuiApiClient.findSessionByWorktreePath(worktree.path));

			if (existingSession) {
				setActiveSession(existingSession);
				navigateWithClear('session');
				return;
			}
		} catch (sessionLookupError) {
			setError(
				`Failed to check existing sessions: ${getErrorMessage(sessionLookupError)}`,
			);
			return;
		}

		setSelectedWorktree(worktree);
		navigateWithClear('agent-selector');
	};

	const handleAgentSelectorCancel = () => {
		setSelectedWorktree(null);
		navigateWithClear('menu', () => {
			setMenuKey(prev => prev + 1);
		});
	};

	const handleAgentSelected = async (
		agentId: string,
		options: Record<string, boolean | string>,
	) => {
		if (!selectedWorktree) return;

		setView('creating-session');

		try {
			const session = await tuiApiClient.createSessionWithAgent({
				path: selectedWorktree.path,
				agentId,
				options,
			});
			setSessions(prev => {
				const withoutCurrent = prev.filter(
					existing => existing.id !== session.id,
				);
				return [...withoutCurrent, session];
			});
			setActiveSession(session);
			setSelectedWorktree(null);
			navigateWithClear('session');
		} catch (createError) {
			setError(`Failed to create session: ${getErrorMessage(createError)}`);
			setSelectedWorktree(null);
			navigateWithClear('menu');
		}
	};

	const handleCreateWorktree = async (
		path: string,
		branch: string,
		baseBranch: string,
		copySessionData: boolean,
		copyClaudeDirectory: boolean,
	) => {
		setLoadingContext({copySessionData});
		setView('creating-worktree');
		setError(null);

		try {
			const result = await tuiApiClient.createWorktree({
				path,
				branch,
				baseBranch,
				copySessionData,
				copyClaudeDirectory,
				projectPath: selectedProject?.path,
			});

			handleWorktreeCreationResult(
				{success: true, warnings: result.warnings},
				{path, branch, baseBranch, copySessionData, copyClaudeDirectory},
			);
		} catch (creationError) {
			handleWorktreeCreationResult(
				{success: false, error: getErrorMessage(creationError)},
				{path, branch, baseBranch, copySessionData, copyClaudeDirectory},
			);
		}
	};

	const handleCancelNewWorktree = () => {
		handleReturnToMenu();
	};

	const handleRemoteBranchSelected = async (selectedRemoteRef: string) => {
		if (!pendingWorktreeCreation) return;

		const creationData = pendingWorktreeCreation;
		setPendingWorktreeCreation(null);
		setLoadingContext({copySessionData: creationData.copySessionData});
		setView('creating-worktree');
		setError(null);

		try {
			const result = await tuiApiClient.createWorktree({
				path: creationData.path,
				branch: creationData.branch,
				baseBranch: selectedRemoteRef,
				copySessionData: creationData.copySessionData,
				copyClaudeDirectory: creationData.copyClaudeDirectory,
				projectPath: selectedProject?.path,
			});

			if (result.warnings && result.warnings.length > 0) {
				setError(
					`Worktree created with warnings:\n${result.warnings.join('\n')}`,
				);
			}
			handleReturnToMenu();
		} catch (remoteBranchError) {
			setError(getErrorMessage(remoteBranchError));
			setView('new-worktree');
		}
	};

	const handleRemoteBranchSelectorCancel = () => {
		setPendingWorktreeCreation(null);
		setView('new-worktree');
	};

	const handleDeleteWorktrees = async (
		worktreePaths: string[],
		deleteBranch: boolean,
	) => {
		setLoadingContext({deleteBranch});
		setView('deleting-worktree');
		setError(null);

		for (const path of worktreePaths) {
			try {
				await tuiApiClient.deleteWorktree({
					path,
					deleteBranch,
					projectPath: selectedProject?.path,
				});
			} catch (deleteError) {
				setError(getErrorMessage(deleteError));
				setView('delete-worktree');
				return;
			}
		}

		handleReturnToMenu();
	};

	const handleCancelDeleteWorktree = () => {
		handleReturnToMenu();
	};

	const handleSelectProject = async (project: GitProject) => {
		if (project.path === 'EXIT_APPLICATION') {
			globalSessionOrchestrator.destroyAllSessions();
			exit();
			process.exit(0);
		}

		if (project.isValid === false) {
			setError(`Project path is invalid or no longer exists: ${project.path}`);
			return;
		}

		try {
			await tuiApiClient.selectProject(project.path);
			setSelectedProject(project);
			navigateWithClear('menu');
		} catch (projectError) {
			setError(`Failed to select project: ${getErrorMessage(projectError)}`);
		}
	};

	const handleBackToProjectList = async () => {
		setSelectedProject(null);

		try {
			await tuiApiClient.resetProject();
		} catch (resetError) {
			setError(
				`Failed to reset project selection: ${getErrorMessage(resetError)}`,
			);
		}

		navigateWithClear('project-list', () => {
			setMenuKey(prev => prev + 1);
		});
	};

	useInput(
		(input, key) => {
			if (key.ctrl && input === 'q') {
				globalSessionOrchestrator.destroyAllSessions();
				exit();
				process.exit(0);
			}
		},
		{isActive: view !== 'session'},
	);

	if (view === 'project-list') {
		return (
			<ProjectList
				onSelectProject={handleSelectProject}
				onOpenConfiguration={() => navigateWithClear('configuration')}
				error={error}
				onDismissError={() => setError(null)}
				webConfig={webConfig}
			/>
		);
	}

	if (view === 'menu') {
		if (!selectedProject) {
			return (
				<ProjectList
					onSelectProject={handleSelectProject}
					onOpenConfiguration={() => navigateWithClear('configuration')}
					error={error}
					onDismissError={() => setError(null)}
					webConfig={webConfig}
				/>
			);
		}

		return (
			<Menu
				key={menuKey}
				projectPath={selectedProject.path}
				onSelectWorktree={handleSelectWorktree}
				onSelectRecentProject={handleSelectProject}
				error={error}
				onDismissError={() => setError(null)}
				projectName={selectedProject.name}
				webConfig={webConfig}
			/>
		);
	}

	if (view === 'session' && activeSession) {
		return (
			<Box flexDirection="column">
				<Session
					key={activeSession.id}
					session={activeSession}
					onReturnToMenu={handleReturnToMenu}
				/>
			</Box>
		);
	}

	if (view === 'new-worktree') {
		return (
			<Box flexDirection="column">
				{error && (
					<Box marginBottom={1}>
						<Text color="red">Error: {error}</Text>
					</Box>
				)}
				<NewWorktree
					projectPath={selectedProject?.path || process.cwd()}
					onComplete={handleCreateWorktree}
					onCancel={handleCancelNewWorktree}
				/>
			</Box>
		);
	}

	if (view === 'creating-worktree') {
		const message = loadingContext.copySessionData
			? 'Creating worktree and copying session data...'
			: 'Creating worktree...';

		return (
			<Box flexDirection="column">
				<LoadingSpinner message={message} color="cyan" />
			</Box>
		);
	}

	if (view === 'delete-worktree') {
		return (
			<Box flexDirection="column">
				{error && (
					<Box marginBottom={1}>
						<Text color="red">Error: {error}</Text>
					</Box>
				)}
				<DeleteWorktree
					onComplete={handleDeleteWorktrees}
					onCancel={handleCancelDeleteWorktree}
				/>
			</Box>
		);
	}

	if (view === 'deleting-worktree') {
		const message = loadingContext.deleteBranch
			? 'Deleting worktrees and branches...'
			: 'Deleting worktrees...';

		return (
			<Box flexDirection="column">
				<LoadingSpinner message={message} color="cyan" />
			</Box>
		);
	}

	if (view === 'merge-worktree') {
		return (
			<Box flexDirection="column">
				{error && (
					<Box marginBottom={1}>
						<Text color="red">Error: {error}</Text>
					</Box>
				)}
				<MergeWorktree
					onComplete={handleReturnToMenu}
					onCancel={handleReturnToMenu}
				/>
			</Box>
		);
	}

	if (view === 'configuration') {
		return <Configuration onComplete={handleReturnToMenu} />;
	}

	if (view === 'agent-selector' && selectedWorktree) {
		return (
			<AgentSelector
				onSelect={handleAgentSelected}
				onCancel={handleAgentSelectorCancel}
			/>
		);
	}

	if (view === 'remote-branch-selector' && pendingWorktreeCreation) {
		return (
			<RemoteBranchSelector
				branchName={pendingWorktreeCreation.ambiguousError.branchName}
				matches={pendingWorktreeCreation.ambiguousError.matches}
				onSelect={handleRemoteBranchSelected}
				onCancel={handleRemoteBranchSelectorCancel}
			/>
		);
	}

	if (view === 'creating-session') {
		const message = devcontainerConfig
			? 'Starting devcontainer (this may take a moment)...'
			: 'Creating session...';
		const color = devcontainerConfig ? 'yellow' : 'cyan';

		return (
			<Box flexDirection="column">
				<LoadingSpinner message={message} color={color} />
			</Box>
		);
	}

	if (view === 'clearing') {
		return null;
	}

	return null;
};

export default App;
