import React, { useEffect, useState, useRef } from 'react';
import { ServerLog } from '../types';

const LogViewer: React.FC = () => {
  const [logs, setLogs] = useState<ServerLog[]>([]);
  const [polling, setPolling] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  const fetchLogs = async () => {
    try {
      const res = await fetch('/api/logs');
      if (res.ok) {
        const data = await res.json();
        setLogs(data);
      }
    } catch (e) {
      console.error("Failed to fetch logs", e);
    }
  };

  useEffect(() => {
    fetchLogs();
    if (!polling) return;
    const interval = setInterval(fetchLogs, 2000);
    return () => clearInterval(interval);
  }, [polling]);

  useEffect(() => {
    if (polling) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, polling]);

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-300 font-mono text-sm">
      <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900">
        <h2 className="font-bold text-white flex items-center gap-2">
          <span>📟</span> Live Server Logs
        </h2>
        <div className="flex gap-2">
            <button 
                onClick={() => fetchLogs()} 
                className="px-3 py-1 text-xs bg-slate-800 hover:bg-slate-700 rounded border border-slate-700"
            >
                Refresh
            </button>
            <button 
                onClick={() => setPolling(!polling)} 
                className={`px-3 py-1 text-xs rounded border border-slate-700 ${polling ? 'bg-green-900/30 text-green-400 border-green-900' : 'bg-slate-800 text-slate-500'}`}
            >
                {polling ? 'Auto-scroll ON' : 'Auto-scroll PAUSED'}
            </button>
        </div>
      </div>
      
      <div className="flex-1 overflow-auto p-4 space-y-1">
        {logs.length === 0 ? (
            <div className="text-slate-600 italic text-center mt-10">No logs available yet...</div>
        ) : (
            logs.map((log) => (
            <div key={log.id} className="flex gap-3 hover:bg-slate-900 p-1 rounded">
                <span className="text-slate-600 shrink-0 text-xs select-none w-20">{log.timestamp.split('T')[1].split('.')[0]}</span>
                <span className={`shrink-0 font-bold w-12 text-xs ${
                    log.level === 'ERROR' ? 'text-red-500' : 
                    log.level === 'WARN' ? 'text-amber-500' : 'text-blue-500'
                }`}>[{log.level}]</span>
                <span className={`break-all whitespace-pre-wrap ${log.level === 'ERROR' ? 'text-red-300' : 'text-slate-300'}`}>
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