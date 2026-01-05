import React, {useState, useEffect} from 'react';
import {Box, Text, useInput} from 'ink';
import SelectInput from 'ink-select-input';
import {Effect} from 'effect';
import {Worktree, Session, GitProject, Project} from '../types/index.js';
import {WorktreeService} from '../services/worktreeService.js';
import {SessionManager} from '../services/sessionManager.js';
import {GitError} from '../types/errors.js';
import {
	STATUS_ICONS,
	STATUS_LABELS,
} from '../constants/statusIcons.js';
import {useGitStatus} from '../hooks/useGitStatus.js';
import {
	prepareWorktreeItems,
	calculateColumnPositions,
	assembleWorktreeLabel,
} from '../utils/worktreeUtils.js';
import {projectManager} from '../services/projectManager.js';
import TextInputWrapper from './TextInputWrapper.js';
import {useSearchMode} from '../hooks/useSearchMode.js';
import {globalSessionOrchestrator} from '../services/globalSessionOrchestrator.js';
import {configurationManager} from '../services/configurationManager.js';
import Header from './Header.js';

interface MenuProps {
	sessionManager: SessionManager;
	worktreeService: WorktreeService;
	onSelectWorktree: (worktree: Worktree) => void;
	onSelectRecentProject?: (project: GitProject) => void;
	error?: string | null;
	onDismissError?: () => void;
	projectName?: string;
	webConfig?: {
		url: string;
		externalUrl?: string;
		hostname?: string;
		port: number;
		configDir: string;
		isCustomConfigDir: boolean;
	};
}

interface CommonItem {
	type: 'common';
	label: string;
	value: string;
}

interface WorktreeItem {
	type: 'worktree';
	label: string;
	value: string;
	worktree: Worktree;
}

interface ProjectItem {
	type: 'project';
	label: string;
	value: string;
	project: Project;
}

type MenuItem = CommonItem | WorktreeItem | ProjectItem;

const createSeparatorWithText = (
	text: string,
	totalWidth: number = 35,
): string => {
	const textWithSpaces = ` ${text} `;
	const textLength = textWithSpaces.length;
	const remainingWidth = totalWidth - textLength;
	const leftDashes = Math.floor(remainingWidth / 2);
	const rightDashes = Math.ceil(remainingWidth / 2);

	return '─'.repeat(leftDashes) + textWithSpaces + '─'.repeat(rightDashes);
};

/**
 * Format GitError for display
 * Extracts relevant error information using pattern matching
 */
const formatGitError = (error: GitError): string => {
	return `Git command failed: ${error.command} (exit ${error.exitCode})\n${error.stderr}`;
};

const Menu: React.FC<MenuProps> = ({
	sessionManager,
	worktreeService,
	onSelectWorktree,
	onSelectRecentProject,
	error,
	onDismissError,
	projectName,
	webConfig,
}) => {
	const [baseWorktrees, setBaseWorktrees] = useState<Worktree[]>([]);
	const [defaultBranch, setDefaultBranch] = useState<string | null>(null);
	const [loadError, setLoadError] = useState<string | null>(null);
	const worktrees = useGitStatus(baseWorktrees, defaultBranch);
	const [sessions, setSessions] = useState<Session[]>([]);
	const [items, setItems] = useState<MenuItem[]>([]);
	const [otherProjects, setOtherProjects] = useState<Project[]>([]);
	const limit = 10;

	// Get worktree configuration for sorting
	const worktreeConfig = configurationManager.getWorktreeConfig();

	// Use the search mode hook
	const {isSearchMode, searchQuery, selectedIndex, setSearchQuery} =
		useSearchMode(items.length, {
			isDisabled: !!error || !!loadError,
		});

	useEffect(() => {
		let cancelled = false;

		// Load worktrees and default branch using Effect composition
		// Chain getWorktreesEffect and getDefaultBranchEffect using Effect.flatMap
		const loadWorktreesAndBranch = Effect.flatMap(
			worktreeService.getWorktreesEffect({
				sortByLastSession: worktreeConfig.sortByLastSession,
			}),
			worktrees =>
				Effect.map(worktreeService.getDefaultBranchEffect(), defaultBranch => ({
					worktrees,
					defaultBranch,
				})),
		);

		Effect.runPromise(
			Effect.match(loadWorktreesAndBranch, {
				onFailure: (error: GitError) => ({
					success: false as const,
					error,
				}),
				onSuccess: ({worktrees, defaultBranch}) => ({
					success: true as const,
					worktrees,
					defaultBranch,
				}),
			}),
		)
			.then(result => {
				if (!cancelled) {
					if (result.success) {
						// Update sessions after worktrees are loaded
						const allSessions = sessionManager.getAllSessions();
						setSessions(allSessions);

						// Update worktree session status
						result.worktrees.forEach(wt => {
							wt.hasSession = allSessions.some(s => s.worktreePath === wt.path);
						});

						setBaseWorktrees(result.worktrees);
						setDefaultBranch(result.defaultBranch);
						setLoadError(null);
					} else {
						// Handle GitError with pattern matching
						setLoadError(formatGitError(result.error));
					}
				}
			})
			.catch((err: unknown) => {
				// This catch should not normally be reached with Effect.match
				if (!cancelled) {
					setLoadError(String(err));
				}
			});

		// Load other projects (filter out current project)
		const allProjects = projectManager.getProjects();
		const currentProjectPath = worktreeService.getGitRootPath();
		const filteredProjects = allProjects.filter(
			(project: Project) => project.path !== currentProjectPath,
		);
		setOtherProjects(filteredProjects);

		// Listen for session changes
		const handleSessionChange = () => {
			const allSessions = sessionManager.getAllSessions();
			setSessions(allSessions);
		};
		sessionManager.on('sessionCreated', handleSessionChange);
		sessionManager.on('sessionDestroyed', handleSessionChange);
		sessionManager.on('sessionStateChanged', handleSessionChange);

		return () => {
			cancelled = true;
			sessionManager.off('sessionCreated', handleSessionChange);
			sessionManager.off('sessionDestroyed', handleSessionChange);
			sessionManager.off('sessionStateChanged', handleSessionChange);
		};
	}, [sessionManager, worktreeService, worktreeConfig.sortByLastSession]);

	useEffect(() => {
		// Prepare worktree items and calculate layout
		const items = prepareWorktreeItems(worktrees, sessions);
		const columnPositions = calculateColumnPositions(items);

		// Filter worktrees based on search query
		const filteredItems = searchQuery
			? items.filter(item => {
					const branchName = item.worktree.branch || '';
					const searchLower = searchQuery.toLowerCase();
					return (
						branchName.toLowerCase().includes(searchLower) ||
						item.worktree.path.toLowerCase().includes(searchLower)
					);
				})
			: items;

		// Build menu items with proper alignment
		const menuItems: MenuItem[] = [];

		// Add "Worktrees" section header for current project (only if we have worktrees and not in search mode)
		if (filteredItems.length > 0 && !isSearchMode) {
			menuItems.push({
				type: 'common',
				label: createSeparatorWithText('Worktrees'),
				value: 'worktrees-separator',
			});
		}

		// Add worktree items
		filteredItems.forEach((item, index) => {
			const label = assembleWorktreeLabel(item, columnPositions);

			// Only show numbers for worktrees (0-9) when not in search mode
			const numberPrefix = !isSearchMode && index < 10 ? `${index} ❯ ` : '❯ ';

			menuItems.push({
				type: 'worktree',
				label: numberPrefix + label,
				value: item.worktree.path,
				worktree: item.worktree,
			});
		});

		// Filter other projects based on search query
		const filteredOtherProjects = searchQuery
			? otherProjects.filter(project =>
					project.name.toLowerCase().includes(searchQuery.toLowerCase()),
				)
			: otherProjects;

		// Add menu options only when not in search mode
		if (!isSearchMode) {
			// Add actions section first (before other projects)
			const actionMenuItems: MenuItem[] = [
				{
					type: 'common',
					label: createSeparatorWithText('Actions'),
					value: 'actions-separator',
				},
				{
					type: 'common',
					label: `N - New Worktree`,
					value: 'new-worktree',
				},
				{
					type: 'common',
					label: `M - Merge Worktree`,
					value: 'merge-worktree',
				},
				{
					type: 'common',
					label: `D - Delete Worktree`,
					value: 'delete-worktree',
				},
				{
					type: 'common',
					label: `C - Global Config`,
					value: 'configuration',
				},
				{
					type: 'common',
					label: `B - Back to project list`,
					value: 'back-to-projects',
				},
			];
			menuItems.push(...actionMenuItems);

			// Add other projects section if there are other tracked projects
			if (filteredOtherProjects.length > 0) {
				menuItems.push({
					type: 'common',
					label: createSeparatorWithText('Other Projects'),
					value: 'other-projects-separator',
				});

				// Add other projects
				// Calculate available number shortcuts for projects
				const worktreeCount = filteredItems.length;
				const availableNumbersForProjects = worktreeCount < 10;

				filteredOtherProjects.forEach((project, index) => {
					// Get session counts for this project
					const projectSessions = globalSessionOrchestrator.getProjectSessions(
						project.path,
					);
					const counts = SessionManager.getSessionCounts(projectSessions);
					const countsFormatted = SessionManager.formatSessionCounts(counts);

					// Show warning for invalid projects
					const invalidIndicator = project.isValid === false ? ' ⚠️' : '';

					// Assign number shortcuts to projects if worktrees < 10
					let label = project.name + invalidIndicator + countsFormatted;
					if (availableNumbersForProjects) {
						const projectNumber = worktreeCount + index;
						if (projectNumber < 10) {
							label = `${projectNumber} ❯ ${label}`;
						} else {
							label = `❯ ${label}`;
						}
					} else {
						label = `❯ ${label}`;
					}

					menuItems.push({
						type: 'project',
						label,
						value: `project-${index}`,
						project: project,
					});
				});
			}
		}
		setItems(menuItems);
	}, [
		worktrees,
		sessions,
		defaultBranch,
		otherProjects,
		searchQuery,
		isSearchMode,
	]);

	// Handle hotkeys
	useInput((input, _key) => {
		// Skip in test environment to avoid stdin.ref error
		if (!process.stdin.setRawMode) {
			return;
		}

		// Dismiss error on any key press when error is shown
		if (error && onDismissError) {
			onDismissError();
			return;
		}

		// Dismiss load error on any key press when load error is shown
		if (loadError) {
			setLoadError(null);
			return;
		}

		// Don't process other keys if in search mode (handled by useSearchMode)
		if (isSearchMode) {
			return;
		}

		const keyPressed = input.toLowerCase();

		// Handle number keys 0-9 for worktree selection
		if (/^[0-9]$/.test(keyPressed)) {
			const index = parseInt(keyPressed);
			// Get filtered worktree items
			const worktreeItems = items.filter(item => item.type === 'worktree');
			const projectItems = items.filter(item => item.type === 'project');

			// Check if it's a worktree
			if (index < worktreeItems.length && worktreeItems[index]) {
				onSelectWorktree(worktreeItems[index].worktree);
				return;
			}

			// Check if it's a recent project (when worktrees < 10)
			if (worktreeItems.length < 10) {
				const projectIndex = index - worktreeItems.length;
				if (
					projectIndex >= 0 &&
					projectIndex < projectItems.length &&
					projectItems[projectIndex]
				) {
					handleSelect(projectItems[projectIndex]);
				}
			}
			return;
		}

		switch (keyPressed) {
			case 'n':
				// Trigger new worktree action
				onSelectWorktree({
					path: '',
					branch: '',
					isMainWorktree: false,
					hasSession: false,
				});
				break;
			case 'm':
				// Trigger merge worktree action
				onSelectWorktree({
					path: 'MERGE_WORKTREE',
					branch: '',
					isMainWorktree: false,
					hasSession: false,
				});
				break;
			case 'd':
				// Trigger delete worktree action
				onSelectWorktree({
					path: 'DELETE_WORKTREE',
					branch: '',
					isMainWorktree: false,
					hasSession: false,
				});
				break;
			case 'c':
				// Trigger configuration action
				onSelectWorktree({
					path: 'CONFIGURATION',
					branch: '',
					isMainWorktree: false,
					hasSession: false,
				});
				break;
			case 'b':
				// Always go back to project list - unified project management
				onSelectWorktree({
					path: 'EXIT_APPLICATION',
					branch: '',
					isMainWorktree: false,
					hasSession: false,
				});
				break;
		}
	});

	const handleSelect = (item: MenuItem) => {
		if (item.value.endsWith('-separator') || item.value === 'recent-header') {
			// Do nothing for separators and headers
		} else if (item.type === 'project') {
			// Handle project selection
			if (onSelectRecentProject) {
				const gitProject: GitProject = {
					path: item.project.path,
					name: item.project.name,
					relativePath: item.project.name,
					isValid: item.project.isValid ?? true,
				};
				onSelectRecentProject(gitProject);
			}
		} else if (item.value === 'new-worktree') {
			// Handle in parent component
			onSelectWorktree({
				path: '',
				branch: '',
				isMainWorktree: false,
				hasSession: false,
			});
		} else if (item.value === 'merge-worktree') {
			// Handle in parent component - use special marker
			onSelectWorktree({
				path: 'MERGE_WORKTREE',
				branch: '',
				isMainWorktree: false,
				hasSession: false,
			});
		} else if (item.value === 'delete-worktree') {
			// Handle in parent component - use special marker
			onSelectWorktree({
				path: 'DELETE_WORKTREE',
				branch: '',
				isMainWorktree: false,
				hasSession: false,
			});
		} else if (item.value === 'configuration') {
			// Handle in parent component - use special marker
			onSelectWorktree({
				path: 'CONFIGURATION',
				branch: '',
				isMainWorktree: false,
				hasSession: false,
			});
		} else if (item.value === 'exit') {
			// Handle in parent component - use special marker
			onSelectWorktree({
				path: 'EXIT_APPLICATION',
				branch: '',
				isMainWorktree: false,
				hasSession: false,
			});
		} else if (item.value === 'back-to-projects') {
			// Handle in parent component - use special marker
			onSelectWorktree({
				path: 'EXIT_APPLICATION',
				branch: '',
				isMainWorktree: false,
				hasSession: false,
			});
		} else if (item.type === 'worktree') {
			onSelectWorktree(item.worktree);
		}
	};

	return (
		<Box flexDirection="column">
			<Header subtitle={projectName} webConfig={webConfig} />

			<Box marginBottom={1}>
				<Text dimColor>
					Select a worktree to start or resume a Claude Code session:
				</Text>
			</Box>

			{isSearchMode && (
				<Box marginBottom={1}>
					<Text>Search: </Text>
					<TextInputWrapper
						value={searchQuery}
						onChange={setSearchQuery}
						focus={true}
						placeholder="Type to filter worktrees..."
					/>
				</Box>
			)}

			{isSearchMode && items.length === 0 ? (
				<Box>
					<Text color="yellow">No worktrees match your search</Text>
				</Box>
			) : isSearchMode ? (
				// In search mode, show the items as a list without SelectInput
				<Box flexDirection="column">
					{items.slice(0, limit).map((item, index) => (
						<Text
							key={item.value}
							color={index === selectedIndex ? 'green' : undefined}
						>
							{index === selectedIndex ? '❯ ' : '  '}
							{item.label}
						</Text>
					))}
				</Box>
			) : (
				<SelectInput
					items={items}
					onSelect={item => handleSelect(item as MenuItem)}
					isFocused={!error}
					initialIndex={selectedIndex}
					limit={limit}
				/>
			)}

			{(error || loadError) && (
				<Box marginTop={1} paddingX={1} borderStyle="round" borderColor="red">
					<Box flexDirection="column">
						<Text color="red" bold>
							Error: {error || loadError}
						</Text>
						<Text color="gray" dimColor>
							Press any key to dismiss
						</Text>
					</Box>
				</Box>
			)}

			<Box marginTop={1} flexDirection="column">
				<Text dimColor>
					Status: {STATUS_ICONS.BUSY} {STATUS_LABELS.BUSY}{' '}
					{STATUS_ICONS.WAITING} {STATUS_LABELS.WAITING} {STATUS_ICONS.IDLE}{' '}
					{STATUS_LABELS.IDLE}
				</Text>
				<Text dimColor>
					{isSearchMode
						? 'Search Mode: Type to filter, Enter to exit search, ESC to exit search'
						: searchQuery
							? `Filtered: "${searchQuery}" | ↑↓ Navigate Enter Select | /-Search ESC-Clear 0-9 Quick Select N-New M-Merge D-Delete C-Config ${
									projectName ? 'B-Back' : 'Q-Quit'
								}`
							: `Controls: ↑↓ Navigate Enter Select | Hotkeys: 0-9 Quick Select /-Search N-New M-Merge D-Delete C-Config ${
									projectName ? 'B-Back' : 'Q-Quit'
								}`}
				</Text>
			</Box>
		</Box>
	);
};

export default Menu;
