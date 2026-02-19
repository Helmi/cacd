import React, {useState, useMemo} from 'react';
import {Box, Text, useInput} from 'ink';
import SelectInput from 'ink-select-input';
import TextInputWrapper from './TextInputWrapper.js';
import {configurationManager} from '../services/configurationManager.js';
import {shortcutManager} from '../services/shortcutManager.js';
import {AgentConfig} from '../types/index.js';

interface AgentSelectorProps {
	onSelect: (
		agentId: string,
		options: Record<string, boolean | string>,
	) => void;
	onCancel: () => void;
}

type ViewMode = 'agent-list' | 'options-form';

/**
 * Check if an agent has options that need user input.
 * Options can be skipped if:
 * - Agent has no options
 * - All options have default values
 */
function canSkipOptionsForm(agent: AgentConfig): boolean {
	if (agent.options.length === 0) {
		return true;
	}

	// Check if all options have defaults
	return agent.options.every(option => option.default !== undefined);
}

/**
 * Get default option values for an agent.
 */
function getDefaultOptions(
	agent: AgentConfig,
): Record<string, boolean | string> {
	const options: Record<string, boolean | string> = {};
	for (const option of agent.options) {
		if (option.default !== undefined) {
			options[option.id] = option.default;
		} else if (option.type === 'boolean') {
			options[option.id] = false;
		} else {
			options[option.id] = '';
		}
	}
	return options;
}

const AgentSelector: React.FC<AgentSelectorProps> = ({onSelect, onCancel}) => {
	const agents = configurationManager.getEnabledAgents();
	const defaultAgent = configurationManager.getDefaultAgent();

	const [viewMode, setViewMode] = useState<ViewMode>('agent-list');
	const [selectedAgent, setSelectedAgent] = useState<AgentConfig>(defaultAgent);
	const [options, setOptions] = useState<Record<string, boolean | string>>(
		getDefaultOptions(defaultAgent),
	);
	const [editingOptionId, setEditingOptionId] = useState<string | null>(null);
	const [editingValue, setEditingValue] = useState('');
	const [optionIndex, setOptionIndex] = useState(0);
	const [highlightedAgent, setHighlightedAgent] =
		useState<AgentConfig>(defaultAgent);

	// Build agent list items
	const agentItems = useMemo(() => {
		return agents.map(agent => {
			const isDefault = agent.id === defaultAgent.id;
			let label = agent.name;
			if (isDefault) label += ' (default)';
			if (agent.description) label += ` - ${agent.description}`;
			return {
				label,
				value: agent.id,
			};
		});
	}, [agents, defaultAgent.id]);

	// Find initial index for default agent
	const initialAgentIndex = useMemo(() => {
		return agents.findIndex(a => a.id === defaultAgent.id);
	}, [agents, defaultAgent.id]);

	// Handle agent selection
	const handleAgentSelect = (item: {label: string; value: string}) => {
		const agent = agents.find(a => a.id === item.value);
		if (!agent) return;

		setSelectedAgent(agent);
		setOptions(getDefaultOptions(agent));

		// Check if we can skip the options form
		if (canSkipOptionsForm(agent)) {
			// Launch immediately with defaults
			onSelect(agent.id, getDefaultOptions(agent));
		} else {
			// Show options form
			setOptionIndex(0);
			setViewMode('options-form');
		}
	};

	// Handle launching with options
	const handleLaunch = () => {
		onSelect(selectedAgent.id, options);
	};

	// Handle option value change
	const updateOption = (optionId: string, value: boolean | string) => {
		const option = selectedAgent.options.find(o => o.id === optionId);
		if (!option) return;

		// Handle mutual exclusivity groups
		if (option.group && value) {
			// When enabling an option in a group, disable others in the same group
			const newOptions = {...options};
			for (const opt of selectedAgent.options) {
				if (opt.group === option.group && opt.id !== optionId) {
					newOptions[opt.id] = opt.type === 'boolean' ? false : '';
				}
			}
			newOptions[optionId] = value;
			setOptions(newOptions);
		} else {
			setOptions(prev => ({...prev, [optionId]: value}));
		}
	};

	// Handle keyboard input for agent list
	useInput(
		(input, key) => {
			if (viewMode !== 'agent-list') return;

			// Cancel
			if (shortcutManager.matchesShortcut('cancel', input, key)) {
				onCancel();
				return;
			}

			// Force options screen with 'e' or right arrow
			if (input === 'e' || key.rightArrow) {
				// Use the currently highlighted agent
				setSelectedAgent(highlightedAgent);
				setOptions(getDefaultOptions(highlightedAgent));
				setOptionIndex(0);
				setViewMode('options-form');
			}
		},
		{isActive: viewMode === 'agent-list'},
	);

	// Handle keyboard input for options form
	useInput(
		(input, key) => {
			if (viewMode !== 'options-form') return;
			if (editingOptionId) return; // Let TextInput handle when editing

			// Cancel - go back to agent list
			if (shortcutManager.matchesShortcut('cancel', input, key)) {
				setViewMode('agent-list');
				return;
			}

			const visibleOptions = selectedAgent.options;
			const currentOption = visibleOptions[optionIndex];

			// Navigate options
			if (key.upArrow) {
				setOptionIndex(prev => Math.max(0, prev - 1));
				return;
			}
			if (key.downArrow) {
				setOptionIndex(prev => Math.min(visibleOptions.length, prev + 1));
				return;
			}

			// Handle Enter
			if (key.return) {
				// If on "Run" button (after all options)
				if (optionIndex === visibleOptions.length) {
					handleLaunch();
					return;
				}

				// If on a string option, start editing
				if (currentOption?.type === 'string') {
					setEditingOptionId(currentOption.id);
					setEditingValue(String(options[currentOption.id] || ''));
					return;
				}
			}

			// Toggle boolean with space
			if (input === ' ' && currentOption?.type === 'boolean') {
				const currentValue = options[currentOption.id] as boolean;
				updateOption(currentOption.id, !currentValue);
				return;
			}
		},
		{isActive: viewMode === 'options-form' && !editingOptionId},
	);

	// Handle text input completion
	const handleTextInputSubmit = (value: string) => {
		if (editingOptionId) {
			updateOption(editingOptionId, value);
			setEditingOptionId(null);
			setEditingValue('');
		}
	};

	// Handle escape during text editing
	useInput(
		(input, key) => {
			if (shortcutManager.matchesShortcut('cancel', input, key)) {
				setEditingOptionId(null);
				setEditingValue('');
			}
		},
		{isActive: !!editingOptionId},
	);

	// Zero-agents guard
	if (agents.length === 0) {
		return (
			<Box flexDirection="column">
				<Box marginBottom={1}>
					<Text bold color="yellow">
						No Agents Configured
					</Text>
				</Box>
				<Box marginBottom={1}>
					<Text>
						No agents are configured. Use the WebUI to add agents before
						starting sessions.
					</Text>
				</Box>
				<Box marginTop={1}>
					<Text dimColor>
						Press {shortcutManager.getShortcutDisplay('cancel')} to go back
					</Text>
				</Box>
			</Box>
		);
	}

	// Render agent list
	if (viewMode === 'agent-list') {
		return (
			<Box flexDirection="column">
				<Box marginBottom={1}>
					<Text bold color="green">
						Select Agent
					</Text>
				</Box>

				<Box marginBottom={1}>
					<Text dimColor>Choose an agent to start the session with</Text>
				</Box>

				<SelectInput
					items={agentItems}
					onSelect={handleAgentSelect}
					onHighlight={(item: {label: string; value: string}) => {
						const agent = agents.find(a => a.id === item.value);
						if (agent) setHighlightedAgent(agent);
					}}
					initialIndex={initialAgentIndex >= 0 ? initialAgentIndex : 0}
					limit={10}
				/>

				<Box marginTop={1}>
					<Text dimColor>
						↑↓ navigate, Enter to run with defaults, e to configure options,{' '}
						{shortcutManager.getShortcutDisplay('cancel')} to cancel
					</Text>
				</Box>
			</Box>
		);
	}

	// Render options form
	const visibleOptions = selectedAgent.options;

	return (
		<Box flexDirection="column">
			<Box marginBottom={1}>
				<Text bold color="green">
					Configure {selectedAgent.name}
				</Text>
			</Box>

			{selectedAgent.description && (
				<Box marginBottom={1}>
					<Text dimColor>{selectedAgent.description}</Text>
				</Box>
			)}

			{/* Options list */}
			<Box flexDirection="column" marginBottom={1}>
				{visibleOptions.map((option, index) => {
					const isSelected = index === optionIndex;
					const value = options[option.id];
					const isEditing = editingOptionId === option.id;

					return (
						<Box key={option.id} flexDirection="column">
							<Box>
								<Text color={isSelected ? 'green' : undefined}>
									{isSelected ? '❯ ' : '  '}
								</Text>
								{option.type === 'boolean' ? (
									<>
										<Text color={isSelected ? 'green' : undefined}>
											[{value ? 'x' : ' '}] {option.label}
										</Text>
										{option.description && (
											<Text dimColor> - {option.description}</Text>
										)}
									</>
								) : isEditing ? (
									<>
										<Text>{option.label}: </Text>
										<TextInputWrapper
											value={editingValue}
											onChange={setEditingValue}
											onSubmit={handleTextInputSubmit}
											focus={true}
											placeholder={option.description || 'Enter value...'}
										/>
									</>
								) : (
									<>
										<Text color={isSelected ? 'green' : undefined}>
											{option.label}:{' '}
											{value ? String(value) : <Text dimColor>(not set)</Text>}
										</Text>
										{option.description && !value && (
											<Text dimColor> - {option.description}</Text>
										)}
									</>
								)}
							</Box>
							{/* Show choices if available */}
							{option.choices && isSelected && !isEditing && (
								<Box marginLeft={4}>
									<Text dimColor>
										Choices:{' '}
										{option.choices.map(c => c.label || c.value).join(', ')}
									</Text>
								</Box>
							)}
						</Box>
					);
				})}

				{/* Run button */}
				<Box marginTop={1}>
					<Text
						color={optionIndex === visibleOptions.length ? 'green' : undefined}
					>
						{optionIndex === visibleOptions.length ? '❯ ' : '  '}
						[Run {selectedAgent.name}]
					</Text>
				</Box>
			</Box>

			{/* Summary of active options */}
			<Box marginTop={1} borderStyle="round" borderColor="gray" paddingX={1}>
				<Box flexDirection="column">
					<Text dimColor bold>
						Active options:
					</Text>
					<Text dimColor>
						{Object.entries(options)
							.filter(([_, v]) => v !== false && v !== '')
							.map(([id, v]) => {
								const opt = selectedAgent.options.find(o => o.id === id);
								if (!opt) return null;
								return opt.type === 'boolean'
									? opt.label
									: `${opt.label}: ${v}`;
							})
							.filter(Boolean)
							.join(', ') || 'None'}
					</Text>
				</Box>
			</Box>

			<Box marginTop={1}>
				<Text dimColor>
					↑↓ navigate, Space toggle, Enter edit/run,{' '}
					{shortcutManager.getShortcutDisplay('cancel')} back
				</Text>
			</Box>
		</Box>
	);
};

export default AgentSelector;
