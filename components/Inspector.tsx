import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Cpu } from 'lucide-react';
import { AiItem, AiItemSummary, AiItemType } from '../types';
import { getItemsListWithFallback, apiClient } from '../services/apiClient';
import { useGraphFilter } from '../lib/context/GraphFilterContext';
import { useDataCache } from '../lib/context/DataCacheContext';
import LogicArchitectDialog from './LogicArchitectDialog';

interface InspectorProps {
  // Props are now optional since we fetch data internally
}

const Inspector: React.FC<InspectorProps> = () => {
  const { setFilteredItemIds } = useGraphFilter();
  const { getItemsList, setItemsList: setCachedItemsList, currentContextCode } = useDataCache();
  const [itemsList, setItemsList] = useState<AiItemSummary[]>([]);
  const [fullItemData, setFullItemData] = useState<AiItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingFullData, setLoadingFullData] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'L0' | 'L1' | 'L2'>('L1');
  const [dataSource, setDataSource] = useState<'cache' | 'server' | null>(null);
  const [showLogicDialog, setShowLogicDialog] = useState<boolean>(false);
  
  // Храним предыдущий набор ID для сравнения
  const prevFilteredIdsRef = useRef<Set<string>>(new Set());

  // Загрузка списка метаданных: сначала из кэша, затем с сервера
  useEffect(() => {
    const loadItemsList = async () => {
      console.log(`[Inspector] loadItemsList запущен для контекста: ${currentContextCode}`);
      
      // Проверяем кэш
      const cached = getItemsList();
      if (cached) {
        console.log(`[Inspector] Данные загружены из кэша:`, {
          count: cached.data.length,
          isDemo: cached.isDemo,
          cacheAge: `${((Date.now() - cached.timestamp) / 1000).toFixed(1)}s`
        });
        setItemsList(cached.data);
        setIsDemoMode(cached.isDemo);
        setDataSource('cache');
        setIsLoading(false);
        // Set first item as selected by default
        if (cached.data.length > 0 && !selectedId) {
          setSelectedId(cached.data[0].id);
        }
        return;
      }
      
      // Если кэш пуст - загружаем с сервера
      console.log(`[Inspector] Кэш пуст, загружаем с сервера...`);
      setIsLoading(true);
      setError(null);
      
      try {
        const result = await getItemsListWithFallback();
        console.log(`[Inspector] Данные получены с сервера:`, {
          count: result.data.length,
          isDemo: result.isDemo
        });
        
        // Сохраняем в кэш
        setCachedItemsList(result.data, result.isDemo);
        
        setItemsList(result.data);
        setIsDemoMode(result.isDemo);
        setDataSource('server');
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

    loadItemsList();
  }, [currentContextCode, getItemsList, setCachedItemsList]);

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

  // Мемоизируем filteredItems чтобы избежать пересоздания на каждый рендер
  // Поддержка regex: если поиск обёрнут в /.../ — используется регулярное выражение
  const filteredItems = useMemo(() => {
    const trimmedSearch = search.trim();
    
    // Проверяем, является ли это regex-паттерном: /pattern/ или /pattern/flags
    const regexMatch = trimmedSearch.match(/^\/(.+)\/([gimsuy]*)$/);
    
    if (regexMatch) {
      try {
        const regex = new RegExp(regexMatch[1], regexMatch[2] || 'i');
        return itemsList.filter(item =>
          regex.test(item.id) || regex.test(item.filePath)
        );
      } catch {
        // Невалидный regex — возвращаем пустой список
        return [];
      }
    }
    
    // Обычный поиск через includes
    const searchLower = trimmedSearch.toLowerCase();
    return itemsList.filter(item =>
      item.id.toLowerCase().includes(searchLower) ||
      item.filePath.toLowerCase().includes(searchLower)
    );
  }, [itemsList, search]);

  // Публикация отфильтрованных ID в контекст для синхронизации с графом
  // Обновляем только при реальном изменении списка ID
  useEffect(() => {
    const newIds = filteredItems.map((item: AiItemSummary) => item.id);
    const newIdsSet = new Set<string>(newIds);
    const prevIds = prevFilteredIdsRef.current;
    
    // Быстрая проверка: если размеры разные — точно изменилось
    if (prevIds.size !== newIds.length) {
      prevFilteredIdsRef.current = newIdsSet;
      setFilteredItemIds(newIdsSet);
      return;
    }
    
    // Проверяем содержимое
    let hasChanges = false;
    for (const id of newIds) {
      if (!prevIds.has(id)) {
        hasChanges = true;
        break;
      }
    }
    
    // Если изменений нет, не обновляем контекст
    if (!hasChanges) {
      return;
    }
    
    prevFilteredIdsRef.current = newIdsSet;
    setFilteredItemIds(newIdsSet);
  }, [filteredItems, setFilteredItemIds]);

  // Calculate Reverse Dependencies (Who uses me?)
  // Используем itemsList для поиска, но для отображения нужны только id
  const usedBy = useMemo(() => {
    if (!fullItemData) return [];
    return itemsList.filter(i => {
      // Проверяем, есть ли в l1_deps выбранного элемента
      return fullItemData.l1_deps.includes(i.id);
    });
  }, [fullItemData, itemsList]);

  // Форматирование L0 кода: если это JSON - красиво форматируем, иначе оставляем как есть
  // Поддерживаем двойное экранирование (JSON-строка внутри JSON-строки)
  // Обрабатываем escape-последовательности (\r\n, \n, \r) в строках
  const formattedL0Code = useMemo<{ code: string; isJson: boolean }>(() => {
    if (!fullItemData?.l0_code) return { code: '', isJson: false };
    const code = fullItemData.l0_code.trim();
    
    // Пытаемся распарсить как JSON
    try {
      let parsed = JSON.parse(code);
      // Если результат - строка, которая сама является JSON, парсим ещё раз
      if (typeof parsed === 'string' && (parsed.trim().startsWith('{') || parsed.trim().startsWith('['))) {
        try {
          parsed = JSON.parse(parsed);
        } catch {
          // Если второй парсинг не удался, используем результат первого
        }
      }
      
      // Рекурсивно обрабатываем escape-последовательности в строках
      const processEscapeSequences = (obj: any): any => {
        if (typeof obj === 'string') {
          // Заменяем литералы \r\n, \n, \r на реальные переносы строк
          return obj
            .replace(/\\r\\n/g, '\n')
            .replace(/\\n/g, '\n')
            .replace(/\\r/g, '\n');
        } else if (Array.isArray(obj)) {
          return obj.map(processEscapeSequences);
        } else if (obj && typeof obj === 'object') {
          const processed: any = {};
          for (const key in obj) {
            processed[key] = processEscapeSequences(obj[key]);
          }
          return processed;
        }
        return obj;
      };
      
      const processed = processEscapeSequences(parsed);
      
      // Кастомное форматирование JSON с сохранением переносов строк в строках
      const formatJsonWithLineBreaks = (obj: any, indent = 0): string => {
        const indentStr = '  '.repeat(indent);
        const nextIndent = '  '.repeat(indent + 1);
        
        if (obj === null) return 'null';
        if (obj === undefined) return 'undefined';
        if (typeof obj === 'string') {
          // Для строк сохраняем переносы строк как есть, экранируем только кавычки и обратные слеши
          const escaped = obj
            .replace(/\\/g, '\\\\')
            .replace(/"/g, '\\"');
          return `"${escaped}"`;
        }
        if (typeof obj === 'number' || typeof obj === 'boolean') {
          return String(obj);
        }
        if (Array.isArray(obj)) {
          if (obj.length === 0) return '[]';
          const items = obj.map(item => 
            `${nextIndent}${formatJsonWithLineBreaks(item, indent + 1)}`
          ).join(',\n');
          return `[\n${items}\n${indentStr}]`;
        }
        if (typeof obj === 'object') {
          const keys = Object.keys(obj);
          if (keys.length === 0) return '{}';
          const pairs = keys.map(key => {
            const value = formatJsonWithLineBreaks(obj[key], indent + 1);
            return `${nextIndent}"${key}": ${value}`;
          }).join(',\n');
          return `{\n${pairs}\n${indentStr}}`;
        }
        return String(obj);
      };
      
      return { code: formatJsonWithLineBreaks(processed), isJson: true };
    } catch {
      // Если не JSON - возвращаем как есть, но тоже обрабатываем escape-последовательности
      const processed = code
        .replace(/\\r\\n/g, '\n')
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\n');
      return { code: processed, isJson: false };
    }
  }, [fullItemData?.l0_code]);

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
            <div className="flex items-center gap-2">
              {isDemoMode && (
                <span className="bg-amber-900/20 border border-amber-700/30 text-amber-400 text-xs px-2 py-1 rounded flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                  Demo
                </span>
              )}
              {dataSource === 'cache' && !isDemoMode && (
                <span className="bg-green-900/20 border border-green-700/30 text-green-400 text-xs px-2 py-1 rounded flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                  Cached
                </span>
              )}
            </div>
          </div>
          <input 
            type="text" 
            placeholder="Search ID or File... (/regex/)" 
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
                  <div className="flex-1 bg-[#0d1117] rounded-lg border border-slate-700 overflow-auto">
                    <SyntaxHighlighter
                      language={formattedL0Code.isJson ? 'json' : 'text'}
                      style={vscDarkPlus}
                      customStyle={{
                        margin: 0,
                        padding: '0.5rem',
                        fontSize: '0.75rem',
                        backgroundColor: '#0d1117',
                        fontFamily: 'monospace'
                      }}
                      showLineNumbers={false}
                      wrapLines={true}
                      wrapLongLines={true}
                    >
                      {formattedL0Code.code}
                    </SyntaxHighlighter>
                  </div>
                </div>
              )}

              {/* L1: Connections */}
              {activeTab === 'L1' && (
                <div className="grid grid-cols-2 gap-2 h-full">
                  <div className="bg-slate-800/50 p-2 rounded-xl border border-slate-700 flex flex-col overflow-hidden">
                    <h3 className="text-purple-400 font-bold mb-2 flex items-center gap-1.5 text-sm shrink-0">
                      Dependencies 
                      <span className="text-xs bg-slate-700 text-white px-1.5 py-0.5 rounded-full">{fullItemData.l1_deps.length}</span>
                    </h3>
                    <div className="space-y-1 overflow-y-auto flex-1 min-h-0">
                      {fullItemData.l1_deps.length > 0 ? (
                        fullItemData.l1_deps.map((dep, idx) => {
                          // Проверяем, является ли dep JSON-строкой
                          let formattedDep: string = dep;
                          let isJson = false;
                          try {
                            const parsed = JSON.parse(dep);
                            if (typeof parsed === 'object' && parsed !== null) {
                              formattedDep = JSON.stringify(parsed, null, 2);
                              isJson = true;
                            }
                          } catch {
                            // Не JSON, оставляем как есть
                          }
                          
                          return (
                            <div key={`${dep}-${idx}`} className="p-1.5 bg-slate-800 rounded border border-slate-700 text-xs hover:border-blue-500 cursor-pointer group">
                              {isJson ? (
                                <div className="flex flex-col gap-1">
                                  <div className="flex justify-between items-start">
                                    <span className="text-slate-400 text-[10px] uppercase">JSON Dependency</span>
                                    <span className="text-slate-500 group-hover:text-blue-400 shrink-0">→</span>
                                  </div>
                                  <pre className="text-slate-300 font-mono text-[10px] overflow-x-auto whitespace-pre-wrap break-all">
                                    <code>{formattedDep}</code>
                                  </pre>
                                </div>
                              ) : (
                                <div className="flex justify-between items-center">
                                  <span className="text-slate-300 font-mono break-all pr-1">{dep}</span>
                                  <span className="text-slate-500 group-hover:text-blue-400 shrink-0">→</span>
                                </div>
                              )}
                            </div>
                          );
                        })
                      ) : (
                        <p className="text-slate-500 italic text-xs">No outgoing dependencies.</p>
                      )}
                    </div>
                  </div>

                  <div className="bg-slate-800/50 p-2 rounded-xl border border-slate-700 flex flex-col overflow-hidden">
                    <h3 className="text-emerald-400 font-bold mb-2 flex items-center gap-1.5 text-sm shrink-0">
                      Used By 
                      <span className="text-xs bg-slate-700 text-white px-1.5 py-0.5 rounded-full">{usedBy.length}</span>
                    </h3>
                    <div className="space-y-1 overflow-y-auto flex-1 min-h-0">
                      {usedBy.length > 0 ? (
                        usedBy.map(u => (
                          <div key={u.id} onClick={() => setSelectedId(u.id)} className="p-1.5 bg-slate-800 rounded border border-slate-700 text-xs hover:border-blue-500 cursor-pointer flex justify-between group">
                             <span className="text-slate-300 font-mono break-all pr-1">{u.id}</span>
                             <span className="text-slate-500 group-hover:text-blue-400 shrink-0">←</span>
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
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-blue-300 font-bold text-sm">Semantic Analysis</h3>
                    <button
                      onClick={() => setShowLogicDialog(true)}
                      className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-semibold transition-all shadow-lg shadow-indigo-600/20 active:scale-[0.98]"
                    >
                      <Cpu className="w-4 h-4" />
                      Logic Architect
                    </button>
                  </div>

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

      {/* Logic Architect Dialog */}
      <LogicArchitectDialog
        isOpen={showLogicDialog}
        onClose={() => setShowLogicDialog(false)}
        item={fullItemData}
      />
    </div>
  );
};

export default Inspector;