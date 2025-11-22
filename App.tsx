import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import FileExplorer from './components/FileExplorer';
import PipelineView from './components/PipelineView';
import KnowledgeGraph from './components/KnowledgeGraph';
import ChatInterface from './components/ChatInterface';
import Inspector from './components/Inspector';
import { AppView, AiItem, FileNode } from './types';
import { MOCK_FILE_TREE, MOCK_AI_ITEMS } from './constants';

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<AppView>(AppView.DASHBOARD);
  const [items] = useState<AiItem[]>(MOCK_AI_ITEMS);
  const [fileTree, setFileTree] = useState<FileNode[]>(MOCK_FILE_TREE);
  const [currentPath, setCurrentPath] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchFileTree = async (path?: string) => {
    setIsLoading(true);
    setError(null);
    
    const url = path ? `/api/files?path=${encodeURIComponent(path)}` : '/api/files';
    
    try {
      const res = await fetch(url);
      
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Server Error: ${res.status}`);
      }
      
      const data = await res.json();
      
      if (Array.isArray(data) && data.length > 0) {
        setFileTree(data);
        // Update current path based on the root node returned if we didn't request a specific one
        // or if the server resolved it to an absolute path
        if (data[0]?.id) {
           setCurrentPath(data[0].id);
        }
      } else {
        setFileTree([]);
      }
    } catch (err: any) {
      console.error("File fetch error:", err);
      setError(err.message || "Failed to connect to backend");
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
      default:
        return <Dashboard items={items} />;
    }
  };

  return (
    <div className="flex h-screen bg-slate-900 text-slate-200 font-sans overflow-hidden">
      <Sidebar currentView={currentView} onChangeView={setCurrentView} />
      <main className="flex-1 overflow-hidden relative bg-slate-900">
        {renderView()}
      </main>
    </div>
  );
};

export default App;