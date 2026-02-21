import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import {spawn} from 'child_process';
import path from 'path';
import {fileURLToPath} from 'url';
import {dirname} from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Check if node-pty native module is available
function isNodePtyAvailable(): boolean {
	try {
		// Use eval to bypass linter's require() check

		new Function('return require("node-pty")')();
		return true;
	} catch {
		return false;
	}
}

describe('CLI', () => {
	let originalEnv: NodeJS.ProcessEnv;

	beforeEach(() => {
		originalEnv = {...process.env};
	});

	afterEach(() => {
		process.env = originalEnv;
	});

	describe('--multi-project flag', () => {
		it.skipIf(!isNodePtyAvailable())(
			'should exit with error when CACD_PROJECTS_DIR is not set',
			async () => {
				// Ensure the env var is not set
				delete process.env['CACD_PROJECTS_DIR'];

				// Create a wrapper script that mocks TTY
				const wrapperScript = `
				process.stdin.isTTY = true;
				process.stdout.isTTY = true;
				process.stderr.isTTY = true;
				process.argv = ['node', 'cli.js', '--multi-project'];
				import('./cli.js');
			`;

				const result = await new Promise<{code: number; stderr: string}>(
					resolve => {
						const proc = spawn(
							'node',
							['--input-type=module', '-e', wrapperScript],
							{
								cwd: path.join(__dirname, '../dist'),
								env: {...process.env},
								stdio: ['pipe', 'pipe', 'pipe'],
							},
						);

						let stderr = '';
						proc.stderr?.on('data', data => {
							stderr += data.toString();
						});

						proc.on('close', code => {
							resolve({code: code ?? 1, stderr});
						});
					},
				);

				expect(result.code).toBe(1);
				expect(result.stderr).toContain(
					'CACD_PROJECTS_DIR environment variable must be set',
				);
				expect(result.stderr).toContain(
					'export CACD_PROJECTS_DIR=/path/to/projects',
				);
			},
		);

		it.skipIf(!isNodePtyAvailable())(
			'should not check for env var when --multi-project is not used',
			async () => {
				// Ensure the env var is not set
				delete process.env['CACD_PROJECTS_DIR'];

				const result = await new Promise<{code: number; stderr: string}>(
					resolve => {
						const cliPath = path.join(__dirname, '../dist/cli.js');
						const proc = spawn('node', [cliPath, '--help'], {
							env: {...process.env},
							stdio: ['pipe', 'pipe', 'pipe'],
						});

						let stderr = '';
						proc.stderr?.on('data', data => {
							stderr += data.toString();
						});

						proc.on('close', code => {
							resolve({code: code ?? 1, stderr});
						});
					},
				);

				expect(result.code).toBe(0);
				expect(result.stderr).not.toContain('CACD_PROJECTS_DIR');
			},
		);
	});

	describe('daemon lifecycle', () => {
		afterEach(() => {
			vi.restoreAllMocks();
			vi.resetModules();
		});

		it('gracefully shuts down daemon and cleans sessions on SIGTERM', async () => {
			const originalArgv = [...process.argv];
			process.argv = ['node', '/tmp/unified-entry.tsx', 'daemon'];

			const signalHandlers = new Map<string, () => void>();
			const destroyAllSessions = vi.fn();
			const prepareDaemonPidFile = vi.fn(async () => {});
			const cleanupDaemonPidFile = vi.fn(async () => {});
			const worktreeInitialize = vi.fn();
			const apiStart = vi.fn(async () => ({
				port: 3000,
				address: 'http://0.0.0.0:3000',
			}));
			const socketClose = vi.fn();

			vi.doMock('fs', async importOriginal => {
				const actual = await importOriginal<typeof import('fs')>();
				return {
					...actual,
					existsSync: vi.fn(() => true),
				};
			});

			vi.doMock('dgram', () => ({
				default: {
					createSocket: vi.fn(() => ({
						connect: (_port: number, _host: string, callback: () => void) => {
							callback();
						},
						address: () => ({address: '127.0.0.1', family: 'IPv4', port: 4000}),
						close: socketClose,
						on: vi.fn(),
					})),
				},
			}));

			vi.doMock('dns', () => ({
				default: {
					lookup: vi.fn(
						(
							_hostname: string,
							_options: {family: number},
							callback: (err: null, address: string) => void,
						) => callback(null, '127.0.0.1'),
					),
				},
			}));

			vi.doMock('os', () => ({
				default: {
					hostname: vi.fn(() => 'cacd-host'),
				},
			}));

			vi.doMock('./utils/configDir.js', () => ({
				initializeConfigDir: vi.fn(),
				getConfigDir: vi.fn(() => '/tmp/cacd-test'),
				isCustomConfigDir: vi.fn(() => false),
				isDevModeConfig: vi.fn(() => false),
			}));

			vi.doMock('./utils/daemonLifecycle.js', () => ({
				prepareDaemonPidFile,
				cleanupDaemonPidFile,
				getDaemonPidFilePath: vi.fn(() => '/tmp/cacd-test/daemon.pid'),
			}));

			vi.doMock('./utils/daemonControl.js', () => ({
				ensureDaemonForTui: vi.fn(),
			}));

			vi.doMock('./services/projectManager.js', () => ({
				projectManager: {
					addProject: vi.fn(),
					removeProject: vi.fn(),
					getProjects: vi.fn(() => []),
					instance: {validateProjects: vi.fn()},
				},
			}));

			vi.doMock('./services/worktreeConfigManager.js', () => ({
				worktreeConfigManager: {
					initialize: worktreeInitialize,
				},
			}));

			vi.doMock('./services/configurationManager.js', () => ({
				configurationManager: {
					getConfiguration: vi.fn(() => ({accessToken: 'token'})),
					getPort: vi.fn(() => 3000),
					setPort: vi.fn(),
				},
			}));

			vi.doMock('./services/globalSessionOrchestrator.js', () => ({
				globalSessionOrchestrator: {
					destroyAllSessions,
				},
			}));

			vi.doMock('./services/apiServer.js', () => ({
				apiServer: {
					start: apiStart,
				},
			}));

			vi.doMock('./constants/env.js', () => ({
				ENV_VARS: {PORT: 'CACD_PORT'},
				generateRandomPort: vi.fn(() => 3010),
			}));

			const processOnSpy = vi.spyOn(process, 'on').mockImplementation(((
				event: string,
				handler: () => void,
			) => {
				signalHandlers.set(event, handler);
				return process;
			}) as typeof process.on);
			const processExitSpy = vi
				.spyOn(process, 'exit')
				.mockImplementation((() => undefined) as never);

			const consoleLogSpy = vi
				.spyOn(console, 'log')
				.mockImplementation(() => {});

			try {
				await import('./cli.tsx');

				expect(apiStart).toHaveBeenCalledWith(3000, '0.0.0.0', false);
				expect(prepareDaemonPidFile).toHaveBeenCalledWith(
					'/tmp/cacd-test/daemon.pid',
					process.pid,
				);
				expect(signalHandlers.get('SIGTERM')).toBeTypeOf('function');

				signalHandlers.get('SIGTERM')?.();
				await new Promise(resolve => {
					setTimeout(resolve, 0);
				});

				expect(destroyAllSessions).toHaveBeenCalledTimes(1);
				expect(cleanupDaemonPidFile).toHaveBeenCalledWith(
					'/tmp/cacd-test/daemon.pid',
					process.pid,
				);
				expect(processExitSpy).toHaveBeenCalledWith(0);
				expect(worktreeInitialize).toHaveBeenCalledTimes(1);
				expect(socketClose).toHaveBeenCalledTimes(1);
				expect(consoleLogSpy).toHaveBeenCalled();
			} finally {
				processOnSpy.mockRestore();
				processExitSpy.mockRestore();
				consoleLogSpy.mockRestore();
				process.argv = originalArgv;
			}
		});
	});

	describe('unified entrypoint', () => {
		const originalArgv = [...process.argv];
		const originalStdinIsTTY = process.stdin.isTTY;
		const originalStdoutIsTTY = process.stdout.isTTY;

		afterEach(() => {
			process.argv = [...originalArgv];
			Object.defineProperty(process.stdin, 'isTTY', {
				value: originalStdinIsTTY,
				configurable: true,
			});
			Object.defineProperty(process.stdout, 'isTTY', {
				value: originalStdoutIsTTY,
				configurable: true,
			});
			vi.restoreAllMocks();
			vi.resetModules();
		});

		it('passes external and hostname links to TUI in default cacd mode', async () => {
			process.argv = ['node', '/tmp/unified-entry.tsx'];
			Object.defineProperty(process.stdin, 'isTTY', {
				value: true,
				configurable: true,
			});
			Object.defineProperty(process.stdout, 'isTTY', {
				value: true,
				configurable: true,
			});

			const ensureDaemonForTui = vi.fn(async () => ({
				webConfig: {
					url: 'http://127.0.0.1:3000/token',
					port: 3000,
					configDir: '/tmp/cacd-test',
					isCustomConfigDir: false,
					isDevMode: false,
				},
				pidFilePath: '/tmp/cacd-test/daemon.pid',
				pid: 1234,
				started: false,
			}));
			const createElement = vi.fn(
				(_component: unknown, props: Record<string, unknown>) => props,
			);
			const render = vi.fn(() => ({unmount: vi.fn()}));

			vi.doMock('fs', async importOriginal => {
				const actual = await importOriginal<typeof import('fs')>();
				return {
					...actual,
					existsSync: vi.fn(() => true),
				};
			});
			vi.doMock('dgram', () => ({
				default: {
					createSocket: vi.fn(() => ({
						connect: (_port: number, _host: string, callback: () => void) => {
							callback();
						},
						address: () => ({address: '192.168.0.10', family: 'IPv4', port: 0}),
						close: vi.fn(),
						on: vi.fn(),
					})),
				},
			}));
			vi.doMock('dns', () => ({
				default: {
					lookup: vi.fn(
						(
							_hostname: string,
							_options: {family: number},
							callback: (err: null, address: string) => void,
						) => callback(null, '192.168.0.10'),
					),
				},
			}));
			vi.doMock('os', () => ({
				default: {
					hostname: vi.fn(() => 'cacd-host'),
				},
			}));

			vi.doMock('./utils/configDir.js', () => ({
				initializeConfigDir: vi.fn(),
				getConfigDir: vi.fn(() => '/tmp/cacd-test'),
				isCustomConfigDir: vi.fn(() => false),
				isDevModeConfig: vi.fn(() => false),
			}));
			vi.doMock('./utils/daemonLifecycle.js', () => ({
				prepareDaemonPidFile: vi.fn(),
				cleanupDaemonPidFile: vi.fn(),
				getDaemonPidFilePath: vi.fn(() => '/tmp/cacd-test/daemon.pid'),
			}));
			vi.doMock('./utils/daemonControl.js', () => ({
				ensureDaemonForTui,
			}));
			vi.doMock('./services/projectManager.js', () => ({
				projectManager: {
					addProject: vi.fn(),
					removeProject: vi.fn(),
					getProjects: vi.fn(() => []),
					instance: {validateProjects: vi.fn()},
				},
			}));
			vi.doMock('./services/worktreeConfigManager.js', () => ({
				worktreeConfigManager: {
					initialize: vi.fn(),
				},
			}));
			vi.doMock('./services/configurationManager.js', () => ({
				configurationManager: {
					getConfiguration: vi.fn(() => ({accessToken: 'token'})),
					getPort: vi.fn(() => 3000),
					setPort: vi.fn(),
				},
			}));
			vi.doMock('./services/globalSessionOrchestrator.js', () => ({
				globalSessionOrchestrator: {
					destroyAllSessions: vi.fn(),
				},
			}));
			vi.doMock('./services/apiServer.js', () => ({
				apiServer: {
					start: vi.fn(),
				},
			}));
			vi.doMock('./constants/env.js', () => ({
				ENV_VARS: {PORT: 'CACD_PORT'},
				generateRandomPort: vi.fn(() => 3010),
			}));
			vi.doMock('react', () => ({
				default: {
					createElement,
				},
			}));
			vi.doMock('ink', () => ({
				render,
			}));
			vi.doMock('./components/App.js', () => ({
				default: vi.fn(),
			}));

			const processExitSpy = vi
				.spyOn(process, 'exit')
				.mockImplementation((() => undefined) as never);

			try {
				await import('./cli.tsx');

				expect(ensureDaemonForTui).toHaveBeenCalledWith({
					configDir: '/tmp/cacd-test',
					port: 3000,
					accessToken: 'token',
					isCustomConfigDir: false,
					isDevMode: false,
					autoStart: true,
				});

				const appProps = createElement.mock.calls[0]?.[1] as
					| {
							webConfig?: {
								url: string;
								externalUrl?: string;
								hostname?: string;
							};
					  }
					| undefined;
				expect(appProps?.webConfig?.url).toBe('http://127.0.0.1:3000/token');
				expect(appProps?.webConfig?.externalUrl).toBe(
					'http://192.168.0.10:3000/token',
				);
				expect(appProps?.webConfig?.hostname).toBe(
					'http://cacd-host:3000/token',
				);
				expect(render).toHaveBeenCalledTimes(1);
				expect(processExitSpy).not.toHaveBeenCalled();
			} finally {
				processExitSpy.mockRestore();
			}
		});

		it('keeps `cacd tui` daemon-required behavior', async () => {
			process.argv = ['node', '/tmp/unified-entry.tsx', 'tui'];
			Object.defineProperty(process.stdin, 'isTTY', {
				value: true,
				configurable: true,
			});
			Object.defineProperty(process.stdout, 'isTTY', {
				value: true,
				configurable: true,
			});

			const ensureDaemonForTui = vi.fn(async () => {
				throw new Error('No running CA⚡CD daemon found');
			});

			vi.doMock('fs', async importOriginal => {
				const actual = await importOriginal<typeof import('fs')>();
				return {
					...actual,
					existsSync: vi.fn(() => true),
				};
			});
			vi.doMock('./utils/configDir.js', () => ({
				initializeConfigDir: vi.fn(),
				getConfigDir: vi.fn(() => '/tmp/cacd-test'),
				isCustomConfigDir: vi.fn(() => false),
				isDevModeConfig: vi.fn(() => false),
			}));
			vi.doMock('./utils/daemonLifecycle.js', () => ({
				prepareDaemonPidFile: vi.fn(),
				cleanupDaemonPidFile: vi.fn(),
				getDaemonPidFilePath: vi.fn(() => '/tmp/cacd-test/daemon.pid'),
			}));
			vi.doMock('./utils/daemonControl.js', () => ({
				ensureDaemonForTui,
			}));
			vi.doMock('./services/projectManager.js', () => ({
				projectManager: {
					addProject: vi.fn(),
					removeProject: vi.fn(),
					getProjects: vi.fn(() => []),
					instance: {validateProjects: vi.fn()},
				},
			}));
			vi.doMock('./services/worktreeConfigManager.js', () => ({
				worktreeConfigManager: {
					initialize: vi.fn(),
				},
			}));
			vi.doMock('./services/configurationManager.js', () => ({
				configurationManager: {
					getConfiguration: vi.fn(() => ({accessToken: 'token'})),
					getPort: vi.fn(() => 3000),
					setPort: vi.fn(),
				},
			}));
			vi.doMock('./services/globalSessionOrchestrator.js', () => ({
				globalSessionOrchestrator: {
					destroyAllSessions: vi.fn(),
				},
			}));
			vi.doMock('./services/apiServer.js', () => ({
				apiServer: {
					start: vi.fn(),
				},
			}));
			vi.doMock('./constants/env.js', () => ({
				ENV_VARS: {PORT: 'CACD_PORT'},
				generateRandomPort: vi.fn(() => 3010),
			}));

			const consoleErrorSpy = vi
				.spyOn(console, 'error')
				.mockImplementation(() => {});
			const processExitSpy = vi.spyOn(process, 'exit').mockImplementation(((
				code?: number,
			) => {
				throw new Error(`exit:${code ?? 0}`);
			}) as never);

			try {
				await expect(import('./cli.tsx')).rejects.toThrow('exit:1');
				expect(ensureDaemonForTui).toHaveBeenCalledWith({
					configDir: '/tmp/cacd-test',
					port: 3000,
					accessToken: 'token',
					isCustomConfigDir: false,
					isDevMode: false,
					autoStart: false,
				});
				expect(consoleErrorSpy).toHaveBeenCalledWith(
					'Failed to connect TUI to daemon: No running CA⚡CD daemon found',
				);
			} finally {
				consoleErrorSpy.mockRestore();
				processExitSpy.mockRestore();
			}
		});
	});
});
