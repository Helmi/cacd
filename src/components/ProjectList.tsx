import React, {useState, useEffect} from 'react';
import {Box, Text, useInput} from 'ink';
import SelectInput from 'ink-select-input';
import {GitProject, Project} from '../types/index.js';
import {projectManager} from '../services/projectManager.js';
import {coreService} from '../services/coreService.js';
import TextInputWrapper from './TextInputWrapper.js';
import {useSearchMode} from '../hooks/useSearchMode.js';
import {globalSessionOrchestrator} from '../services/globalSessionOrchestrator.js';
import {SessionManager} from '../services/sessionManager.js';
import Header from './Header.js';

interface ProjectListProps {
	onSelectProject: (project: GitProject) => void;
	onOpenConfiguration?: () => void;
	error: string | null;
	onDismissError: () => void;
	webConfig?: {
		url: string;
		externalUrl?: string;
		hostname?: string;
		port: number;
		configDir: string;
		isCustomConfigDir: boolean;
	};
}

interface MenuItem {
	label: string;
	value: string;
	project?: GitProject;
}

const ProjectList: React.FC<ProjectListProps> = ({
	onSelectProject,
	onOpenConfiguration,
	error,
	onDismissError,
	webConfig,
}) => {
	const [projects, setProjects] = useState<Project[]>([]);
	const [items, setItems] = useState<MenuItem[]>([]);
	const [loading, setLoading] = useState(true);
	const [addingProject, setAddingProject] = useState(false);
	const [addProjectPath, setAddProjectPath] = useState('');
	const [addProjectError, setAddProjectError] = useState<string | null>(null);
	const [confirmingDelete, setConfirmingDelete] = useState<Project | null>(
		null,
	);
	const [highlightedItem, setHighlightedItem] = useState<MenuItem | null>(null);
	const limit = 10;

	// Use the search mode hook
	const displayError = error || addProjectError;
	const {isSearchMode, searchQuery, selectedIndex, setSearchQuery} =
		useSearchMode(items.length, {
			isDisabled: !!displayError || addingProject || !!confirmingDelete,
			skipInTest: false,
		});

	// Load projects from registry
	const loadProjects = () => {
		setLoading(true);
		// Validate projects first (marks invalid paths)
		projectManager.instance.validateProjects();
		// Get projects sorted by lastAccessed
		const allProjects = projectManager.getProjects();
		setProjects(allProjects);
		setLoading(false);
	};

	useEffect(() => {
		loadProjects();
	}, []);

	// Listen to project changes from WebUI/API
	useEffect(() => {
		const handleProjectChange = () => {
			loadProjects();
		};

		coreService.on('projectAdded', handleProjectChange);
		coreService.on('projectRemoved', handleProjectChange);

		return () => {
			coreService.off('projectAdded', handleProjectChange);
			coreService.off('projectRemoved', handleProjectChange);
		};
	}, []);

	// Build menu items
	useEffect(() => {
		const menuItems: MenuItem[] = [];
		let currentIndex = 0;

		// Filter projects based on search query
		const filteredProjects = searchQuery
			? projects.filter(project =>
					project.name.toLowerCase().includes(searchQuery.toLowerCase()),
				)
			: projects;

		// Build menu items from projects
		filteredProjects.forEach(project => {
			// Get session counts for this project
			const projectSessions = globalSessionOrchestrator.getProjectSessions(
				project.path,
			);
			const counts = SessionManager.getSessionCounts(projectSessions);
			const countsFormatted = SessionManager.formatSessionCounts(counts);

			// Show warning for invalid projects
			const invalidIndicator = project.isValid === false ? ' ⚠️' : '';

			// Only show numbers for total items (0-9) when not in search mode
			const numberPrefix =
				!isSearchMode && currentIndex < 10 ? `${currentIndex} ❯ ` : '❯ ';

			menuItems.push({
				label: numberPrefix + project.name + invalidIndicator + countsFormatted,
				value: project.path,
				project: {
					path: project.path,
					name: project.name,
					relativePath: project.name,
					isValid: project.isValid ?? true,
				},
			});
			currentIndex++;
		});

		// Add menu options only when not in search mode
		if (!isSearchMode) {
			if (projects.length > 0) {
				menuItems.push({
					label: '─────────────',
					value: 'separator',
				});
			}

			menuItems.push({
				label: `A - Add Project`,
				value: 'add-project',
			});
			menuItems.push({
				label: `D - Remove Project`,
				value: 'remove-project',
			});
			menuItems.push({
				label: `C - Global Config`,
				value: 'settings',
			});
			menuItems.push({
				label: `R - Refresh`,
				value: 'refresh',
			});
			menuItems.push({
				label: `Q - Quit`,
				value: 'exit',
			});
		}

		setItems(menuItems);
	}, [projects, searchQuery, isSearchMode]);

	// Handle adding a project
	const handleAddProject = () => {
		if (!addProjectPath.trim()) {
			setAddProjectError('Path cannot be empty');
			return;
		}

		const result = projectManager.addProject(addProjectPath.trim());
		if (result) {
			setAddingProject(false);
			setAddProjectPath('');
			setAddProjectError(null);
			loadProjects();
		} else {
			setAddProjectError('Not a valid git repository');
		}
	};

	// Handle removing a project
	const handleRemoveProject = (project: Project) => {
		projectManager.removeProject(project.path);
		setConfirmingDelete(null);
		loadProjects();
	};

	// Get currently highlighted project for delete action
	const getHighlightedProject = (): Project | null => {
		// In search mode, use selectedIndex
		if (isSearchMode) {
			const selectableItems = items.filter(item => item.project);
			if (selectedIndex >= 0 && selectedIndex < selectableItems.length) {
				const projectPath = selectableItems[selectedIndex]?.project?.path;
				if (projectPath) {
					return projects.find(p => p.path === projectPath) || null;
				}
			}
			return null;
		}
		// Otherwise use the highlighted item from SelectInput
		if (highlightedItem?.project) {
			return (
				projects.find(p => p.path === highlightedItem.project?.path) || null
			);
		}
		return null;
	};

	// Handle hotkeys
	useInput((input, key) => {
		// Skip in test environment to avoid stdin.ref error
		if (!process.stdin.setRawMode) {
			return;
		}

		// Handle delete confirmation mode
		if (confirmingDelete) {
			if (key.escape || input.toLowerCase() === 'n') {
				setConfirmingDelete(null);
			} else if (input.toLowerCase() === 'y') {
				handleRemoveProject(confirmingDelete);
			}
			return;
		}

		// Handle add project mode
		if (addingProject) {
			if (key.escape) {
				setAddingProject(false);
				setAddProjectPath('');
				setAddProjectError(null);
			} else if (key.return) {
				handleAddProject();
			}
			return;
		}

		// Dismiss error on any key press when error is shown
		if (displayError && onDismissError) {
			if (addProjectError) {
				setAddProjectError(null);
			} else {
				onDismissError();
			}
			return;
		}

		// Don't process other keys if in search mode (handled by useSearchMode)
		if (isSearchMode) {
			return;
		}

		const keyPressed = input.toLowerCase();

		// Handle number keys 0-9 for project selection
		if (/^[0-9]$/.test(keyPressed)) {
			const index = parseInt(keyPressed);
			// Get all selectable items
			const selectableItems = items.filter(item => item.project);
			if (
				index < Math.min(10, selectableItems.length) &&
				selectableItems[index]?.project
			) {
				onSelectProject(selectableItems[index].project!);
			}
			return;
		}

		switch (keyPressed) {
			case 'a':
				// Open add project input
				setAddingProject(true);
				setAddProjectPath(process.cwd()); // Default to current directory
				break;
			case 'd': {
				// Remove currently highlighted project (with confirmation)
				const project = getHighlightedProject();
				if (project) {
					setConfirmingDelete(project);
				}
				break;
			}
			case 'c':
				// Open configuration/settings
				if (onOpenConfiguration) {
					onOpenConfiguration();
				}
				break;
			case 'r':
				// Refresh project list
				loadProjects();
				break;
			case 'q':
			case 'x':
				// Trigger exit action
				onSelectProject({
					path: 'EXIT_APPLICATION',
					name: '',
					relativePath: '',
					isValid: false,
				});
				break;
		}
	});

	const handleSelect = (item: MenuItem) => {
		if (item.value.startsWith('separator')) {
			// Do nothing for separators
		} else if (item.value === 'add-project') {
			setAddingProject(true);
			setAddProjectPath(process.cwd());
		} else if (item.value === 'remove-project') {
			// Remove currently highlighted project
			const project = getHighlightedProject();
			if (project) {
				setConfirmingDelete(project);
			} else {
				// Show hint if no project is highlighted
				setAddProjectError(
					'Highlight a project first, then press D to remove it',
				);
			}
		} else if (item.value === 'settings') {
			if (onOpenConfiguration) {
				onOpenConfiguration();
			}
		} else if (item.value === 'refresh') {
			loadProjects();
		} else if (item.value === 'exit') {
			// Handle exit
			onSelectProject({
				path: 'EXIT_APPLICATION',
				name: '',
				relativePath: '',
				isValid: false,
			});
		} else if (item.project) {
			onSelectProject(item.project);
		}
	};

	return (
		<Box flexDirection="column">
			<Header webConfig={webConfig} />

			<Box marginBottom={1}>
				<Text dimColor>Select a project:</Text>
			</Box>

			{confirmingDelete ? (
				<Box
					flexDirection="column"
					marginBottom={1}
					borderStyle="round"
					borderColor="red"
					paddingX={1}
				>
					<Text color="red" bold>
						Remove project from list?
					</Text>
					<Text>{confirmingDelete.name}</Text>
					<Text dimColor>{confirmingDelete.path}</Text>
					<Box marginTop={1}>
						<Text>Press </Text>
						<Text color="green" bold>
							Y
						</Text>
						<Text> to confirm, </Text>
						<Text color="yellow" bold>
							N
						</Text>
						<Text> or </Text>
						<Text color="yellow" bold>
							ESC
						</Text>
						<Text> to cancel</Text>
					</Box>
					<Text dimColor>(This only removes from the list, not from disk)</Text>
				</Box>
			) : addingProject ? (
				<Box flexDirection="column" marginBottom={1}>
					<Box marginBottom={1}>
						<Text>Add project path: </Text>
						<TextInputWrapper
							value={addProjectPath}
							onChange={setAddProjectPath}
							focus={true}
							placeholder="Enter path to git repository..."
						/>
					</Box>
					<Text dimColor>Enter to add, Escape to cancel</Text>
					<Text dimColor>Tip: Run `cacd add .` from any project directory</Text>
				</Box>
			) : isSearchMode ? (
				<Box marginBottom={1}>
					<Text>Search: </Text>
					<TextInputWrapper
						value={searchQuery}
						onChange={setSearchQuery}
						focus={true}
						placeholder="Type to filter projects..."
					/>
				</Box>
			) : null}

			{loading ? (
				<Box>
					<Text color="yellow">Loading projects...</Text>
				</Box>
			) : (
				<>
					{/* Show empty state message when no projects (additive, not replacement) */}
					{projects.length === 0 &&
						!displayError &&
						!addingProject &&
						!isSearchMode && (
							<Box flexDirection="column" marginBottom={1}>
								<Box marginBottom={1}>
									<Text color="yellow">No projects tracked yet.</Text>
								</Box>
								<Text dimColor>
									Select an option below or run: cacd add /path/to/project
								</Text>
							</Box>
						)}

					{/* Search no match message */}
					{isSearchMode && items.length === 0 && (
						<Box>
							<Text color="yellow">No projects match your search</Text>
						</Box>
					)}

					{/* Always render interactive menu (except when adding or empty search) */}
					{!addingProject &&
						!(isSearchMode && items.length === 0) &&
						(isSearchMode ? (
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
								onSelect={handleSelect}
								onHighlight={setHighlightedItem}
								isFocused={!displayError && !confirmingDelete}
								limit={limit}
								initialIndex={selectedIndex}
							/>
						))}
				</>
			)}

			{displayError && (
				<Box marginTop={1} paddingX={1} borderStyle="round" borderColor="red">
					<Box flexDirection="column">
						<Text color="red" bold>
							Error: {displayError}
						</Text>
						<Text color="gray" dimColor>
							Press any key to dismiss
						</Text>
					</Box>
				</Box>
			)}

			<Box marginTop={1} flexDirection="column">
				{(isSearchMode || searchQuery) && (
					<Text dimColor>
						Projects: {items.filter(item => item.project).length} of{' '}
						{projects.length} shown
					</Text>
				)}
				<Text dimColor>
					{confirmingDelete
						? 'Y to confirm, N or ESC to cancel'
						: addingProject
							? 'Enter path to git repository'
							: isSearchMode
								? 'Search Mode: Type to filter, Enter to exit search, ESC to exit search'
								: searchQuery
									? `Filtered: "${searchQuery}" | ↑↓ Navigate Enter Select | /-Search ESC-Clear 0-9 Quick A-Add D-Del C-Settings Q-Quit`
									: 'Controls: ↑↓ Navigate Enter Select | 0-9 Quick /-Search A-Add D-Del C-Settings R-Refresh Q-Quit'}
				</Text>
			</Box>
		</Box>
	);
};

export default ProjectList;
