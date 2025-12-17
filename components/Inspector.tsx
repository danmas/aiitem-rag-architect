import React, { useState, useMemo, useEffect } from 'react';
import { AiItem, AiItemSummary, AiItemType } from '../types';
import { getItemsListWithFallback, apiClient } from '../services/apiClient';

interface InspectorProps {
  // Props are now optional since we fetch data internally
}

const Inspector: React.FC<InspectorProps> = () => {
  const [itemsList, setItemsList] = useState<AiItemSummary[]>([]);
  const [fullItemData, setFullItemData] = useState<AiItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingFullData, setLoadingFullData] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'L0' | 'L1' | 'L2'>('L1');

  // Загрузка списка метаданных
  useEffect(() => {
    const fetchItemsList = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        const result = await getItemsListWithFallback();
        setItemsList(result.data);
        setIsDemoMode(result.isDemo);
        // Set first item as selected by default and load its full data
        if (result.data.length > 0) {
          setSelectedId(result.data[0].id);
        }
      } catch (err) {
        console.error('Failed to fetch items list:', err);
        setError(err instanceof Error ? err.message : 'Failed to load items');
      } finally {
        setIsLoading(false);
      }
    };

    fetchItemsList();
  }, []);

  // Функция загрузки полных данных элемента
  const loadFullItemData = async (itemId: string) => {
    setLoadingFullData(true);
    try {
      const fullData = await apiClient.getItem(itemId);
      setFullItemData(fullData);
    } catch (err) {
      console.error('Failed to load full item data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load item details');
    } finally {
      setLoadingFullData(false);
    }
  };

  // Загрузка полных данных при выборе элемента
  useEffect(() => {
    if (selectedId) {
      loadFullItemData(selectedId);
    } else {
      setFullItemData(null);
    }
  }, [selectedId]);

  const filteredItems = itemsList.filter(item => 
    item.id.toLowerCase().includes(search.toLowerCase()) ||
    item.filePath.toLowerCase().includes(search.toLowerCase())
  );

  // Calculate Reverse Dependencies (Who uses me?)
  // Используем itemsList для поиска, но для отображения нужны только id
  const usedBy = useMemo(() => {
    if (!fullItemData) return [];
    return itemsList.filter(i => {
      // Проверяем, есть ли в l1_deps выбранного элемента
      return fullItemData.l1_deps.includes(i.id);
    });
  }, [fullItemData, itemsList]);

  const getBadgeColor = (type: string) => {
    switch (type) {
      case AiItemType.FUNCTION: return 'bg-blue-500/20 text-blue-400 border-blue-500/50';
      case AiItemType.CLASS: return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50';
      case AiItemType.INTERFACE: return 'bg-pink-500/20 text-pink-400 border-pink-500/50';
      case AiItemType.STRUCT: return 'bg-amber-500/20 text-amber-400 border-amber-500/50';
      default: return 'bg-slate-500/20 text-slate-400 border-slate-500/50';
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-full bg-slate-900 items-center justify-center">
        <div className="text-slate-400">Loading inspector data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full bg-slate-900 items-center justify-center">
        <div className="bg-red-900/20 border border-red-700/30 rounded-lg p-6">
          <h3 className="text-red-400 font-semibold mb-2">Error Loading Inspector</h3>
          <p className="text-red-300">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full bg-slate-900">
      {/* Left Sidebar: List */}
      <div className="w-80 border-r border-slate-700 flex flex-col bg-slate-800/50">
        <div className="p-4 border-b border-slate-700">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-white font-bold">Data Inspector</h2>
            {isDemoMode && (
              <span className="bg-amber-900/20 border border-amber-700/30 text-amber-400 text-xs px-2 py-1 rounded flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                Demo
              </span>
            )}
          </div>
          <input 
            type="text" 
            placeholder="Search ID or File..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-sm text-white focus:border-blue-500 outline-none"
          />
        </div>
        <div className="flex-1 overflow-y-auto">
          {filteredItems.map(item => (
            <div 
              key={item.id}
              onClick={() => setSelectedId(item.id)}
              className={`p-3 border-b border-slate-700/50 cursor-pointer hover:bg-slate-800 transition-colors ${
                selectedId === item.id ? 'bg-blue-900/20 border-l-4 border-l-blue-500' : 'border-l-4 border-l-transparent'
              }`}
            >
              <div className="flex justify-between items-start mb-1">
                <span className="text-slate-200 font-mono text-sm font-bold truncate w-48" title={item.id}>
                  {item.id}
                </span>
                <span className="text-[10px] uppercase text-slate-500">{item.language}</span>
              </div>
              <div className="flex items-center gap-2">
                 <span className={`text-[10px] px-1.5 py-0.5 rounded border ${getBadgeColor(item.type)}`}>
                   {item.type}
                 </span>
                 <span className="text-xs text-slate-500 truncate">{item.filePath}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right Content: Details */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {loadingFullData ? (
          <div className="flex-1 flex items-center justify-center text-slate-400">
            Loading item details...
          </div>
        ) : fullItemData ? (
          <>
            {/* Header */}
            <div className="p-3 border-b border-slate-700 bg-slate-800">
              <div className="flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h1 className="text-lg font-bold text-white font-mono">{fullItemData.id}</h1>
                    <span className={`text-xs px-1.5 py-0.5 rounded border font-bold uppercase tracking-wider ${getBadgeColor(fullItemData.type)}`}>
                      {fullItemData.type}
                    </span>
                  </div>
                  <div className="flex gap-3 text-xs text-slate-400">
                    <span className="flex items-center gap-1">📄 {fullItemData.filePath}</span>
                    <span className="flex items-center gap-1">🌐 {fullItemData.language}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-slate-700 bg-slate-800/50">
              {(['L0', 'L1', 'L2'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-3 py-1.5 text-xs font-bold transition-colors ${
                    activeTab === tab 
                      ? 'text-blue-400 border-b-2 border-blue-400 bg-blue-900/10' 
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  {tab === 'L0' ? 'L0: Source Code' : tab === 'L1' ? 'L1: Connectivity' : 'L2: Semantics'}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-y-auto p-2 bg-slate-900">
              
              {/* L0: Source Code */}
              {activeTab === 'L0' && (
                <div className="h-full flex flex-col">
                  <div className="flex justify-between items-center mb-1">
                    <h3 className="text-slate-300 font-semibold text-sm">Raw AST Source</h3>
                    <span className="text-xs text-slate-500">Parsed via Tree-sitter</span>
                  </div>
                  <div className="flex-1 bg-[#0d1117] p-2 rounded-lg border border-slate-700 overflow-auto font-mono text-xs">
                    <pre className="text-slate-300">
                      <code>{fullItemData.l0_code}</code>
                    </pre>
                  </div>
                </div>
              )}

              {/* L1: Connections */}
              {activeTab === 'L1' && (
                <div className="grid grid-cols-2 gap-2 h-full">
                  <div className="bg-slate-800/50 p-2 rounded-xl border border-slate-700">
                    <h3 className="text-purple-400 font-bold mb-2 flex items-center gap-1.5 text-sm">
                      Dependencies 
                      <span className="text-xs bg-slate-700 text-white px-1.5 py-0.5 rounded-full">{fullItemData.l1_deps.length}</span>
                    </h3>
                    <div className="space-y-1">
                      {fullItemData.l1_deps.length > 0 ? (
                        fullItemData.l1_deps.map(dep => (
                          <div key={dep} onClick={() => setSelectedId(dep)} className="p-1.5 bg-slate-800 rounded border border-slate-700 text-xs hover:border-blue-500 cursor-pointer flex justify-between group">
                            <span className="text-slate-300 font-mono">{dep}</span>
                            <span className="text-slate-500 group-hover:text-blue-400">→</span>
                          </div>
                        ))
                      ) : (
                        <p className="text-slate-500 italic text-xs">No outgoing dependencies.</p>
                      )}
                    </div>
                  </div>

                  <div className="bg-slate-800/50 p-2 rounded-xl border border-slate-700">
                    <h3 className="text-emerald-400 font-bold mb-2 flex items-center gap-1.5 text-sm">
                      Used By 
                      <span className="text-xs bg-slate-700 text-white px-1.5 py-0.5 rounded-full">{usedBy.length}</span>
                    </h3>
                    <div className="space-y-1">
                      {usedBy.length > 0 ? (
                        usedBy.map(u => (
                          <div key={u.id} onClick={() => setSelectedId(u.id)} className="p-1.5 bg-slate-800 rounded border border-slate-700 text-xs hover:border-blue-500 cursor-pointer flex justify-between group">
                             <span className="text-slate-300 font-mono">{u.id}</span>
                             <span className="text-slate-500 group-hover:text-blue-400">←</span>
                          </div>
                        ))
                      ) : (
                        <p className="text-slate-500 italic text-xs">Not referenced by other indexed items.</p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* L2: Semantics */}
              {activeTab === 'L2' && (
                <div className="max-w-3xl">
                  <div className="bg-gradient-to-br from-blue-900/20 to-purple-900/20 p-3 rounded-xl border border-slate-700 mb-3">
                    <h3 className="text-blue-300 font-bold mb-1 text-sm">Generated Description</h3>
                    <p className="text-sm text-slate-200 leading-relaxed">{fullItemData.l2_desc}</p>
                  </div>

                  <div className="bg-slate-800 p-3 rounded-xl border border-slate-700">
                    <h3 className="text-slate-400 text-xs uppercase tracking-widest font-bold mb-2">Vector Embeddings Preview</h3>
                    <div className="flex flex-wrap gap-0.5">
                      {Array.from({ length: 48 }).map((_, i) => (
                        <div 
                          key={i} 
                          className="w-2.5 h-2.5 rounded-sm"
                          style={{ 
                            backgroundColor: `rgba(59, 130, 246, ${Math.random() * 0.8 + 0.2})` 
                          }}
                        />
                      ))}
                    </div>
                    <p className="text-xs text-slate-500 mt-1.5 font-mono">Dimensions: 1536 (Ada-002 Compatible)</p>
                  </div>
                </div>
              )}

            </div>
          </>
        ) : selectedId ? (
          <div className="flex-1 flex items-center justify-center text-slate-500">
            Loading item details...
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-slate-500">
            Select an item to inspect details
          </div>
        )}
      </div>
    </div>
  );
};

export default Inspector;