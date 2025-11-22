import React from 'react';
import { AppView } from '../types';

interface SidebarProps {
  currentView: AppView;
  onChangeView: (view: AppView) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ currentView, onChangeView }) => {
  const navItems = [
    { id: AppView.DASHBOARD, label: 'Dashboard', icon: '📊' },
    { id: AppView.FILES, label: 'Knowledge Base', icon: '🗄️' },
    { id: AppView.PIPELINE, label: 'Processing', icon: '⚙️' },
    { id: AppView.INSPECTOR, label: 'Data Inspector', icon: '🔍' },
    { id: AppView.GRAPH, label: 'Graph View', icon: '🕸️' },
    { id: AppView.CHAT, label: 'RAG Client', icon: '💬' },
  ];

  return (
    <aside className="w-64 bg-slate-900 border-r border-slate-700 flex flex-col h-screen">
      <div className="p-6 border-b border-slate-700">
        <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-cyan-300">
          AiItem Architect
        </h1>
        <p className="text-xs text-slate-500 mt-1">Codebase RAG System</p>
      </div>
      
      <nav className="flex-1 py-4 overflow-y-auto">
        <ul>
          {navItems.map((item) => (
            <li key={item.id}>
              <button
                onClick={() => onChangeView(item.id)}
                className={`w-full text-left px-6 py-3 flex items-center gap-3 transition-colors ${
                  currentView === item.id
                    ? 'bg-blue-900/30 text-blue-400 border-r-2 border-blue-400'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                }`}
              >
                <span className="text-lg">{item.icon}</span>
                <span className="font-medium text-sm">{item.label}</span>
              </button>
            </li>
          ))}
        </ul>
        
        <div className="mt-4 pt-4 border-t border-slate-800">
             <button
                onClick={() => onChangeView(AppView.LOGS)}
                className={`w-full text-left px-6 py-3 flex items-center gap-3 transition-colors ${
                  currentView === AppView.LOGS
                    ? 'bg-blue-900/30 text-blue-400 border-r-2 border-blue-400'
                    : 'text-slate-500 hover:bg-slate-800 hover:text-slate-300'
                }`}
              >
                <span className="text-lg">📟</span>
                <span className="font-medium text-sm">Server Logs</span>
              </button>
        </div>
      </nav>

      <div className="p-6 border-t border-slate-700">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
          System Online
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;