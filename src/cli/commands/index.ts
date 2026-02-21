import {runAuthCommand} from './auth.js';
import {runDaemonLifecycleCommand} from './daemonLifecycle.js';
import {runProjectCommand} from './project.js';
import {runQueryCommand} from './query.js';
import type {CliCommandContext, CliCommandHandler} from '../types.js';

const registry = new Map<string, CliCommandHandler>([
	['start', runDaemonLifecycleCommand],
	['stop', runDaemonLifecycleCommand],
	['status', runQueryCommand],
	['restart', runDaemonLifecycleCommand],
	['sessions', runQueryCommand],
	['agents', runQueryCommand],
	['add', runProjectCommand],
	['remove', runProjectCommand],
	['list', runProjectCommand],
	['auth', runAuthCommand],
]);

export function getRegisteredCommands(): string[] {
	return [...registry.keys()];
}

export async function runRegisteredCommand(
	context: CliCommandContext,
): Promise<number | undefined> {
	const handler = registry.get(context.subcommand);
	if (!handler) {
		return undefined;
	}

	return handler(context);
}
