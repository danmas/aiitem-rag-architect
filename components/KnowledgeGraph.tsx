import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as d3 from 'd3';
import { AiItemType } from '../types';
import { getGraphWithFallback, GraphData } from '../services/apiClient';
import { useGraphFilter } from '../lib/context/GraphFilterContext';

interface KnowledgeGraphProps {
  // Props are now optional since we fetch data internally
}

const KnowledgeGraph: React.FC<KnowledgeGraphProps> = () => {
  const { filteredItemIds } = useGraphFilter();
  const svgRef = useRef<SVGSVGElement>(null);
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDemoMode, setIsDemoMode] = useState(false);

  // Трассировка изменений filteredItemIds
  useEffect(() => {
    console.trace('[KnowledgeGraph] filteredItemIds изменился:', {
      size: filteredItemIds.size,
      ids: Array.from(filteredItemIds).slice(0, 5)
    });
  }, [filteredItemIds]);

  useEffect(() => {
    const fetchGraphData = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        const result = await getGraphWithFallback();
        setGraphData(result.data);
        setIsDemoMode(result.isDemo);
      } catch (err) {
        console.error('Failed to fetch graph data:', err);
        setError(err instanceof Error ? err.message : 'Failed to load graph data');
      } finally {
        setIsLoading(false);
      }
    };

    fetchGraphData();
  }, []);

  // Фильтрация графа на основе filteredItemIds из контекста
  const filteredGraphData = useMemo(() => {
    console.time('[KnowledgeGraph] useMemo filteredGraphData');
    console.trace('[KnowledgeGraph] useMemo вызван', {
      graphDataNodes: graphData?.nodes.length,
      filteredItemIdsSize: filteredItemIds.size
    });
    
    if (!graphData || graphData.nodes.length === 0) {
      console.timeEnd('[KnowledgeGraph] useMemo filteredGraphData');
      return null;
    }
    
    // Если фильтр пуст, показываем весь граф (обратная совместимость)
    if (filteredItemIds.size === 0) {
      console.timeEnd('[KnowledgeGraph] useMemo filteredGraphData');
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
    
    console.timeEnd('[KnowledgeGraph] useMemo filteredGraphData');
    console.log('[KnowledgeGraph] useMemo результат:', {
      nodes: result.nodes.length,
      links: result.links.length
    });
    
    return result;
  }, [graphData, filteredItemIds]);

  useEffect(() => {
    const renderStart = performance.now();
    console.trace('[KnowledgeGraph] useEffect отрисовки ЗАПУЩЕН', {
      nodes: filteredGraphData?.nodes.length,
      links: filteredGraphData?.links.length,
      stack: new Error().stack?.split('\n').slice(1, 4).join('\n')
    });
    
    if (!svgRef.current || !filteredGraphData || filteredGraphData.nodes.length === 0) {
      console.log('[KnowledgeGraph] useEffect: ранний выход');
      return;
    }

    const width = svgRef.current.clientWidth;
    const height = svgRef.current.clientHeight;

    // Clear previous render
    d3.select(svgRef.current).selectAll("*").remove();

    const svg = d3.select(svgRef.current)
      .attr("viewBox", [0, 0, width, height]);

    // Use the filtered graph data
    const nodes = filteredGraphData.nodes.map(d => ({ ...d }));
    const links = filteredGraphData.links.map(d => ({ ...d }));

    // Add invisible background rect for panning (catches mouse events on empty space)
    // Must be first so it's under everything but still receives events on empty space
    const bgRect = svg.append("rect")
      .attr("width", width)
      .attr("height", height)
      .attr("fill", "transparent")
      .style("cursor", "move")
      .style("pointer-events", "all");

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
      );

    // Node Circles
    node.append("circle")
      .attr("r", 20)
      .attr("fill", (d: any) => {
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
        // For wheel: only zoom when CTRL or CMD is pressed
        if (event.type === 'wheel') {
          return event.ctrlKey || event.metaKey;
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

    // Handle wheel events for CTRL+wheel zoom
    svg.on("wheel.zoom", function(event: WheelEvent) {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        const point = d3.pointer(event, svgRef.current);
        const scale = event.deltaY > 0 ? 0.9 : 1.1;
        svg.transition()
          .duration(50)
          .call(zoom.scaleBy as any, scale, point);
      }
    } as any);

    // Предварительный расчет позиций без DOM операций (прогрев)
    simulation.tick(50);

    simulation.on("tick", () => {
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

    // Логирование завершения отрисовки
    const renderEnd = performance.now();
    console.log(`[KnowledgeGraph] useEffect отрисовки завершён за ${(renderEnd - renderStart).toFixed(2)}ms`);

    // Cleanup: остановить симуляцию при размонтировании или смене данных
    return () => {
      console.log('[KnowledgeGraph] Cleanup: остановка симуляции');
      simulation.stop();
    };
  }, [filteredGraphData]);

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