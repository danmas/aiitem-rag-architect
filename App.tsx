import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import FileExplorer from './components/FileExplorer';
import PipelineView from './components/PipelineView';
import KnowledgeGraph from './components/KnowledgeGraph';
import ChatInterface from './components/ChatInterface';
import Inspector from './components/Inspector';
import LogViewer from './components/LogViewer';
import { AppView, AiItem, FileNode } from './types';
import { MOCK_FILE_TREE, MOCK_AI_ITEMS } from './constants';

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<AppView>(AppView.DASHBOARD);
  const [items] = useState<AiItem[]>(MOCK_AI_ITEMS);
  const [fileTree, setFileTree] = useState<FileNode[]>([]);
  const [currentPath, setCurrentPath] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isDemoMode, setIsDemoMode] = useState<boolean>(false);

  const fetchFileTree = async (path?: string) => {
    setIsLoading(true);
    setError(null);
    
    const url = path ? `/api/files?path=${encodeURIComponent(path)}` : '/api/files';
    
    try {
      const res = await fetch(url);
      
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
          const text = await res.text();
          // Detect if we hit the Vite Dev Server HTML
          if (text.includes('vite')) {
              throw new Error("Proxy Error: Request hit frontend server instead of backend. Check vite.config.ts.");
          }
          throw new Error(`Server returned non-JSON. Status: ${res.status}`);
      }
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `Server Error: ${res.status}`);
      }

      const data = await res.json();
      
      if (Array.isArray(data) && data.length > 0) {
        setFileTree(data);
        if (data[0]?.id && !currentPath) {
           setCurrentPath(data[0].id);
        }
        setIsDemoMode(false);
      } else {
        setFileTree([]);
      }
    } catch (err: any) {
      console.warn("Backend connection failed, falling back to Demo Mode:", err);
      setError(`${err.message} (Switched to Demo Mode)`);
      
      // Fallback to Mock Data so the app is usable
      setFileTree(MOCK_FILE_TREE);
      setIsDemoMode(true);
      if (!currentPath) setCurrentPath('project_root');
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch default file structure on mount
  useEffect(() => {
    fetchFileTree();
  }, []);

  const renderView = () => {
    switch (currentView) {
      case AppView.DASHBOARD:
        return <Dashboard items={items} />;
      case AppView.FILES:
        return (
          <FileExplorer 
            files={fileTree} 
            onScan={fetchFileTree} 
            currentPath={currentPath}
            isLoading={isLoading}
            error={error}
          />
        );
      case AppView.PIPELINE:
        return <PipelineView />;
      case AppView.INSPECTOR:
        return <Inspector items={items} />;
      case AppView.GRAPH:
        return <KnowledgeGraph items={items} />;
      case AppView.CHAT:
        return <ChatInterface items={items} />;
      case AppView.LOGS:
        return <LogViewer />;
      default:
        return <Dashboard items={items} />;
    }
  };

  return (
    <div className="flex h-screen bg-slate-900 text-slate-200 font-sans overflow-hidden">
      <Sidebar currentView={currentView} onChangeView={setCurrentView} />
      <main className="flex-1 overflow-hidden relative bg-slate-900 flex flex-col">
        {isDemoMode && (
            <div className="bg-amber-900/30 border-b border-amber-700/50 text-amber-200 text-xs px-4 py-1 flex justify-between items-center">
                <span>⚠️ <b>Demo Mode Active</b>: Backend unreachable. Showing mock data.</span>
                <button onClick={() => fetchFileTree(currentPath)} className="underline hover:text-white">Retry Connection</button>
            </div>
        )}
        <div className="flex-1 overflow-hidden relative">
            {renderView()}
        </div>
      </main>
    </div>
  );
};

export default App;