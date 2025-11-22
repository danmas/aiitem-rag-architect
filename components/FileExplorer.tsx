import React, { useState, useEffect } from 'react';
import { FileNode } from '../types';

interface FileExplorerProps {
  files: FileNode[];
  onScan: (path: string) => void;
  currentPath?: string;
  isLoading?: boolean;
  error?: string | null;
}

// Recursive component for the tree
const FileTreeNode: React.FC<{ node: FileNode; depth: number }> = ({ node, depth }) => {
  const [expanded, setExpanded] = useState(true);
  const [checked, setChecked] = useState(node.checked || false);

  const toggleExpand = () => setExpanded(!expanded);
  const toggleCheck = () => setChecked(!checked);

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
          checked={checked} 
          onChange={toggleCheck}
          className="mr-2 rounded border-slate-600 bg-slate-700 text-blue-500 focus:ring-offset-0 focus:ring-0"
        />
        
        <span className={`${node.type === 'folder' ? 'font-bold text-slate-300' : 'text-slate-400'}`}>
          {node.name}
        </span>
      </div>
      
      {expanded && node.children && (
        <div>
          {node.children.map((child) => (
            <FileTreeNode key={child.id} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
};

const FileExplorer: React.FC<FileExplorerProps> = ({ files, onScan, currentPath, isLoading, error }) => {
  const [mask, setMask] = useState('**/*.{py,js,ts,tsx,go,java}');
  const [ignore, setIgnore] = useState('**/tests/*, **/venv/*, **/node_modules/*');
  const [pathInput, setPathInput] = useState(currentPath || '');

  useEffect(() => {
    if (currentPath) {
        setPathInput(currentPath);
    }
  }, [currentPath]);

  const handleScanClick = () => {
    if (pathInput) {
        onScan(pathInput);
    }
  };

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
                        placeholder="/path/to/your/project"
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
                <p className="text-red-400 text-xs mt-2 flex items-center gap-1">
                    ⚠️ {error}
                </p>
            )}
            <p className="text-slate-500 text-xs mt-2">
                Note: Path is relative to the machine running the backend server.
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
                <FileTreeNode key={node.id} node={node} depth={1} />
            ))
          ) : (
            <div className="text-center text-slate-500 py-10">
                No files found. Check the path and click "Scan Folder".
            </div>
          )}
        </div>
      </div>
      
      <div className="p-6 border-t border-slate-700 bg-slate-800/50">
        <div className="flex justify-between items-center">
            <span className="text-sm text-slate-400">
                {files.length > 0 ? 'Ready to process files' : 'Waiting for valid source...'}
            </span>
            <button className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed" disabled={files.length === 0}>
                Save Configuration
            </button>
        </div>
      </div>
    </div>
  );
};

export default FileExplorer;