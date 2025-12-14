import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import FileExplorer from './components/FileExplorer';
import PipelineView from './components/PipelineView';
import KnowledgeGraph from './components/KnowledgeGraph';
import ChatInterface from './components/ChatInterface';
import Inspector from './components/Inspector';
import LogViewer from './components/LogViewer';
import ServerLogsDialog from './components/ServerLogsDialog';
import { AppView, FileNode, ProjectFile } from './types';
import { MOCK_FILE_TREE } from './constants';
import { getProjectTreeWithFallback, getKbConfigWithFallback, apiClient } from './services/apiClient';

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<AppView>(AppView.DASHBOARD);
  const [fileTree, setFileTree] = useState<FileNode[]>([]);
  const [currentPath, setCurrentPath] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isDemoMode, setIsDemoMode] = useState<boolean>(false);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [excludedFiles, setExcludedFiles] = useState<string[]>([]);
  const [isLogsDialogOpen, setIsLogsDialogOpen] = useState<boolean>(false);
  
  // v2.1.1: Переключатель между legacy и новым API
  const [useNewApi, setUseNewApi] = useState<boolean>(true);

  // Конвертация ProjectFile[] в FileNode[]
  const convertProjectFilesToFileNodes = (projectFiles: ProjectFile[]): FileNode[] => {
    return projectFiles.map((pf: ProjectFile): FileNode => ({
      id: pf.path,
      name: pf.name,
      type: pf.type === 'directory' ? 'folder' : 'file',
      children: pf.children ? convertProjectFilesToFileNodes(pf.children) : undefined,
      checked: pf.selected,
      error: pf.error || false,
      errorMessage: pf.errorMessage
    }));
  };

  const fetchFileTree = async (path?: string, includePatterns?: string, ignorePatterns?: string) => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Получаем rootPath из KB config (должен быть абсолютным путем на сервере)
      let rootPath: string;
      try {
        const kbConfig = await getKbConfigWithFallback();
        // rootPath из KB config должен быть абсолютным путем на сервере
        rootPath = kbConfig.data.rootPath || kbConfig.data.targetPath;
        if (!rootPath) {
          throw new Error('No rootPath in KB config');
        }
      } catch (err) {
        // Если не удалось получить rootPath из KB config, проверяем доступность бэкенда
        // Если бэкенд недоступен, сразу переходим в demo mode
        if (err instanceof Error && (err.message.includes('SERVER_UNAVAILABLE') || err.message.includes('NETWORK_ERROR'))) {
          throw new Error("BACKEND_UNREACHABLE");
        }
        console.warn('Failed to load KB config, will use fallback');
        // Если не удалось получить rootPath, используем переданный path или fallback на demo
        if (path) {
          rootPath = path;
        } else {
          // Если нет пути, переходим в demo mode
          throw new Error("BACKEND_UNREACHABLE");
        }
      }

      // Используем новый API /api/project/tree
      const result = await getProjectTreeWithFallback(rootPath, 12);
      
      // Если бэкенд недоступен (demo mode), используем mock data
      if (result.isDemo && result.data.length === 0) {
        throw new Error("BACKEND_UNREACHABLE");
      }
      
      // Конвертируем ProjectFile[] в FileNode[]
      const fileNodes = convertProjectFilesToFileNodes(result.data);
      
      if (fileNodes.length > 0) {
        setFileTree(fileNodes);
        if (fileNodes[0]?.id && !currentPath) {
          setCurrentPath(fileNodes[0].id);
        }
        setIsDemoMode(result.isDemo);
      } else {
        setFileTree([]);
        setIsDemoMode(result.isDemo);
      }
    } catch (err: any) {
      // Silent fallback to Demo Mode
      if (err.message === "BACKEND_UNREACHABLE" || err.name === 'TypeError' || 
          (err instanceof Error && err.message.includes('SERVER_UNAVAILABLE'))) {
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

  // Проверка доступности сервера и endpoints при старте
  useEffect(() => {
    const checkServerEndpoints = async () => {
      console.log('🔍 [Startup] Checking backend server availability...');
      
      try {
        // 1. Проверка health endpoint
        const health = await apiClient.healthCheck();
        console.log('✅ [Startup] Health check passed:', health);
        
        // 2. Проверка наличия необходимых endpoints
        const requiredEndpoints = [
          { path: '/api/kb-config', method: 'GET', name: 'KB Config' },
          { path: '/api/items-list', method: 'GET', name: 'Items List' }
        ];
        
        const endpointChecks = await Promise.allSettled(
          requiredEndpoints.map(async (endpoint) => {
            try {
              const response = await fetch(endpoint.path, { method: endpoint.method });
              // Endpoint считается доступным если:
              // - 200 OK - endpoint работает
              // - 400 Bad Request - endpoint существует, но не хватает параметров
              // - 404 Not Found - endpoint не существует (недоступен)
              const isAvailable = response.ok || response.status === 400;
              return { ...endpoint, available: isAvailable, status: response.status };
            } catch (err) {
              // Network errors означают, что сервер недоступен
              const isNetworkError = err instanceof TypeError && err.message.includes('fetch');
              return { 
                ...endpoint, 
                available: false, 
                status: isNetworkError ? 'NETWORK_ERROR' : 'UNKNOWN',
                error: err instanceof Error ? err.message : 'Unknown error' 
              };
            }
          })
        );
        
        // Логируем результаты проверки
        endpointChecks.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            const endpoint = result.value;
            if (endpoint.available) {
              console.log(`✅ [Startup] ${endpoint.name} (${endpoint.path}) - Available (status: ${endpoint.status})`);
            } else {
              console.warn(`⚠️ [Startup] ${endpoint.name} (${endpoint.path}) - Not available (status: ${endpoint.status}${endpoint.error ? `, error: ${endpoint.error}` : ''})`);
            }
          } else {
            console.error(`❌ [Startup] ${requiredEndpoints[index].name} (${requiredEndpoints[index].path}) - Check failed:`, result.reason);
          }
        });
        
        // 3. Проверка /api/project/tree отдельно (требует rootPath)
        try {
          // Пробуем получить rootPath из KB config для проверки
          const kbConfig = await getKbConfigWithFallback();
          const testRootPath = kbConfig.data.rootPath || kbConfig.data.targetPath || './';
          const testResponse = await fetch(`/api/project/tree?rootPath=${encodeURIComponent(testRootPath)}&depth=1`);
          const projectTreeAvailable = testResponse.ok || testResponse.status === 400; // 400 может быть из-за невалидного пути, но endpoint существует
          console.log(`${projectTreeAvailable ? '✅' : '⚠️'} [Startup] Project Tree (/api/project/tree) - ${projectTreeAvailable ? 'Available' : 'Not available'} (status: ${testResponse.status})`);
        } catch (err) {
          console.warn(`⚠️ [Startup] Project Tree (/api/project/tree) - Check failed:`, err instanceof Error ? err.message : err);
        }
        
        console.log('✅ [Startup] Backend server check completed');
      } catch (err) {
        console.error('❌ [Startup] Backend server health check failed:', err);
        console.warn('⚠️ [Startup] Application will run in demo mode');
      }
    };
    
    checkServerEndpoints();
  }, []);

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
        // Автоматически открываем диалог логов для отслеживания процесса
        setIsLogsDialogOpen(true);
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
          <div className="flex flex-col h-full">
            {/* v2.1.1 API Toggle */}
            <div className="bg-slate-800 px-6 py-3 border-b border-slate-700 flex justify-between items-center">
              <div className="flex items-center gap-4">
                <span className="text-sm font-medium text-slate-300">File Explorer Mode:</span>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useNewApi}
                    onChange={(e) => setUseNewApi(e.target.checked)}
                    className="rounded border-slate-600 bg-slate-700 text-blue-500 focus:ring-offset-0 focus:ring-0"
                  />
                  <span className="text-sm text-slate-400">
                    Use v2.1.1 API 
                    <span className="ml-1 text-xs text-blue-400">(Project Tree + File Selection)</span>
                  </span>
                </label>
              </div>
              <div className="text-xs text-slate-500">
                {useNewApi ? 'New standalone mode with automatic KB sync' : 'Legacy mode with external state management'}
              </div>
            </div>
            
            <div className="flex-1">
              {useNewApi ? (
                <FileExplorer 
                  standalone={true}
                />
              ) : (
                <FileExplorer 
                  files={fileTree} 
                  onScan={(path, include, ignore) => fetchFileTree(path, include, ignore)} 
                  currentPath={currentPath}
                  isLoading={isLoading}
                  error={error}
                  onSelectionChange={handleSelectionChange}
                  onStartProcessing={handleStartProcessing}
                />
              )}
            </div>
          </div>
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
      <Sidebar 
        currentView={currentView} 
        onChangeView={setCurrentView}
        onOpenLogsDialog={() => setIsLogsDialogOpen(true)}
      />
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
      <ServerLogsDialog 
        isOpen={isLogsDialogOpen}
        onClose={() => setIsLogsDialogOpen(false)}
      />
    </div>
  );
};

export default App;