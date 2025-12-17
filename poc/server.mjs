#!/usr/bin/env node
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {WebSocketServer} from 'ws';
import {spawn} from 'node-pty';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.CCMANAGER_POC_PORT || 4577);
const HOST = process.env.CCMANAGER_POC_HOST || '0.0.0.0';
const CMD = process.env.CCMANAGER_POC_CMD || process.env.SHELL || 'bash';
const ARGS = process.env.CCMANAGER_POC_ARGS
	? process.env.CCMANAGER_POC_ARGS.split(' ')
	: [];

const clients = new Set();

const pty = spawn(CMD, ARGS, {
	name: 'xterm-256color',
	cols: 120,
	rows: 40,
	cwd: process.cwd(),
	env: process.env,
});

pty.onData(data => {
	for (const ws of clients) {
		if (ws.readyState === ws.OPEN) {
			ws.send(JSON.stringify({type: 'pty_output', data}));
		}
	}
});

const server = http.createServer((req, res) => {
	if (!req.url || req.method !== 'GET') {
		res.writeHead(404);
		res.end();
		return;
	}

	const url = new URL(req.url, `http://${req.headers.host}`);
	if (url.pathname === '/' || url.pathname === '/index.html') {
		const filePath = path.join(__dirname, 'index.html');
		const html = fs.readFileSync(filePath);
		res.writeHead(200, {'content-type': 'text/html; charset=utf-8'});
		res.end(html);
		return;
	}

	res.writeHead(404);
	res.end('Not found');
});

const wss = new WebSocketServer({server});

wss.on('connection', ws => {
	clients.add(ws);

	ws.on('message', raw => {
		let msg;
		try {
			msg = JSON.parse(String(raw));
		} catch {
			return;
		}

		if (msg.type === 'pty_input' && typeof msg.data === 'string') {
			pty.write(msg.data);
		}

		if (
			msg.type === 'resize' &&
			Number.isFinite(msg.cols) &&
			Number.isFinite(msg.rows)
		) {
			try {
				pty.resize(msg.cols, msg.rows);
			} catch {
				// ignore
			}
		}
	});

	ws.on('close', () => {
		clients.delete(ws);
	});

	ws.send(
		JSON.stringify({
			type: 'info',
			data:
				`Connected to CCManager POC. Command: ${CMD} ${ARGS.join(' ')}`.trim(),
		}),
	);
});

server.listen(PORT, HOST, () => {
	// eslint-disable-next-line no-console
	console.log(
		`CCManager web POC running at http://${HOST}:${PORT} (no auth; LAN only).`,
	);
	// eslint-disable-next-line no-console
	console.log(`Spawning PTY: ${CMD} ${ARGS.join(' ')}`.trim());
});

process.on('SIGINT', () => {
	try {
		pty.kill();
	} catch {
		// ignore
	}
	server.close(() => process.exit(0));
});

