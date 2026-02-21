import {spawnSync} from 'child_process';
import {mkdir} from 'fs/promises';
import dgram from 'dgram';
import dns from 'dns';
import os from 'os';
import type {DaemonWebConfig} from '../../utils/daemonControl.js';
import type {CliCommandContext} from '../types.js';

const DAEMON_READY_TIMEOUT_MS = 15_000;
const DAEMON_POLL_INTERVAL_MS = 200;
const DAEMON_STOP_TIMEOUT_MS = 5_000;

function sleep(ms: number): Promise<void> {
	return new Promise(resolve => {
		setTimeout(resolve, ms);
	});
}

function getProcessUptime(pid: number): string | undefined {
	const result = spawnSync('ps', ['-p', `${pid}`, '-o', 'etime='], {
		encoding: 'utf-8',
	});

	if (result.status !== 0) {
		return undefined;
	}

	const uptime = result.stdout.trim();
	return uptime.length > 0 ? uptime : undefined;
}

function getExternalIP(): Promise<string | undefined> {
	return new Promise(resolve => {
		const socket = dgram.createSocket('udp4');
		socket.connect(80, '8.8.8.8', () => {
			const addr = socket.address();
			socket.close();
			resolve(typeof addr === 'string' ? undefined : addr.address);
		});
		socket.on('error', () => {
			socket.close();
			resolve(undefined);
		});
	});
}

function getLocalHostname(
	externalIP: string | undefined,
): Promise<string | undefined> {
	if (!externalIP) {
		return Promise.resolve(undefined);
	}

	return new Promise(resolve => {
		const hostname = os.hostname();
		dns.lookup(hostname, {family: 4}, (err, addr) => {
			if (!err && addr === externalIP) {
				resolve(hostname);
			} else {
				resolve(undefined);
			}
		});
	});
}

async function withNetworkLinks(
	baseConfig: DaemonWebConfig,
	token: string | undefined,
): Promise<DaemonWebConfig> {
	const externalIP = await getExternalIP();
	const hostname = await getLocalHostname(externalIP);
	const tokenPath = token ? `/${token}` : '';

	return {
		...baseConfig,
		externalUrl: externalIP
			? `http://${externalIP}:${baseConfig.port}${tokenPath}`
			: undefined,
		hostname: hostname
			? `http://${hostname}:${baseConfig.port}${tokenPath}`
			: undefined,
	};
}

async function startDaemonInBackground(context: CliCommandContext): Promise<{
	pid: number;
	started: boolean;
	webConfig: DaemonWebConfig;
}> {
	const existingPid = await context.daemon.lifecycle.readDaemonPidFile(
		context.daemonPidFilePath,
	);
	const baseConfig = context.daemon.control.buildDaemonWebConfig({
		configDir: context.configDir,
		port: context.port,
		accessToken: context.accessToken,
		isCustomConfigDir: context.customConfigDir,
		isDevMode: context.devModeActive,
	});

	if (
		existingPid !== undefined &&
		context.daemon.lifecycle.isProcessRunning(existingPid)
	) {
		return {
			pid: existingPid,
			started: false,
			webConfig: await withNetworkLinks(baseConfig, context.accessToken),
		};
	}

	if (existingPid !== undefined) {
		await context.daemon.lifecycle.cleanupDaemonPidFile(
			context.daemonPidFilePath,
			existingPid,
		);
	}

	const entrypointPath = context.entrypointPath;
	if (!entrypointPath) {
		throw new Error('Unable to start daemon: missing CLI entrypoint path.');
	}

	await mkdir(context.configDir, {recursive: true});
	const daemonProcess = context.daemon.control.spawnDetachedDaemon(
		entrypointPath,
		context.port,
		{
			logFilePath: context.daemonLogPath,
		},
	);
	daemonProcess.unref();

	const deadline = Date.now() + DAEMON_READY_TIMEOUT_MS;
	const daemonPid = await context.daemon.control.waitForDaemonPid({
		pidFilePath: context.daemonPidFilePath,
		deadline,
		pollIntervalMs: DAEMON_POLL_INTERVAL_MS,
	});

	await context.daemon.control.waitForDaemonApiReady({
		baseUrl: `http://127.0.0.1:${context.port}`,
		accessToken: context.accessToken,
		deadline,
		pollIntervalMs: DAEMON_POLL_INTERVAL_MS,
	});

	return {
		pid: daemonPid,
		started: true,
		webConfig: await withNetworkLinks(baseConfig, context.accessToken),
	};
}

async function stopDaemon(
	context: CliCommandContext,
): Promise<{stopped: boolean; pid?: number}> {
	const pid = await context.daemon.lifecycle.readDaemonPidFile(
		context.daemonPidFilePath,
	);
	if (pid === undefined) {
		return {stopped: false};
	}

	if (!context.daemon.lifecycle.isProcessRunning(pid)) {
		await context.daemon.lifecycle.cleanupDaemonPidFile(
			context.daemonPidFilePath,
			pid,
		);
		return {stopped: false};
	}

	try {
		process.kill(pid, 'SIGTERM');
	} catch (error) {
		const errnoError = error as NodeJS.ErrnoException;
		if (errnoError.code !== 'ESRCH') {
			throw error;
		}
	}

	const deadline = Date.now() + DAEMON_STOP_TIMEOUT_MS;
	while (Date.now() < deadline) {
		if (!context.daemon.lifecycle.isProcessRunning(pid)) {
			await context.daemon.lifecycle.cleanupDaemonPidFile(
				context.daemonPidFilePath,
				pid,
			);
			return {stopped: true, pid};
		}
		await sleep(DAEMON_POLL_INTERVAL_MS);
	}

	throw new Error(`Timed out waiting for daemon PID ${pid} to stop.`);
}

export async function runDaemonLifecycleCommand(
	context: CliCommandContext,
): Promise<number> {
	if (context.subcommand === 'start') {
		let result: {pid: number; started: boolean; webConfig: DaemonWebConfig};
		try {
			result = await startDaemonInBackground(context);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			context.formatter.writeError({
				text: [`Failed to start daemon: ${message}`],
				data: {
					ok: false,
					command: 'start',
					error: {
						message,
					},
				},
			});
			return 1;
		}

		const lines: string[] = [];
		if (result.started) {
			lines.push('CA⚡CD daemon started in background');
		} else {
			lines.push(`Daemon already running (PID ${result.pid})`);
		}
		lines.push(`Local URL:    ${result.webConfig.url}`);
		lines.push(
			`External URL: ${result.webConfig.externalUrl || '(unavailable)'}`,
		);
		lines.push(`PID:          ${result.pid}`);
		lines.push(`Config Dir:   ${context.configDir}`);
		lines.push(`PID File:     ${context.daemonPidFilePath}`);
		lines.push(`Log File:     ${context.daemonLogPath}`);

		context.formatter.write({
			text: lines,
			data: {
				ok: true,
				command: 'start',
				started: result.started,
				pid: result.pid,
				webConfig: result.webConfig,
				configDir: context.configDir,
				pidFile: context.daemonPidFilePath,
				logFile: context.daemonLogPath,
			},
		});
		return 0;
	}

	if (context.subcommand === 'stop') {
		let result: {stopped: boolean; pid?: number};
		try {
			result = await stopDaemon(context);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			context.formatter.writeError({
				text: [`Failed to stop daemon: ${message}`],
				data: {
					ok: false,
					command: 'stop',
					error: {
						message,
					},
				},
			});
			return 1;
		}

		if (!result.stopped) {
			context.formatter.write({
				text: ['No daemon running'],
				data: {
					ok: true,
					command: 'stop',
					stopped: false,
				},
			});
			return 0;
		}

		context.formatter.write({
			text: [`Daemon stopped (PID ${result.pid})`],
			data: {
				ok: true,
				command: 'stop',
				stopped: true,
				pid: result.pid,
			},
		});
		return 0;
	}

	if (context.subcommand === 'status') {
		let statusOutput: {
			running: boolean;
			pid?: number;
			webConfig?: DaemonWebConfig;
			uptime?: string;
		};
		try {
			const pid = await context.daemon.lifecycle.readDaemonPidFile(
				context.daemonPidFilePath,
			);
			if (pid === undefined || !context.daemon.lifecycle.isProcessRunning(pid)) {
				if (pid !== undefined) {
					await context.daemon.lifecycle.cleanupDaemonPidFile(
						context.daemonPidFilePath,
						pid,
					);
				}
				statusOutput = {running: false};
			} else {
				const baseConfig = context.daemon.control.buildDaemonWebConfig({
					configDir: context.configDir,
					port: context.port,
					accessToken: context.accessToken,
					isCustomConfigDir: context.customConfigDir,
					isDevMode: context.devModeActive,
				});
				statusOutput = {
					running: true,
					pid,
					webConfig: await withNetworkLinks(baseConfig, context.accessToken),
					uptime: getProcessUptime(pid),
				};
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			context.formatter.writeError({
				text: [`Failed to get daemon status: ${message}`],
				data: {
					ok: false,
					command: 'status',
					error: {
						message,
					},
				},
			});
			return 1;
		}

		if (!statusOutput.running) {
			context.formatter.write({
				text: [
					'Daemon is not running',
					`Config Dir: ${context.configDir}`,
					`PID File:   ${context.daemonPidFilePath}`,
				],
				data: {
					ok: true,
					command: 'status',
					running: false,
					configDir: context.configDir,
					pidFile: context.daemonPidFilePath,
				},
			});
			return 0;
		}

		const lines = [
			'Daemon is running',
			`PID:          ${statusOutput.pid}`,
			`Local URL:    ${statusOutput.webConfig?.url}`,
			`External URL: ${statusOutput.webConfig?.externalUrl || '(unavailable)'}`,
			`Config Dir:   ${context.configDir}`,
			`PID File:     ${context.daemonPidFilePath}`,
			`Log File:     ${context.daemonLogPath}`,
		];
		if (statusOutput.uptime) {
			lines.push(`Uptime:       ${statusOutput.uptime}`);
		}

		context.formatter.write({
			text: lines,
			data: {
				ok: true,
				command: 'status',
				running: true,
				pid: statusOutput.pid,
				webConfig: statusOutput.webConfig,
				uptime: statusOutput.uptime,
				configDir: context.configDir,
				pidFile: context.daemonPidFilePath,
				logFile: context.daemonLogPath,
			},
		});
		return 0;
	}

	let result: {pid: number; started: boolean; webConfig: DaemonWebConfig};
	try {
		await stopDaemon(context);
		result = await startDaemonInBackground(context);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		context.formatter.writeError({
			text: [`Failed to restart daemon: ${message}`],
			data: {
				ok: false,
				command: 'restart',
				error: {
					message,
				},
			},
		});
		return 1;
	}

	context.formatter.write({
		text: [
			`Daemon restarted (PID ${result.pid})`,
			`Local URL:    ${result.webConfig.url}`,
			`External URL: ${result.webConfig.externalUrl || '(unavailable)'}`,
			`Config Dir:   ${context.configDir}`,
			`PID File:     ${context.daemonPidFilePath}`,
			`Log File:     ${context.daemonLogPath}`,
		],
		data: {
			ok: true,
			command: 'restart',
			pid: result.pid,
			webConfig: result.webConfig,
			configDir: context.configDir,
			pidFile: context.daemonPidFilePath,
			logFile: context.daemonLogPath,
		},
	});
	return 0;
}
