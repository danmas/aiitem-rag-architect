import React, { useEffect, useState, useRef } from 'react';
import { ServerLog } from '../types';

interface LogViewerProps {
  autoScroll?: boolean;
  onAutoScrollChange?: (enabled: boolean) => void;
  showControls?: boolean;
}

const LogViewer: React.FC<LogViewerProps> = ({ 
  autoScroll: externalAutoScroll, 
  onAutoScrollChange,
  showControls = true 
}) => {
  const [logs, setLogs] = useState<ServerLog[]>([]);
  const [internalAutoScroll, setInternalAutoScroll] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Use external autoScroll if provided, otherwise use internal state
  const autoScroll = externalAutoScroll !== undefined ? externalAutoScroll : internalAutoScroll;
  const setAutoScroll = onAutoScrollChange || setInternalAutoScroll;

  useEffect(() => {
    // Connect to SSE endpoint
    const eventSource = new EventSource('/api/logs/stream');
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setIsConnected(true);
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'connected') {
          setIsConnected(true);
        } else if (data.type === 'log' && data.log) {
          setLogs(prevLogs => {
            // Check if log already exists (avoid duplicates)
            const exists = prevLogs.some(log => log.id === data.log.id);
            if (exists) {
              return prevLogs;
            }
            // Add new log at the end (chronological order)
            return [...prevLogs, data.log];
          });
        }
      } catch (error) {
        console.error('Failed to parse SSE message:', error);
      }
    };

    eventSource.onerror = (error) => {
      console.error('SSE connection error:', error);
      setIsConnected(false);
      
      // Attempt to reconnect after 3 seconds
      setTimeout(() => {
        if (eventSourceRef.current?.readyState === EventSource.CLOSED) {
          // Reconnection will be handled by useEffect
        }
      }, 3000);
    };

    return () => {
      eventSource.close();
      eventSourceRef.current = null;
      setIsConnected(false);
    };
  }, []);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (autoScroll && logs.length > 0) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  const clearLogs = () => {
    setLogs([]);
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-300 font-mono text-sm">
      {showControls && (
        <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900">
          <div className="flex items-center gap-3">
            <h2 className="font-bold text-white flex items-center gap-2">
              <span>📟</span> Live Server Logs
            </h2>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
              <span className="text-xs text-slate-400">
                {isConnected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={clearLogs}
              className="px-3 py-1 text-xs bg-slate-800 hover:bg-slate-700 rounded border border-slate-700"
              title="Clear logs"
            >
              Clear
            </button>
            <button 
              onClick={() => setAutoScroll(!autoScroll)} 
              className={`px-3 py-1 text-xs rounded border border-slate-700 ${
                autoScroll 
                  ? 'bg-green-900/30 text-green-400 border-green-900' 
                  : 'bg-slate-800 text-slate-500'
              }`}
              title="Toggle auto-scroll"
            >
              {autoScroll ? 'Auto-scroll ON' : 'Auto-scroll PAUSED'}
            </button>
          </div>
        </div>
      )}
      
      <div className="flex-1 overflow-auto p-4 space-y-1">
        {logs.length === 0 ? (
          <div className="text-slate-600 italic text-center mt-10">
            {isConnected ? 'Waiting for logs...' : 'Connecting...'}
          </div>
        ) : (
          logs.map((log) => (
            <div key={log.id} className="flex gap-3 hover:bg-slate-900 p-1 rounded">
              <span className="text-slate-600 shrink-0 text-xs select-none w-20">
                {log.timestamp.split('T')[1].split('.')[0]}
              </span>
              <span className={`shrink-0 font-bold w-12 text-xs ${
                log.level === 'ERROR' ? 'text-red-500' : 
                log.level === 'WARN' ? 'text-amber-500' : 'text-blue-500'
              }`}>
                [{log.level}]
              </span>
              <span className={`break-all whitespace-pre-wrap ${
                log.level === 'ERROR' ? 'text-red-300' : 'text-slate-300'
              }`}>
                {log.message}
              </span>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
};

export default LogViewer;