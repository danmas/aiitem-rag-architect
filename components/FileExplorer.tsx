import React, { useState, useEffect } from 'react';
import { FileNode } from '../types';

interface FileExplorerProps {
  files: FileNode[];
  onScan: (path: string, includePatterns?: string, ignorePatterns?: string) => void;
  currentPath?: string;
  isLoading?: boolean;
  error?: string | null;
  onSelectionChange?: (selectedFiles: string[], excludedFiles: string[]) => void;
  onStartProcessing?: (config: {
    projectPath: string;
    filePatterns: string[];
    selectedFiles: string[];
    excludedFiles: string[];
  }) => void;
}

// Recursive component for the tree
const FileTreeNode: React.FC<{ 
  node: FileNode; 
  depth: number; 
  checkedFiles: Set<string>;
  onToggleCheck: (filePath: string, checked: boolean, isDirectory: boolean) => void;
}> = ({ node, depth, checkedFiles, onToggleCheck }) => {
  const [expanded, setExpanded] = useState(true);
  const isChecked = checkedFiles.has(node.id);

  const toggleExpand = () => setExpanded(!expanded);
  const toggleCheck = () => {
    onToggleCheck(node.id, !isChecked, node.type === 'folder');
  };

  return (
    <div className="select-none">
      <div 
        className={`flex items-center py-1 hover:bg-slate-800 cursor-pointer`}
        style={{ paddingLeft: `${depth * 20}px` }}
      >
        <button onClick={toggleExpand} className="mr-2 w-4 text-slate-400 flex justify-center">
          {node.type === 'folder' ? (expanded ? '▼' : '▶') : '•'}
        </button>
        
        <input 
          type="checkbox" 
          checked={isChecked} 
          onChange={toggleCheck}
          className="mr-2 rounded border-slate-600 bg-slate-700 text-blue-500 focus:ring-offset-0 focus:ring-0"
        />
        
        <span className={`${node.type === 'folder' ? 'font-bold text-slate-300' : 'text-slate-400'} ${node.error ? 'text-red-400 line-through' : ''}`}>
          {node.name} {node.error && `(${node.errorMessage || 'Access Denied'})`}
        </span>
      </div>
      
      {expanded && node.children && (
        <div>
          {node.children.map((child) => (
            <FileTreeNode 
              key={child.id} 
              node={child} 
              depth={depth + 1} 
              checkedFiles={checkedFiles}
              onToggleCheck={onToggleCheck}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const FileExplorer: React.FC<FileExplorerProps> = ({ 
  files, 
  onScan, 
  currentPath, 
  isLoading, 
  error, 
  onSelectionChange,
  onStartProcessing 
}) => {
  const [mask, setMask] = useState('**/*.{py,js,ts,tsx,go,java}');
  const [ignore, setIgnore] = useState('**/tests/*, **/venv/*, **/node_modules/*');
  const [pathInput, setPathInput] = useState('./');
  const [checkedFiles, setCheckedFiles] = useState<Set<string>>(new Set());
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [isConfigLoaded, setIsConfigLoaded] = useState(false);

  // Загрузка конфигурации KB с сервера
  const loadKbConfig = async () => {
    try {
      const response = await fetch('/api/kb-config');
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.config) {
          setPathInput(data.config.targetPath || './');
          setMask(data.config.includeMask || '**/*.{py,js,ts,tsx,go,java}');
          setIgnore(data.config.ignorePatterns || '**/tests/*, **/venv/*, **/node_modules/*');
          console.log('[KB Config] Loaded configuration from server');
        }
      } else {
        console.warn('[KB Config] Failed to load configuration, using defaults');
      }
    } catch (error) {
      console.error('[KB Config] Error loading configuration:', error);
    } finally {
      setIsConfigLoaded(true);
    }
  };

  // Сохранение конфигурации KB на сервер
  const saveKbConfig = async (targetPath: string, includeMask: string, ignorePatterns: string) => {
    try {
      setSaveStatus('saving');
      const response = await fetch('/api/kb-config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          targetPath,
          includeMask,
          ignorePatterns
        })
      });

      if (response.ok) {
        setSaveStatus('saved');
        console.log('[KB Config] Configuration saved successfully');
        // Убираем статус "saved" через 2 секунды
        setTimeout(() => setSaveStatus('idle'), 2000);
      } else {
        setSaveStatus('error');
        console.error('[KB Config] Failed to save configuration');
        setTimeout(() => setSaveStatus('idle'), 3000);
      }
    } catch (error) {
      setSaveStatus('error');
      console.error('[KB Config] Error saving configuration:', error);
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  };

  // Загружаем конфигурацию при инициализации компонента
  useEffect(() => {
    loadKbConfig();
  }, []);

  useEffect(() => {
    if (currentPath) {
        setPathInput(currentPath);
    } else {
        // Default to current directory if nothing selected
        setPathInput('./');
    }
  }, [currentPath]);

  // Инициализируем выбранные файлы при загрузке нового дерева
  useEffect(() => {
    if (files.length > 0) {
      const initialChecked = new Set<string>();
      const collectInitialChecked = (nodes: FileNode[]) => {
        nodes.forEach(node => {
          if (node.checked && node.type === 'file') {
            initialChecked.add(node.id);
          }
          if (node.children) {
            collectInitialChecked(node.children);
          }
        });
      };
      collectInitialChecked(files);
      setCheckedFiles(initialChecked);
    }
  }, [files]);

  const handleScanClick = () => {
    if (pathInput) {
        onScan(pathInput, mask, ignore);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
        handleScanClick();
    }
  };

  // Автосохранение конфигурации при изменении настроек (debounce 1 секунда)
  useEffect(() => {
    if (!isConfigLoaded) {
      return; // Не сохраняем до загрузки конфигурации
    }

    const timeoutId = setTimeout(() => {
      saveKbConfig(pathInput, mask, ignore);
    }, 1000); // 1 секунда debounce для сохранения

    return () => clearTimeout(timeoutId);
  }, [pathInput, mask, ignore, isConfigLoaded]);

  // Автоматическое обновление при изменении паттернов (debounce 500ms)
  useEffect(() => {
    // Не обновляем автоматически при первой загрузке или до загрузки конфигурации
    if (files.length === 0 || !pathInput || isLoading || !isConfigLoaded) {
      return;
    }

    const timeoutId = setTimeout(() => {
      if (pathInput && !isLoading) {
        onScan(pathInput, mask, ignore);
      }
    }, 500); // 500ms debounce для обновления

    return () => clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mask, ignore, pathInput, isConfigLoaded]); // Добавляем isConfigLoaded в зависимости

  const handleToggleCheck = (filePath: string, checked: boolean, isDirectory: boolean) => {
    const newCheckedFiles = new Set(checkedFiles);
    
    if (isDirectory) {
      // Если это папка, рекурсивно отмечаем/снимаем все файлы внутри
      const toggleDirectoryFiles = (nodes: FileNode[], check: boolean) => {
        nodes.forEach(node => {
          if (node.type === 'file') {
            if (check) {
              newCheckedFiles.add(node.id);
            } else {
              newCheckedFiles.delete(node.id);
            }
          } else if (node.children) {
            toggleDirectoryFiles(node.children, check);
          }
        });
      };
      
      // Найдем папку и обработаем её содержимое
      const findAndToggleDirectory = (nodes: FileNode[]) => {
        for (const node of nodes) {
          if (node.id === filePath && node.children) {
            toggleDirectoryFiles(node.children, checked);
            return true;
          } else if (node.children && findAndToggleDirectory(node.children)) {
            return true;
          }
        }
        return false;
      };
      
      findAndToggleDirectory(files);
    } else {
      // Если это файл
      if (checked) {
        newCheckedFiles.add(filePath);
      } else {
        newCheckedFiles.delete(filePath);
      }
    }
    
    setCheckedFiles(newCheckedFiles);
    
    // Уведомляем родительский компонент об изменениях
    if (onSelectionChange) {
      const selectedFiles = Array.from(newCheckedFiles);
      const excludedFiles: string[] = []; // Пока исключения не реализованы
      onSelectionChange(selectedFiles, excludedFiles);
    }
  };

  const handleStartProcessing = () => {
    if (onStartProcessing) {
      const selectedFiles = Array.from(checkedFiles);
      const filePatterns = mask.split(',').map(p => p.trim()).filter(p => p);
      
      onStartProcessing({
        projectPath: pathInput,
        filePatterns,
        selectedFiles,
        excludedFiles: []
      });
    }
  };

  const selectedCount = checkedFiles.size;
  const totalFiles = countFiles(files);

  // Подсчет общего количества файлов
  function countFiles(nodes: FileNode[]): number {
    return nodes.reduce((count, node) => {
      if (node.type === 'file') {
        return count + 1;
      } else if (node.children) {
        return count + countFiles(node.children);
      }
      return count;
    }, 0);
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-6 border-b border-slate-700">
        <h2 className="text-2xl font-semibold text-white mb-4">Knowledge Base Configuration</h2>
        
        {/* Folder Selection */}
        <div className="mb-6">
            <label className="block text-xs uppercase tracking-wider text-slate-500 mb-1">Target Project Folder</label>
            <div className="flex gap-2">
                <div className="flex-1 relative">
                    <input 
                        type="text" 
                        value={pathInput}
                        onChange={(e) => setPathInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="./"
                        disabled={isLoading}
                        className={`w-full bg-slate-800 border rounded p-2 text-sm text-white focus:border-blue-500 outline-none font-mono ${error ? 'border-red-500' : 'border-slate-600'}`}
                    />
                </div>
                <button 
                    onClick={handleScanClick}
                    disabled={isLoading}
                    className={`px-4 py-2 rounded font-medium transition-colors text-sm flex items-center gap-2 min-w-[100px] justify-center ${
                        isLoading ? 'bg-slate-600 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-500 text-white'
                    }`}
                >
                    {isLoading ? (
                        <>
                         <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                         Scanning
                        </>
                    ) : 'Scan Folder'}
                </button>
            </div>
            {error && (
                <p className="text-red-400 text-xs mt-2 flex items-center gap-1 font-mono bg-red-900/20 p-2 rounded">
                    ⚠️ {error}
                </p>
            )}
            <p className="text-slate-500 text-xs mt-2">
                Tip: Use <code>./</code> to scan the current server directory. If running in the cloud, local paths (like <code>C:/</code>) are not accessible.
            </p>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-xs uppercase tracking-wider text-slate-500 mb-1">Include Mask</label>
            <input 
              type="text" 
              value={mask}
              onChange={(e) => setMask(e.target.value)}
              className="w-full bg-slate-800 border border-slate-600 rounded p-2 text-sm text-white focus:border-blue-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wider text-slate-500 mb-1">Ignore Patterns</label>
            <input 
              type="text" 
              value={ignore}
              onChange={(e) => setIgnore(e.target.value)}
              className="w-full bg-slate-800 border border-slate-600 rounded p-2 text-sm text-white focus:border-blue-500 outline-none"
            />
          </div>
        </div>

        {/* Индикатор статуса сохранения */}
        {saveStatus !== 'idle' && (
          <div className={`text-xs mb-4 flex items-center gap-2 px-3 py-2 rounded ${
            saveStatus === 'saving' ? 'bg-blue-900/20 text-blue-400' :
            saveStatus === 'saved' ? 'bg-green-900/20 text-green-400' :
            'bg-red-900/20 text-red-400'
          }`}>
            {saveStatus === 'saving' && (
              <>
                <div className="w-3 h-3 border border-blue-400 border-t-transparent rounded-full animate-spin"></div>
                Сохранение настроек...
              </>
            )}
            {saveStatus === 'saved' && (
              <>
                <span>✓</span>
                Настройки сохранены
              </>
            )}
            {saveStatus === 'error' && (
              <>
                <span>⚠️</span>
                Ошибка сохранения настроек
              </>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className={`bg-slate-900 border rounded-lg p-4 min-h-[200px] ${error ? 'border-red-900/50 bg-red-900/10' : 'border-slate-700'}`}>
          {isLoading ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-3">
                  <div className="w-8 h-8 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin"></div>
                  <p>Analyzing directory structure...</p>
              </div>
          ) : files.length > 0 ? (
            files.map((node) => (
                <FileTreeNode 
                  key={node.id} 
                  node={node} 
                  depth={1} 
                  checkedFiles={checkedFiles}
                  onToggleCheck={handleToggleCheck}
                />
            ))
          ) : (
            <div className="text-center text-slate-500 py-10">
                No files found. Check path and click "Scan Folder".
            </div>
          )}
        </div>
      </div>
      
      <div className="p-6 border-t border-slate-700 bg-slate-800/50">
        <div className="flex justify-between items-center">
            <div className="text-sm text-slate-400">
                {files.length > 0 ? (
                  <span>
                    Selected: <span className="font-bold text-blue-400">{selectedCount}</span> of {totalFiles} files
                  </span>
                ) : 'Waiting for valid source...'}
            </div>
            <div className="flex gap-2">
              <button 
                className="bg-gray-600 hover:bg-gray-500 text-white px-4 py-2 rounded font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed" 
                disabled={files.length === 0}
                onClick={() => {
                  // Отметить/снять все файлы
                  const allFiles = new Set<string>();
                  const collectAllFiles = (nodes: FileNode[]) => {
                    nodes.forEach(node => {
                      if (node.type === 'file') {
                        allFiles.add(node.id);
                      } else if (node.children) {
                        collectAllFiles(node.children);
                      }
                    });
                  };
                  collectAllFiles(files);
                  
                  const isAllSelected = Array.from(allFiles).every(file => checkedFiles.has(file));
                  
                  if (isAllSelected) {
                    setCheckedFiles(new Set());
                    onSelectionChange?.([], []);
                  } else {
                    setCheckedFiles(allFiles);
                    onSelectionChange?.(Array.from(allFiles), []);
                  }
                }}
              >
                {selectedCount === totalFiles ? 'Deselect All' : 'Select All'}
              </button>
              {onStartProcessing && (
                <button 
                  className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2" 
                  disabled={selectedCount === 0}
                  onClick={handleStartProcessing}
                >
                  🚀 Start Processing
                </button>
              )}
            </div>
        </div>
      </div>
    </div>
  );
};

export default FileExplorer;