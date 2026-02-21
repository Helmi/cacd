import React, {useState, useEffect, useMemo, useCallback} from 'react';
import {Box, Text, useInput} from 'ink';
import SelectInput from 'ink-select-input';
import {Worktree, GitProject, Project, SessionState} from '../types/index.js';
import {STATUS_ICONS, STATUS_LABELS} from '../constants/statusIcons.js';
import {useGitStatus} from '../hooks/useGitStatus.js';
import {
	prepareWorktreeItems,
	calculateColumnPositions,
	assembleWorktreeLabel,
} from '../utils/worktreeUtils.js';
import TextInputWrapper from './TextInputWrapper.js';
import {useSearchMode} from '../hooks/useSearchMode.js';
import {configurationManager} from '../services/configurationManager.js';
import Header from './Header.js';
import {
	tuiApiClient,
	type ApiSession,
	worktreeBelongsToProject,
} from './tuiApiClient.js';

interface MenuProps {
	projectPath: string;
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

function formatProjectSessionCounts(
	projectPath: string,
	sessions: ApiSession[],
): string {
	const counts: Record<SessionState, number> = {
		idle: 0,
		busy: 0,
		waiting_input: 0,
		pending_auto_approval: 0,
	};
	let total = 0;

	for (const session of sessions) {
		if (!worktreeBelongsToProject(session.path, projectPath)) {
			continue;
		}
		counts[session.state]++;
		total++;
	}

	if (total === 0) {
		return '';
	}

	const parts: string[] = [];
	if (counts.idle > 0) {
		parts.push(`${counts.idle} Idle`);
	}
	if (counts.busy > 0) {
		parts.push(`${counts.busy} Busy`);
	}
	if (counts.waiting_input > 0) {
		parts.push(`${counts.waiting_input} Waiting`);
	}

	return parts.length > 0 ? ` (${parts.join(' / ')})` : '';
}

const Menu: React.FC<MenuProps> = ({
	projectPath,
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
	const [sessions, setSessions] = useState<ApiSession[]>([]);
	const [items, setItems] = useState<MenuItem[]>([]);
	const [otherProjects, setOtherProjects] = useState<Project[]>([]);
	const limit = 10;

	const worktreeConfig = configurationManager.getWorktreeConfig();

	const {isSearchMode, searchQuery, selectedIndex, setSearchQuery} =
		useSearchMode(items.length, {
			isDisabled: !!error || !!loadError,
		});

	const loadData = useCallback(async () => {
		try {
			const [allWorktrees, allSessions, projects, resolvedDefaultBranch] =
				await Promise.all([
					tuiApiClient.fetchWorktrees(),
					tuiApiClient.fetchSessions(),
					tuiApiClient.fetchProjects(),
					tuiApiClient.fetchDefaultBranch(projectPath),
				]);

			const projectWorktrees = allWorktrees.filter(worktree =>
				worktreeBelongsToProject(worktree.path, projectPath),
			);

			projectWorktrees.forEach(worktree => {
				worktree.hasSession = allSessions.some(
					session => session.path === worktree.path,
				);
			});

			setBaseWorktrees(projectWorktrees);
			setDefaultBranch(resolvedDefaultBranch);
			setSessions(allSessions);
			setOtherProjects(projects.filter(project => project.path !== projectPath));
			setLoadError(null);
		} catch (loadDataError) {
			setLoadError(
				loadDataError instanceof Error
					? loadDataError.message
					: String(loadDataError),
			);
		}
	}, [projectPath, worktreeConfig.sortByLastSession]);

	useEffect(() => {
		void loadData();
	}, [loadData]);

	useEffect(() => {
		const handleSessionUpdate = () => {
			tuiApiClient
				.fetchSessions()
				.then(updatedSessions => {
					setSessions(updatedSessions);
					setBaseWorktrees(previousWorktrees =>
						previousWorktrees.map(worktree => ({
							...worktree,
							hasSession: updatedSessions.some(
								session => session.path === worktree.path,
							),
						})),
					);
				})
				.catch(() => {
					/* ignore transient refresh errors */
				});
		};

		tuiApiClient.on('session_update', handleSessionUpdate);
		return () => {
			tuiApiClient.off('session_update', handleSessionUpdate);
		};
	}, []);

	useEffect(() => {
		const worktreeItems = prepareWorktreeItems(
			worktrees,
			sessions.map(session => ({
				worktreePath: session.path,
				state: session.state,
			})),
		);
		const columnPositions = calculateColumnPositions(worktreeItems);

		const filteredWorktreeItems = searchQuery
			? worktreeItems.filter(item => {
					const branchName = item.worktree.branch || '';
					const searchLower = searchQuery.toLowerCase();
					return (
						branchName.toLowerCase().includes(searchLower) ||
						item.worktree.path.toLowerCase().includes(searchLower)
					);
				})
			: worktreeItems;

		const menuItems: MenuItem[] = [];

		if (filteredWorktreeItems.length > 0 && !isSearchMode) {
			menuItems.push({
				type: 'common',
				label: createSeparatorWithText('Worktrees'),
				value: 'worktrees-separator',
			});
		}

		filteredWorktreeItems.forEach((item, index) => {
			const label = assembleWorktreeLabel(item, columnPositions);
			const numberPrefix = !isSearchMode && index < 10 ? `${index} ❯ ` : '❯ ';

			menuItems.push({
				type: 'worktree',
				label: numberPrefix + label,
				value: item.worktree.path,
				worktree: item.worktree,
			});
		});

		const filteredOtherProjects = searchQuery
			? otherProjects.filter(project =>
					project.name.toLowerCase().includes(searchQuery.toLowerCase()),
				)
			: otherProjects;

		if (!isSearchMode) {
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

			if (filteredOtherProjects.length > 0) {
				menuItems.push({
					type: 'common',
					label: createSeparatorWithText('Other Projects'),
					value: 'other-projects-separator',
				});

				const worktreeCount = filteredWorktreeItems.length;
				const availableNumbersForProjects = worktreeCount < 10;

				filteredOtherProjects.forEach((project, index) => {
					const countsFormatted = formatProjectSessionCounts(
						project.path,
						sessions,
					);
					const invalidIndicator = project.isValid === false ? ' ⚠️' : '';

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
						project,
					});
				});
			}
		}

		setItems(menuItems);
	}, [worktrees, sessions, defaultBranch, otherProjects, searchQuery, isSearchMode]);

	useInput((input, _key) => {
		if (!process.stdin.setRawMode) {
			return;
		}

		if (error && onDismissError) {
			onDismissError();
			return;
		}

		if (loadError) {
			setLoadError(null);
			return;
		}

		if (isSearchMode) {
			return;
		}

		const keyPressed = input.toLowerCase();

		if (/^[0-9]$/.test(keyPressed)) {
			const index = Number.parseInt(keyPressed, 10);
			const worktreeItems = items.filter(
				(item): item is WorktreeItem => item.type === 'worktree',
			);
			const projectItems = items.filter(
				(item): item is ProjectItem => item.type === 'project',
			);

			if (index < worktreeItems.length && worktreeItems[index]) {
				onSelectWorktree(worktreeItems[index].worktree);
				return;
			}

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
				onSelectWorktree({
					path: '',
					branch: '',
					isMainWorktree: false,
					hasSession: false,
				});
				break;
			case 'm':
				onSelectWorktree({
					path: 'MERGE_WORKTREE',
					branch: '',
					isMainWorktree: false,
					hasSession: false,
				});
				break;
			case 'd':
				onSelectWorktree({
					path: 'DELETE_WORKTREE',
					branch: '',
					isMainWorktree: false,
					hasSession: false,
				});
				break;
			case 'c':
				onSelectWorktree({
					path: 'CONFIGURATION',
					branch: '',
					isMainWorktree: false,
					hasSession: false,
				});
				break;
			case 'b':
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
			return;
		}
		if (item.type === 'project') {
			if (onSelectRecentProject) {
				const gitProject: GitProject = {
					path: item.project.path,
					name: item.project.name,
					relativePath: item.project.name,
					isValid: item.project.isValid ?? true,
				};
				onSelectRecentProject(gitProject);
			}
			return;
		}
		if (item.value === 'new-worktree') {
			onSelectWorktree({
				path: '',
				branch: '',
				isMainWorktree: false,
				hasSession: false,
			});
			return;
		}
		if (item.value === 'merge-worktree') {
			onSelectWorktree({
				path: 'MERGE_WORKTREE',
				branch: '',
				isMainWorktree: false,
				hasSession: false,
			});
			return;
		}
		if (item.value === 'delete-worktree') {
			onSelectWorktree({
				path: 'DELETE_WORKTREE',
				branch: '',
				isMainWorktree: false,
				hasSession: false,
			});
			return;
		}
		if (item.value === 'configuration') {
			onSelectWorktree({
				path: 'CONFIGURATION',
				branch: '',
				isMainWorktree: false,
				hasSession: false,
			});
			return;
		}
		if (item.value === 'exit' || item.value === 'back-to-projects') {
			onSelectWorktree({
				path: 'EXIT_APPLICATION',
				branch: '',
				isMainWorktree: false,
				hasSession: false,
			});
			return;
		}
		if (item.type === 'worktree') {
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
