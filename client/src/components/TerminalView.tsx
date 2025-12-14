import { useEffect, useRef } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import 'xterm/css/xterm.css';
import { Socket } from 'socket.io-client';

interface TerminalViewProps {
    sessionId: string;
    socket: Socket;
}

export const TerminalView = ({ sessionId, socket }: TerminalViewProps) => {
    const terminalRef = useRef<HTMLDivElement>(null);
    const xtermRef = useRef<Terminal | null>(null);

    useEffect(() => {
        if (!terminalRef.current) return;

        const term = new Terminal({
            cursorBlink: true,
            cursorStyle: 'bar',
            cursorWidth: 2,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
            fontSize: 14,
            theme: {
                background: '#1e1e1e',
            }
        });
        
        const fitAddon = new FitAddon();
        const webLinksAddon = new WebLinksAddon();
        
        term.loadAddon(fitAddon);
        term.loadAddon(webLinksAddon);
        
        term.open(terminalRef.current);
        fitAddon.fit();
        term.focus();
        
        xtermRef.current = term;

        // Subscribe to session
        socket.emit('subscribe_session', sessionId);

        // Handle incoming data
        const handleData = (msg: { sessionId: string, data: string } | string) => {
            const content = typeof msg === 'string' ? msg : msg.data;
            const msgSessionId = typeof msg === 'string' ? null : msg.sessionId;

            // Strict check: Ignore data from other sessions
            if (msgSessionId && msgSessionId !== sessionId) {
                return;
            }
            
            term.write(content);
        };
        
        socket.on('terminal_data', handleData);

        // Handle outgoing data
        term.onData((data) => {
            socket.emit('input', { sessionId, data });
        });

        // Handle resize
        const handleResize = () => {
            fitAddon.fit();
            socket.emit('resize', { 
                sessionId, 
                cols: term.cols, 
                rows: term.rows 
            });
        };
        
        window.addEventListener('resize', handleResize);
        // Initial fit
        setTimeout(handleResize, 100);

        return () => {
            socket.emit('unsubscribe_session', sessionId);
            socket.off('terminal_data', handleData);
            window.removeEventListener('resize', handleResize);
            term.dispose();
        };
    }, [sessionId, socket]);

    return (
        <div className="h-full w-full flex justify-center bg-black p-6">
            <div className="w-full max-w-6xl h-full border border-gray-800 rounded-lg overflow-hidden bg-[#1e1e1e] shadow-2xl pl-2 pt-2">
                <div ref={terminalRef} className="h-full w-full" />
            </div>
        </div>
    );
};
