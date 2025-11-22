import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import FileExplorer from './components/FileExplorer';
import PipelineView from './components/PipelineView';
import KnowledgeGraph from './components/KnowledgeGraph';
import ChatInterface from './components/ChatInterface';
import Inspector from './components/Inspector';
import LogViewer from './components/LogViewer';
import { AppView, FileNode } from './types';
import { MOCK_FILE_TREE } from './constants';

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<AppView>(AppView.DASHBOARD);
  const [fileTree, setFileTree] = useState<FileNode[]>([]);
  const [currentPath, setCurrentPath] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isDemoMode, setIsDemoMode] = useState<boolean>(false);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [excludedFiles, setExcludedFiles] = useState<string[]>([]);

  const fetchFileTree = async (path?: string) => {
    setIsLoading(true);
    setError(null);
    
    const url = path ? `/api/files?path=${encodeURIComponent(path)}` : '/api/files';
    
    try {
      const res = await fetch(url);
      const contentType = res.headers.get("content-type");
      
      // Check for HTML response (Vite Dev Server fallback) which indicates backend is down
      if (contentType && contentType.includes("text/html")) {
          throw new Error("BACKEND_UNREACHABLE");
      }
      
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
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
      // Silent fallback to Demo Mode
      if (err.message === "BACKEND_UNREACHABLE" || err.name === 'TypeError') {
          console.warn("Backend server not detected. Switching to Demo Mode.");
      } else {
          console.error("File System Error:", err);
      }
      
      // Fallback to Mock Data
      setFileTree(MOCK_FILE_TREE);
      setIsDemoMode(true);
      setError(null); // Clear visual error since we are handling it via Demo Mode
      if (!currentPath) setCurrentPath('project_root');
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch default file structure on mount
  useEffect(() => {
    fetchFileTree();
  }, []);

  const handleSelectionChange = (selected: string[], excluded: string[]) => {
    setSelectedFiles(selected);
    setExcludedFiles(excluded);
    console.log(`File selection changed: ${selected.length} selected, ${excluded.length} excluded`);
  };

  const handleStartProcessing = async (config: {
    projectPath: string;
    filePatterns: string[];
    selectedFiles: string[];
    excludedFiles: string[];
  }) => {
    try {
      console.log('Starting processing with config:', config);
      
      const response = await fetch('/api/pipeline/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(config)
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log('Pipeline started successfully:', result);
        
        // Переключаемся на Pipeline view для мониторинга
        setCurrentView(AppView.PIPELINE);
      } else {
        const error = await response.json();
        console.error('Failed to start pipeline:', error);
        setError(`Failed to start pipeline: ${error.error || 'Unknown error'}`);
      }
    } catch (err) {
      console.error('Error starting pipeline:', err);
      setError(`Error starting pipeline: ${err}`);
    }
  };

  const renderView = () => {
    switch (currentView) {
      case AppView.DASHBOARD:
        return <Dashboard />;
      case AppView.FILES:
        return (
          <FileExplorer 
            files={fileTree} 
            onScan={fetchFileTree} 
            currentPath={currentPath}
            isLoading={isLoading}
            error={error}
            onSelectionChange={handleSelectionChange}
            onStartProcessing={handleStartProcessing}
          />
        );
      case AppView.PIPELINE:
        return <PipelineView />;
      case AppView.INSPECTOR:
        return <Inspector />;
      case AppView.GRAPH:
        return <KnowledgeGraph />;
      case AppView.CHAT:
        return <ChatInterface />;
      case AppView.LOGS:
        return <LogViewer />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <div className="flex h-screen bg-slate-900 text-slate-200 font-sans overflow-hidden">
      <Sidebar currentView={currentView} onChangeView={setCurrentView} />
      <main className="flex-1 overflow-hidden relative bg-slate-900 flex flex-col">
        {isDemoMode && (
            <div className="bg-amber-900/20 border-b border-amber-700/30 text-amber-400/80 text-xs px-4 py-1 flex justify-between items-center backdrop-blur-sm">
                <span className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                    <b>Demo Mode Active</b> &mdash; Backend unreachable. Displaying mock project data.
                </span>
                <div className="flex gap-4">
                    <code className="bg-black/30 px-2 rounded text-slate-400">npm run server</code>
                    <button onClick={() => fetchFileTree(currentPath)} className="hover:text-white underline">Retry Connection</button>
                </div>
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