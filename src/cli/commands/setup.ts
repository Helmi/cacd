import {runSetup} from '../../services/setupService.js';
import type {CliFlags} from '../types.js';
import type {OutputFormatter} from '../formatter.js';

export interface SetupCommandResult {
	skipped: boolean;
	exitCode: number;
}

export async function runSetupCommand(
	flags: Pick<CliFlags, 'port' | 'noWeb' | 'skipProject' | 'project' | 'force'>,
	formatter: OutputFormatter,
): Promise<SetupCommandResult> {
	const result = await runSetup({
		port: flags.port,
		noWeb: flags.noWeb,
		skipProject: flags.skipProject,
		projectPath: flags.project,
		force: flags.force,
	});

	if (formatter.isJsonEnabled()) {
		formatter.write({
			text: [],
			data: {
				ok: true,
				command: 'setup',
				result,
			},
		});
	}

	return {
		skipped: result.skipped,
		exitCode: result.skipped ? 1 : 0,
	};
}
