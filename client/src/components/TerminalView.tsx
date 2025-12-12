import { useEffect, useRef } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { Socket } from 'socket.io-client';
import 'xterm/css/xterm.css';

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
            theme: {
                background: '#1e1e1e',
            }
        });
        
        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);
        
        term.open(terminalRef.current);
        fitAddon.fit();
        
        xtermRef.current = term;

        // Subscribe to session
        socket.emit('subscribe_session', sessionId);

        // Handle incoming data
        const handleData = (data: string) => {
            term.write(data);
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
            socket.off('terminal_data', handleData);
            window.removeEventListener('resize', handleResize);
            term.dispose();
        };
    }, [sessionId, socket]);

    return <div ref={terminalRef} className="h-full w-full overflow-hidden" />;
};
