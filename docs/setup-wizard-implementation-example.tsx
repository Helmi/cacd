/**
 * Example Implementation: Setup Wizard Component
 * 
 * This demonstrates the structure and patterns for implementing
 * the CACD setup wizard using Ink (React).
 * 
 * Key patterns:
 * - Multi-step wizard with state management
 * - Reuses existing components (TextInputWrapper, SelectInput)
 * - Follows NewWorktree.tsx patterns
 * - Uses ConfigurationManager for persistence
 * - Effect-ts for error handling where appropriate
 */

import React, {useState, useEffect} from 'react';
import {Box, Text, useInput} from 'ink';
import TextInputWrapper from '../components/TextInputWrapper.js';
import SelectInput from 'ink-select-input';
import {configurationManager} from '../services/configurationManager.js';
import {projectManager} from '../services/projectManager.js';
import {generateRandomPort} from '../constants/env.js';
import {detectInstalledAgents} from '../utils/agentDetection.js';
import {existsSync} from 'fs';
import {join} from 'path';
import {randomBytes} from 'crypto';

type SetupStep =
	| 'welcome'
	| 'web-interface'
	| 'port'
	| 'access-token'
	| 'add-project'
	| 'detect-agents'
	| 'summary';

interface SetupWizardProps {
	onComplete: () => void;
	onCancel?: () => void;
}

const SetupWizard: React.FC<SetupWizardProps> = ({onComplete, onCancel}) => {
	// Detect if this is an update vs fresh setup
	const existingConfig = configurationManager.getConfiguration();
	const isUpdateMode = Object.keys(existingConfig).length > 0;

	// State
	const [step, setStep] = useState<SetupStep>('welcome');
	const [webEnabled, setWebEnabled] = useState<boolean>(
		existingConfig.port !== undefined, // Default: enabled if port exists
	);
	const [port, setPort] = useState<string>(
		existingConfig.port?.toString() || generateRandomPort().toString(),
	);
	const [generateToken, setGenerateToken] = useState<boolean>(false);
	const [accessToken, setAccessToken] = useState<string>('');
	const [addCurrentProject, setAddCurrentProject] = useState<boolean>(false);
	const [detectedAgents, setDetectedAgents] = useState<string[]>([]);
	const [isDetecting, setIsDetecting] = useState(false);

	// Check if current directory is a git repo
	const currentDir = process.cwd();
	const isCurrentDirGitRepo = existsSync(join(currentDir, '.git'));

	// Auto-detect agents when reaching that step
	useEffect(() => {
		if (step === 'detect-agents') {
			setIsDetecting(true);
			const agents = configurationManager.getAgents();
			const detected = detectInstalledAgents(agents);
			setDetectedAgents(detected.map(a => a.id));
			setIsDetecting(false);
		}
	}, [step]);

	// Handle completion
	const handleComplete = () => {
		// Save web interface config
		if (webEnabled) {
			const portNum = parseInt(port, 10);
			if (!isNaN(portNum) && portNum > 0 && portNum <= 65535) {
				configurationManager.setPort(portNum);
			}

			// Save access token if generated
			if (generateToken && accessToken) {
				// TODO: Add web.accessToken to config schema
				// For now, could store in a separate file or extend config
				const config = configurationManager.getConfiguration();
				configurationManager.setConfiguration({
					...config,
					web: {
						enabled: true,
						accessToken,
					},
				});
			}
		}

		// Add current directory as project if requested
		if (addCurrentProject && isCurrentDirGitRepo) {
			projectManager.addProject(currentDir);
		}

		onComplete();
	};

	// Navigation handlers
	const handleWebInterfaceChoice = (item: {label: string; value: string}) => {
		setWebEnabled(item.value === 'yes');
		if (item.value === 'yes') {
			setStep('port');
		} else {
			// Skip to project step
			setStep('add-project');
		}
	};

	const handlePortSubmit = (value: string) => {
		const portNum = parseInt(value, 10);
		if (!isNaN(portNum) && portNum > 0 && portNum <= 65535) {
			setPort(value);
			setStep('access-token');
		}
	};

	const handleTokenChoice = (item: {label: string; value: string}) => {
		setGenerateToken(item.value === 'yes');
		if (item.value === 'yes') {
			const token = randomBytes(16).toString('hex');
			setAccessToken(token);
		}
		setStep('add-project');
	};

	const handleProjectChoice = (item: {label: string; value: string}) => {
		setAddCurrentProject(item.value === 'yes');
		setStep('detect-agents');
	};

	// Render step content
	const renderStep = () => {
		switch (step) {
			case 'welcome':
				return (
					<Box flexDirection="column">
						<Text bold color="cyan">
							{isUpdateMode
								? 'Update CA⚡CD Configuration'
								: 'Welcome to CA⚡CD Setup'}
						</Text>
						<Text> </Text>
						<Text>
							{isUpdateMode
								? 'Update your configuration settings.'
								: 'Let\'s configure your setup...'}
						</Text>
						<Text> </Text>
						<Text dimColor>Press Enter to continue</Text>
					</Box>
				);

			case 'web-interface':
				return (
					<Box flexDirection="column">
						<Text bold>Enable web interface?</Text>
						<Text dimColor>
							The web interface provides a modern UI for managing sessions
						</Text>
						<Text> </Text>
						<SelectInput
							items={[
								{label: 'Yes', value: 'yes'},
								{label: 'No', value: 'no'},
							]}
							onSelect={handleWebInterfaceChoice}
						/>
					</Box>
				);

			case 'port':
				return (
					<Box flexDirection="column">
						<Text bold>Web interface port</Text>
						<Text dimColor>
							Port for the web interface (suggested: {generateRandomPort()})
						</Text>
						<Text> </Text>
						<TextInputWrapper
							value={port}
							onChange={setPort}
							onSubmit={handlePortSubmit}
							placeholder="Enter port number"
						/>
						<Text dimColor>Press Enter to continue</Text>
					</Box>
				);

			case 'access-token':
				return (
					<Box flexDirection="column">
						<Text bold>Generate access token?</Text>
						<Text dimColor>
							Add security token to web interface URL (optional)
						</Text>
						<Text> </Text>
						<SelectInput
							items={[
								{label: 'Yes', value: 'yes'},
								{label: 'No (skip)', value: 'no'},
							]}
							onSelect={handleTokenChoice}
						/>
						{generateToken && accessToken && (
							<>
								<Text> </Text>
								<Text color="green">
									Token generated: {accessToken}
								</Text>
								<Text dimColor>
									URL: http://localhost:{port}?token={accessToken}
								</Text>
							</>
						)}
					</Box>
				);

			case 'add-project':
				return (
					<Box flexDirection="column">
						<Text bold>Add current directory as project?</Text>
						{isCurrentDirGitRepo ? (
							<>
								<Text dimColor>Path: {currentDir}</Text>
								<Text> </Text>
								<SelectInput
									items={[
										{label: 'Yes', value: 'yes'},
										{label: 'No', value: 'no'},
									]}
									onSelect={handleProjectChoice}
								/>
							</>
						) : (
							<>
								<Text color="yellow">
									Not a git repository (no .git directory found)
								</Text>
								<Text> </Text>
								<Text dimColor>Press Enter to continue</Text>
							</>
						)}
					</Box>
				);

			case 'detect-agents':
				return (
					<Box flexDirection="column">
						<Text bold>Detecting installed agents...</Text>
						<Text> </Text>
						{isDetecting ? (
							<Text dimColor>Scanning...</Text>
						) : (
							<>
								{detectedAgents.length > 0 ? (
									<>
										<Text color="green">Detected agents:</Text>
										{detectedAgents.map(agentId => (
											<Text key={agentId}>  ✓ {agentId}</Text>
										))}
									</>
								) : (
									<Text color="yellow">No agents detected</Text>
								)}
								<Text> </Text>
								<Text dimColor>Press Enter to continue</Text>
							</>
						)}
					</Box>
				);

			case 'summary':
				return (
					<Box flexDirection="column">
						<Text bold color="cyan">Configuration Summary</Text>
						<Text> </Text>
						<Text>
							Web Interface:{' '}
							{webEnabled ? (
								<Text color="green">Enabled (port {port})</Text>
							) : (
								<Text color="yellow">Disabled</Text>
							)}
						</Text>
						{webEnabled && generateToken && (
							<Text>
								Access Token:{' '}
								<Text color="green">Generated</Text>
							</Text>
						)}
						<Text>
							Projects:{' '}
							<Text color="green">
								{addCurrentProject && isCurrentDirGitRepo ? '1' : '0'}
							</Text>
						</Text>
						<Text>
							Agents:{' '}
							<Text color="green">{detectedAgents.length} detected</Text>
						</Text>
						<Text> </Text>
						<Text color="green" bold>✓ Configuration saved!</Text>
						<Text> </Text>
						<Text dimColor>Run 'cacd' to start</Text>
					</Box>
				);

			default:
				return <Text>Unknown step</Text>;
		}
	};

	// Handle keyboard input for navigation
	useInput((input, key) => {
		if (key.escape && onCancel) {
			onCancel();
			return;
		}

		// Auto-advance welcome step
		if (step === 'welcome' && (key.return || input === '\r')) {
			setStep('web-interface');
		}

		// Auto-advance detect-agents step
		if (step === 'detect-agents' && !isDetecting && (key.return || input === '\r')) {
			setStep('summary');
		}

		// Auto-advance add-project if not git repo
		if (
			step === 'add-project' &&
			!isCurrentDirGitRepo &&
			(key.return || input === '\r')
		) {
			setStep('detect-agents');
		}

		// Complete on summary
		if (step === 'summary' && (key.return || input === '\r')) {
			handleComplete();
		}
	});

	return (
		<Box flexDirection="column" padding={1}>
			{renderStep()}
		</Box>
	);
};

export default SetupWizard;

/**
 * Usage in cli.tsx:
 * 
 * if (subcommand === 'setup') {
 *   const {default: React} = await import('react');
 *   const {render} = await import('ink');
 *   const {default: SetupWizard} = await import('./components/SetupWizard.js');
 * 
 *   const app = render(
 *     React.createElement(SetupWizard, {
 *       onComplete: () => {
 *         app.unmount();
 *         process.exit(0);
 *       },
 *       onCancel: () => {
 *         app.unmount();
 *         process.exit(1);
 *       },
 *     })
 *   );
 * }
 */
