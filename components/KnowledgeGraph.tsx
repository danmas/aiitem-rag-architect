import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as d3 from 'd3';
import { AiItemType } from '../types';
import { getGraphWithFallback, GraphData } from '../services/apiClient';
import { useGraphFilter } from '../lib/context/GraphFilterContext';
import { useDataCache } from '../lib/context/DataCacheContext';

interface KnowledgeGraphProps {
  // Props are now optional since we fetch data internally
}

// Функция для форматирования времени с начала загрузки страницы
let pageLoadTime = performance.now();
const getTimeStamp = () => {
  const now = performance.now();
  const elapsed = now - pageLoadTime;
  const seconds = Math.floor(elapsed / 1000);
  const ms = (elapsed % 1000).toFixed(1);
  return `${seconds}.${ms.padStart(4, '0')}s`;
};

// Функция для форматирования абсолютного времени (реальное время)
const getAbsoluteTime = () => {
  const now = new Date();
  const hours = now.getHours().toString().padStart(2, '0');
  const minutes = now.getMinutes().toString().padStart(2, '0');
  const seconds = now.getSeconds().toString().padStart(2, '0');
  const ms = now.getMilliseconds().toString().padStart(3, '0');
  return `${hours}:${minutes}:${seconds}.${ms}`;
};

const KnowledgeGraph: React.FC<KnowledgeGraphProps> = () => {
  const { filteredItemIds } = useGraphFilter();
  const { getGraph, setGraph, currentContextCode } = useDataCache();
  const svgRef = useRef<SVGSVGElement>(null);
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [dataSource, setDataSource] = useState<'cache' | 'server' | null>(null);
  const [search, setSearch] = useState('');
  const [focusedNodeIds, setFocusedNodeIds] = useState<Set<string>>(new Set());
  const [clickHistory, setClickHistory] = useState<string[]>([]);

  // Функция добавления узла в историю кликов (макс 5)
  const addToClickHistory = (nodeId: string) => {
    setClickHistory(prev => {
      const filtered = prev.filter(id => id !== nodeId);
      return [nodeId, ...filtered].slice(0, 5);
    });
  };

  // Трассировка изменений filteredItemIds
  useEffect(() => {
    console.log(`[KnowledgeGraph] [${getTimeStamp()}] [${getAbsoluteTime()}] filteredItemIds изменился:`, {
      size: filteredItemIds.size,
      ids: Array.from(filteredItemIds).slice(0, 5)
    });
  }, [filteredItemIds]);

  // Загрузка данных: сначала из кэша, затем с сервера если нужно
  useEffect(() => {
    const loadGraphData = async () => {
      const loadStart = performance.now();
      console.log(`[KnowledgeGraph] [${getTimeStamp()}] [${getAbsoluteTime()}] loadGraphData запущен для контекста: ${currentContextCode}`);
      
      // Проверяем кэш
      const cached = getGraph();
      if (cached) {
        const cacheLoadTime = performance.now() - loadStart;
        console.log(`[KnowledgeGraph] [${getTimeStamp()}] [${getAbsoluteTime()}] Данные загружены из кэша за ${cacheLoadTime.toFixed(1)}ms:`, {
          nodes: cached.data.nodes.length,
          links: cached.data.links.length,
          isDemo: cached.isDemo,
          cacheAge: `${((Date.now() - cached.timestamp) / 1000).toFixed(1)}s`
        });
        setGraphData(cached.data);
        setIsDemoMode(cached.isDemo);
        setDataSource('cache');
        setIsLoading(false);
        return;
      }
      
      // Если кэш пуст - загружаем с сервера
      console.log(`[KnowledgeGraph] [${getTimeStamp()}] [${getAbsoluteTime()}] Кэш пуст, загружаем с сервера...`);
      setIsLoading(true);
      setError(null);
      
      try {
        const result = await getGraphWithFallback();
        const fetchEnd = performance.now();
        console.log(`[KnowledgeGraph] [${getTimeStamp()}] [${getAbsoluteTime()}] Данные получены с сервера за ${(fetchEnd - loadStart).toFixed(1)}ms:`, {
          nodes: result.data.nodes.length,
          links: result.data.links.length,
          isDemo: result.isDemo
        });
        
        // Сохраняем в кэш
        setGraph(result.data, result.isDemo);
        
        setGraphData(result.data);
        setIsDemoMode(result.isDemo);
        setDataSource('server');
      } catch (err) {
        console.error(`[KnowledgeGraph] [${getTimeStamp()}] [${getAbsoluteTime()}] Failed to fetch graph data:`, err);
        setError(err instanceof Error ? err.message : 'Failed to load graph data');
      } finally {
        setIsLoading(false);
      }
    };

    loadGraphData();
  }, [currentContextCode, getGraph, setGraph]);

  // Трассировка изменений graphData
  useEffect(() => {
    if (graphData) {
      console.log(`[KnowledgeGraph] [${getTimeStamp()}] [${getAbsoluteTime()}] graphData изменился:`, {
        nodes: graphData.nodes.length,
        links: graphData.links.length
      });
    }
  }, [graphData]);

  // Фильтрация графа на основе filteredItemIds из контекста
  const filteredGraphData = useMemo(() => {
    const memoStart = performance.now();
    console.log(`[KnowledgeGraph] [${getTimeStamp()}] [${getAbsoluteTime()}] useMemo вызван`, {
      graphDataNodes: graphData?.nodes.length,
      filteredItemIdsSize: filteredItemIds.size
    });
    
    if (!graphData || graphData.nodes.length === 0) {
      const memoEnd = performance.now();
      console.log(`[KnowledgeGraph] [${getTimeStamp()}] [${getAbsoluteTime()}] useMemo filteredGraphData: ${(memoEnd - memoStart).toFixed(1)}ms (ранний выход)`);
      return null;
    }
    
    // Если фильтр пуст, показываем весь граф (обратная совместимость)
    if (filteredItemIds.size === 0) {
      const memoEnd = performance.now();
      console.log(`[KnowledgeGraph] [${getTimeStamp()}] [${getAbsoluteTime()}] useMemo filteredGraphData: ${(memoEnd - memoStart).toFixed(1)}ms (без фильтра)`);
      return graphData;
    }

    // Фильтруем узлы - только те, чьи ID есть в filteredItemIds
    const filteredNodes = graphData.nodes.filter(node => 
      filteredItemIds.has(node.id)
    );

    // Создаем Set для быстрого поиска отфильтрованных узлов
    const filteredNodeIds = new Set(filteredNodes.map(n => n.id));

    // Фильтруем связи - только те, где и source и target есть в отфильтрованных узлах
    const filteredLinks = graphData.links.filter(link => 
      filteredNodeIds.has(link.source) && filteredNodeIds.has(link.target)
    );

    const result = {
      nodes: filteredNodes,
      links: filteredLinks
    };
    
    const memoEnd = performance.now();
    console.log(`[KnowledgeGraph] [${getTimeStamp()}] [${getAbsoluteTime()}] useMemo filteredGraphData: ${(memoEnd - memoStart).toFixed(1)}ms`);
    console.log(`[KnowledgeGraph] [${getTimeStamp()}] [${getAbsoluteTime()}] useMemo результат:`, {
      nodes: result.nodes.length,
      links: result.links.length
    });
    
    return result;
  }, [graphData, filteredItemIds]);

  // Дополнительная фильтрация по поисковому запросу
  const finalFilteredGraphData = useMemo(() => {
    if (!filteredGraphData || !search.trim()) {
      return filteredGraphData;
    }
    
    const searchLower = search.toLowerCase();
    const filteredNodes = filteredGraphData.nodes.filter(node => 
      node.id.toLowerCase().includes(searchLower)
    );
    
    const filteredNodeIds = new Set(filteredNodes.map(n => n.id));
    const filteredLinks = filteredGraphData.links.filter(link => 
      filteredNodeIds.has(link.source) && filteredNodeIds.has(link.target)
    );
    
    return {
      nodes: filteredNodes,
      links: filteredLinks
    };
  }, [filteredGraphData, search]);

  // Фильтрация при фокусе на узлах (двойной клик / Ctrl+клик)
  const focusFilteredGraphData = useMemo(() => {
    if (!finalFilteredGraphData || focusedNodeIds.size === 0) {
      return finalFilteredGraphData;
    }
    
    // Находим все связи, где любой из focusedNodeIds является source или target
    const relatedLinks = finalFilteredGraphData.links.filter(link => 
      focusedNodeIds.has(link.source) || focusedNodeIds.has(link.target)
    );
    
    // Собираем ID всех связанных узлов
    const relatedNodeIds = new Set<string>(focusedNodeIds);
    relatedLinks.forEach(link => {
      relatedNodeIds.add(link.source);
      relatedNodeIds.add(link.target);
    });
    
    // Фильтруем узлы
    const filteredNodes = finalFilteredGraphData.nodes.filter(node => 
      relatedNodeIds.has(node.id)
    );
    
    return {
      nodes: filteredNodes,
      links: relatedLinks
    };
  }, [finalFilteredGraphData, focusedNodeIds]);

  useEffect(() => {
    const renderStart = performance.now();
    console.log(`[KnowledgeGraph] [${getTimeStamp()}] [${getAbsoluteTime()}] useEffect отрисовки ЗАПУЩЕН`, {
      nodes: focusFilteredGraphData?.nodes.length,
      links: focusFilteredGraphData?.links.length
    });
    
    if (!svgRef.current || !focusFilteredGraphData || focusFilteredGraphData.nodes.length === 0) {
      console.log(`[KnowledgeGraph] [${getTimeStamp()}] [${getAbsoluteTime()}] useEffect: ранний выход`);
      return;
    }

    const width = svgRef.current.clientWidth;
    const height = svgRef.current.clientHeight;

    // Clear previous render
    d3.select(svgRef.current).selectAll("*").remove();

    const svg = d3.select(svgRef.current)
      .attr("viewBox", [0, 0, width, height]);

    // Use the filtered graph data
    const nodes = focusFilteredGraphData.nodes.map(d => ({ ...d }));
    const links = focusFilteredGraphData.links.map(d => ({ ...d }));

    // Add invisible background rect for panning (catches mouse events on empty space)
    // Must be first so it's under everything but still receives events on empty space
    const bgRect = svg.append("rect")
      .attr("width", width)
      .attr("height", height)
      .attr("fill", "transparent")
      .style("cursor", "move")
      .style("pointer-events", "all");

    // Двойной клик по пустому месту сбрасывает фокус
    bgRect.on("dblclick", () => {
      setFocusedNodeIds(new Set());
    });

    // Create container group for zoom/pan transforms
    const container = svg.append("g");

    // Define Arrowhead (outside container so it doesn't scale)
    svg.append("defs").append("marker")
        .attr("id", "arrowhead")
        .attr("viewBox", "0 -5 10 10")
        .attr("refX", 25)
        .attr("refY", 0)
        .attr("markerWidth", 6)
        .attr("markerHeight", 6)
        .attr("orient", "auto")
        .append("path")
        .attr("d", "M0,-5L10,0L0,5")
        .attr("fill", "#475569");

    const simulationStart = performance.now();
    console.log(`[KnowledgeGraph] [${getTimeStamp()}] [${getAbsoluteTime()}] Создание simulation`);
    
    const simulation = d3.forceSimulation(nodes as any)
      .force("link", d3.forceLink(links).id((d: any) => d.id).distance(150))
      .force("charge", d3.forceManyBody()
        .strength(-400)
        .theta(0.9)           // Barnes-Hut: O(n²) → O(n log n)
        .distanceMax(300))    // игнорировать узлы дальше 300px
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collide", d3.forceCollide(40))
      .alphaDecay(0.05)       // быстрее затухание (default 0.0228)
      .alphaMin(0.001);       // раньше остановка
    
    const simulationCreated = performance.now();
    console.log(`[KnowledgeGraph] [${getTimeStamp()}] [${getAbsoluteTime()}] simulation создан за ${(simulationCreated - simulationStart).toFixed(1)}ms`);

    // Draw lines inside container
    const link = container.append("g")
      .attr("stroke", "#475569")
      .attr("stroke-opacity", 0.6)
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("stroke-width", 1.5)
      .attr("marker-end", "url(#arrowhead)");

    // Draw link labels (if label exists)
    const linkLabels = container.append("g")
      .selectAll("text")
      .data(links.filter((d: any) => d.label))
      .join("text")
      .attr("fill", "#94a3b8")
      .attr("font-size", "11px")
      .attr("text-anchor", "middle")
      .attr("pointer-events", "none")
      .style("pointer-events", "none")
      .text((d: any) => d.label);

    // Draw Nodes inside container
    const node = container.append("g")
      .selectAll("g")
      .data(nodes)
      .join("g")
      .call(d3.drag<any, any>()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended)
      )
      .on("dblclick", (event: any, d: any) => {
        event.stopPropagation();
        addToClickHistory(d.id);
        // Если кликнули по уже выбранному узлу - убираем его из фокуса
        if (focusedNodeIds.has(d.id)) {
          const newSet = new Set(focusedNodeIds);
          newSet.delete(d.id);
          setFocusedNodeIds(newSet);
        } else {
          // Двойной клик без Ctrl — заменяем фокус на один узел
          setFocusedNodeIds(new Set([d.id]));
        }
      })
      .on("click", (event: any, d: any) => {
        addToClickHistory(d.id);
        // Ctrl+клик — добавляем узел к существующему фокусу
        if (event.ctrlKey || event.metaKey) {
          event.stopPropagation();
          const newSet = new Set(focusedNodeIds);
          if (newSet.has(d.id)) {
            newSet.delete(d.id);
          } else {
            newSet.add(d.id);
          }
          setFocusedNodeIds(newSet);
        }
      });

    // Node Circles
    // 5 уровней жёлтого: от яркого (последний клик) до бледного
    const yellowShades = ['#fbbf24', '#fcd34d', '#fde68a', '#fef08a', '#fef3c7'];
    
    node.append("circle")
      .attr("r", 20)
      .attr("fill", (d: any) => {
        // Проверяем историю кликов
        const historyIndex = clickHistory.indexOf(d.id);
        if (historyIndex !== -1) {
          return yellowShades[historyIndex];
        }
        // Оригинальная логика по типу
        switch(d.type) {
            case AiItemType.FUNCTION: return "#3b82f6"; // blue
            case AiItemType.CLASS: return "#10b981"; // emerald
            case AiItemType.METHOD: return "#a855f7"; // purple
            case AiItemType.STRUCT: return "#f59e0b"; // amber (go)
            case AiItemType.INTERFACE: return "#ec4899"; // pink
            default: return "#64748b";
        }
      })
      .attr("stroke", "#1e293b")
      .attr("stroke-width", 2);

    // Labels
    node.append("text")
      .text(d => d.id.split('.').pop() || d.id)
      .attr("x", 25)
      .attr("y", 5)
      .attr("fill", "#cbd5e1")
      .attr("font-size", "12px")
      .style("pointer-events", "none")
      .style("text-shadow", "2px 2px 4px #000");

    // Tooltip area (simple title for native tooltip)
    node.append("title").text(d => `ID: ${d.id}\nType: ${d.type}\nLang: ${d.language}\nDesc: ${d.l2_desc}`);

    // Setup zoom and pan
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .filter((event: any) => {
        // For wheel: allow zoom without CTRL/CMD
        if (event.type === 'wheel') {
          return true;
        }
        // For mousedown: allow pan with left button only if clicking on background rect
        if (event.type === 'mousedown') {
          // Allow pan only if clicking on the background rect (not on nodes or links)
          return event.button === 0 && event.target === bgRect.node();
        }
        return true;
      })
      .on("zoom", (event) => {
        container.attr("transform", event.transform.toString());
      });

    svg.call(zoom);

    // Handle wheel events for zoom (без CTRL, чувствительность увеличена в 1.5 раза)
    svg.on("wheel.zoom", function(event: WheelEvent) {
      event.preventDefault();
      const point = d3.pointer(event, svgRef.current);
      // Чувствительность увеличена в 1.5 раза: 0.1 * 1.5 = 0.15
      const sensitivity = 0.15;
      const scale = event.deltaY > 0 ? (1 - sensitivity) : (1 + sensitivity);
      svg.transition()
        .duration(50)
        .call(zoom.scaleBy as any, scale, point);
    } as any);

    // Предварительный расчет позиций без DOM операций (прогрев)
    const warmupStart = performance.now();
    console.log(`[KnowledgeGraph] [${getTimeStamp()}] [${getAbsoluteTime()}] Прогрев simulation (50 тиков)`);
    simulation.tick(50);
    const warmupEnd = performance.now();
    console.log(`[KnowledgeGraph] [${getTimeStamp()}] [${getAbsoluteTime()}] Прогрев завершён за ${(warmupEnd - warmupStart).toFixed(1)}ms`);

    // Счётчики для логирования tick callback
    let tickCount = 0;
    let firstTickTime = performance.now();
    let lastTickTime = firstTickTime;
    let stabilizationLogged = false;

    simulation.on("tick", () => {
      tickCount++;
      const tickStart = performance.now();
      const alpha = simulation.alpha();
      const timeSinceLastTick = tickStart - lastTickTime;
      
      // Логируем первый тик
      if (tickCount === 1) {
        console.log(`[KnowledgeGraph] [${getTimeStamp()}] [${getAbsoluteTime()}] Первый tick callback, alpha=${alpha.toFixed(4)}`);
        firstTickTime = tickStart;
        lastTickTime = tickStart;
      }
      
      // Логируем большие интервалы между тиками (>50ms) - это может быть блокировка браузера
      if (tickCount > 1 && timeSinceLastTick > 50) {
        console.warn(`[KnowledgeGraph] [${getTimeStamp()}] [${getAbsoluteTime()}] Большой интервал между тиками #${tickCount-1} и #${tickCount}: ${timeSinceLastTick.toFixed(1)}ms`);
      }
      
      // Логируем первые 10 тиков для диагностики
      if (tickCount <= 10) {
        const timeSinceFirst = tickStart - firstTickTime;
        console.log(`[KnowledgeGraph] [${getTimeStamp()}] [${getAbsoluteTime()}] Tick #${tickCount}, alpha=${alpha.toFixed(4)}, время с первого: ${timeSinceFirst.toFixed(1)}ms, интервал: ${timeSinceLastTick.toFixed(1)}ms`);
      }
      // Логируем каждые 10 тиков
      else if (tickCount % 10 === 0) {
        const timeSinceFirst = tickStart - firstTickTime;
        console.log(`[KnowledgeGraph] [${getTimeStamp()}] [${getAbsoluteTime()}] Tick #${tickCount}, alpha=${alpha.toFixed(4)}, время с первого: ${timeSinceFirst.toFixed(1)}ms, интервал: ${timeSinceLastTick.toFixed(1)}ms`);
      }
      
      // Логируем стабилизацию только один раз
      if (!stabilizationLogged && alpha <= 0.001) {
        const totalTickTime = tickStart - firstTickTime;
        console.log(`[KnowledgeGraph] [${getTimeStamp()}] [${getAbsoluteTime()}] Симуляция стабилизирована после ${tickCount} тиков (alpha=${alpha.toFixed(4)}), общее время тиков: ${totalTickTime.toFixed(1)}ms`);
        stabilizationLogged = true;
      }
      
      lastTickTime = tickStart;

      link
        .attr("x1", (d: any) => d.source.x)
        .attr("y1", (d: any) => d.source.y)
        .attr("x2", (d: any) => d.target.x)
        .attr("y2", (d: any) => d.target.y);

      // Update link labels position (middle of the link)
      linkLabels
        .attr("x", (d: any) => (d.source.x + d.target.x) / 2)
        .attr("y", (d: any) => (d.source.y + d.target.y) / 2);

      node
        .attr("transform", (d: any) => `translate(${d.x},${d.y})`);
      
      const tickEnd = performance.now();
      // Логируем медленные тики (>5ms)
      if (tickEnd - tickStart > 5) {
        console.warn(`[KnowledgeGraph] [${getTimeStamp()}] [${getAbsoluteTime()}] Медленный tick #${tickCount}: ${(tickEnd - tickStart).toFixed(1)}ms`);
      }
    });

    function dragstarted(event: any, d: any) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      
      // Convert screen coordinates to graph coordinates considering zoom/pan
      const pointer = d3.pointer(event, container.node());
      d.fx = pointer[0];
      d.fy = pointer[1];
      
      // Prevent pan when dragging node
      event.sourceEvent.stopPropagation();
    }

    function dragged(event: any, d: any) {
      // Convert screen coordinates to graph coordinates considering zoom/pan
      const pointer = d3.pointer(event, container.node());
      d.fx = pointer[0];
      d.fy = pointer[1];
    }

    function dragended(event: any, d: any) {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }

    // Логирование завершения отрисовки (только создание, не работа симуляции)
    const renderEnd = performance.now();
    console.log(`[KnowledgeGraph] [${getTimeStamp()}] [${getAbsoluteTime()}] useEffect отрисовки завершён за ${(renderEnd - renderStart).toFixed(1)}ms (создание симуляции, тики выполняются асинхронно)`);

    // Cleanup: остановить симуляцию при размонтировании или смене данных
    return () => {
      console.log(`[KnowledgeGraph] [${getTimeStamp()}] [${getAbsoluteTime()}] Cleanup: остановка симуляции`);
      simulation.stop();
    };
  }, [focusFilteredGraphData, clickHistory]);

  if (isLoading) {
    return (
      <div className="h-full w-full flex flex-col">
        <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-800">
          <h2 className="text-lg font-bold text-white">Dependency Graph (L1)</h2>
        </div>
        <div className="flex-1 bg-slate-900 flex items-center justify-center">
          <div className="text-slate-400">Loading dependency graph...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full w-full flex flex-col">
        <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-800">
          <h2 className="text-lg font-bold text-white">Dependency Graph (L1)</h2>
        </div>
        <div className="flex-1 bg-slate-900 flex items-center justify-center">
          <div className="bg-red-900/20 border border-red-700/30 rounded-lg p-6 m-4">
            <h3 className="text-red-400 font-semibold mb-2">Error Loading Graph</h3>
            <p className="text-red-300">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full flex flex-col">
        <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-800">
            <div className="flex items-center gap-4">
              <h2 className="text-lg font-bold text-white">Dependency Graph (L1)</h2>
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
              <input
                type="text"
                placeholder="Search by ID..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="bg-slate-900 border border-slate-600 rounded px-2 py-1 text-sm text-white focus:border-blue-500 outline-none w-48"
              />
              {focusedNodeIds.size > 0 && (
                <div className="flex items-center gap-2">
                  <span className="bg-blue-900/30 border border-blue-700/30 text-blue-400 text-xs px-2 py-1 rounded flex items-center gap-1">
                    Focus: {Array.from(focusedNodeIds).map((id: string) => id.split('.').pop()).join(', ')}
                  </span>
                  <button
                    onClick={() => setFocusedNodeIds(new Set())}
                    className="text-slate-400 hover:text-white text-xs px-1"
                    title="Сбросить фокус"
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>
            <div className="flex gap-4 text-xs flex-wrap">
                <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-blue-500"></div> Func</div>
                <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-emerald-500"></div> Class</div>
                <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-purple-500"></div> Method</div>
                <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-amber-500"></div> Struct</div>
                <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-pink-500"></div> Interface</div>
            </div>
        </div>
        <div className="flex-1 bg-slate-900 overflow-hidden relative">
            <svg ref={svgRef} className="w-full h-full cursor-move"></svg>
        </div>
    </div>
  );
};

export default KnowledgeGraph;