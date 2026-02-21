import type {CliCommandContext} from '../types.js';

export async function runProjectCommand(
	context: CliCommandContext,
): Promise<number> {
	const {subcommand, parsedArgs, services, formatter} = context;

	if (subcommand === 'add') {
		const projectPath = parsedArgs.input[1] || process.cwd();
		const result = services.projectManager.addProject(projectPath);
		if (result) {
			formatter.write({
				text: [`✓ Added project: ${result.name}`, `  Path: ${result.path}`],
				data: {
					ok: true,
					command: 'add',
					project: result,
				},
			});
			return 0;
		}

		formatter.writeError({
			text: [
				`✗ Failed to add project: ${projectPath}`,
				'  Not a valid git repository (no .git directory found)',
			],
			data: {
				ok: false,
				command: 'add',
				error: {
					message: `Failed to add project: ${projectPath}`,
					reason: 'Not a valid git repository (no .git directory found)',
				},
			},
		});
		return 1;
	}

	if (subcommand === 'remove') {
		const projectPath = parsedArgs.input[1];
		if (!projectPath) {
			formatter.writeError({
				text: ['Error: Path required for remove command', 'Usage: cacd remove <path>'],
				data: {
					ok: false,
					command: 'remove',
					error: {
						message: 'Path required for remove command',
						usage: 'cacd remove <path>',
					},
				},
			});
			return 1;
		}

		const removed = services.projectManager.removeProject(projectPath);
		if (removed) {
			formatter.write({
				text: [`✓ Removed project: ${projectPath}`],
				data: {
					ok: true,
					command: 'remove',
					path: projectPath,
				},
			});
			return 0;
		}

		formatter.writeError({
			text: [`✗ Project not found: ${projectPath}`],
			data: {
				ok: false,
				command: 'remove',
				error: {
					message: `Project not found: ${projectPath}`,
				},
			},
		});
		return 1;
	}

	services.projectManager.instance.validateProjects();
	const projects = services.projectManager.getProjects();
	if (projects.length === 0) {
		formatter.write({
			text: [
				'No projects tracked yet.',
				'',
				'Add a project with:',
				'  cacd add .              # Add current directory',
				'  cacd add /path/to/repo  # Add specific path',
			],
			data: {
				ok: true,
				command: 'list',
				count: 0,
				projects: [],
			},
		});
		return 0;
	}

	const lines = [`Tracked projects (${projects.length}):`, ''];
	for (const project of projects) {
		const validIndicator = project.isValid === false ? ' ⚠️  (invalid)' : '';
		lines.push(`  ${project.name}${validIndicator}`);
		lines.push(`    ${project.path}`);
		if (project.description) {
			lines.push(`    ${project.description}`);
		}
	}

	formatter.write({
		text: lines,
		data: {
			ok: true,
			command: 'list',
			count: projects.length,
			projects,
		},
	});

	return 0;
}
