import React from 'react';
import {Box, Text} from 'ink';

interface WebConfig {
	url: string;
	externalUrl?: string;
	hostname?: string;
	port: number;
	configDir: string;
	isCustomConfigDir: boolean;
	isDevMode?: boolean;
}

interface HeaderProps {
	subtitle?: string;
	webConfig?: WebConfig;
}

const Header: React.FC<HeaderProps> = ({subtitle, webConfig}) => {
	// Get the network URL (prefer hostname, fallback to externalUrl)
	const networkUrl = webConfig?.hostname || webConfig?.externalUrl;

	return (
		<Box marginBottom={1} flexDirection="column">
			<Text color="cyan"> ░▒▓░</Text>
			<Text color="cyan">
				{' '}
				░▒▓███████▓▒░ ░▒▓███████▓▒░ ░▒▓▓▒ ░▒▓███████▓▒░ ░▒▓████████▓▒░
			</Text>
			<Text color="cyan">
				░▒▓█▓▒░ ░▒▓█▓▒░░▒▓█▓▒░ ░▒▓█▓▒░ ░▒▓█▓▒░ ░▒▓█▓▒░ ░▒▓█▓▒░░▒▓█▓▒░ ░▒▓█▓▒░
			</Text>
			<Text color="cyan">
				░▒▓█▓▒░ ░▒▓█▓▒░ ░▒▓█▓▒░ ░▒▓██▓▒░ ░▒▓█▓▒░ ░▒▓█▓▒░ ░▒▓█▓▒░
			</Text>
			<Text color="cyan">
				░▒▓█▓▒░ ░▒▓█▓▒░ ░▒▓█▓▒░ ░▒▓██▓▒░ ░▒▓█▓▒░ ░▒▓█▓▒░ ░▒▓█▓▒░
			</Text>
			<Text color="cyan">
				░▒▓█▓▒░ ░▒▓█████████▓▒░ ░▒▓███████▓▒░ ░▒▓█▓▒░ ░▒▓█▓▒░ ░▒▓█▓▒░
			</Text>
			<Text color="cyan">
				░▒▓█▓▒░ ░▒▓█▓▒░ ░▒▓█▓▒░ ░▒▓██▓▒░ ░▒▓█▓▒░ ░▒▓█▓▒░ ░▒▓█▓▒░
			</Text>
			<Text color="cyan">
				░▒▓█▓▒░ ░▒▓█▓▒░ ░▒▓█▓▒░ ░▒▓██▓▒░ ░▒▓█▓▒░ ░▒▓█▓▒░ ░▒▓█▓▒░
			</Text>
			<Text color="cyan">
				░▒▓█▓▒░ ░▒▓█▓▒░░▒▓█▓▒░ ░▒▓█▓▒░ ░▒▓█▓▒░ ░▒▓█▓▒░ ░▒▓█▓▒░░▒▓█▓▒░ ░▒▓█▓▒░
			</Text>
			<Text color="cyan">
				{' '}
				░▒▓███████▓▒░ ░▒▓█▓▒░ ░▒▓█▓▒░ ░▒▓▓▒░ ░▒▓███████▓▒░ ░▒▓████████▓▒░
			</Text>
			<Text color="cyan"> ░▓▒░</Text>
			<Text> </Text>
			<Box>
				{webConfig?.isDevMode && (
					<>
						<Text color="black" backgroundColor="yellow" bold>
							DEV
						</Text>
						<Text> </Text>
					</>
				)}
				{networkUrl ? (
					<Text color="yellow">
						Coding Agent Control Desk — Web:{' '}
						<Text color="greenBright">{networkUrl}</Text>
					</Text>
				) : (
					<Text color="yellow">Coding Agent Control Desk</Text>
				)}
			</Box>
			{subtitle && (
				<Text bold color="magenta">
					{subtitle}
				</Text>
			)}
			<Text color="gray">
				────────────────────────────────────────────────────────────────────────────
			</Text>
		</Box>
	);
};

export default Header;
