import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { AiItem, AiItemType } from '../types';

interface KnowledgeGraphProps {
  items: AiItem[];
}

const KnowledgeGraph: React.FC<KnowledgeGraphProps> = ({ items }) => {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || items.length === 0) return;

    const width = svgRef.current.clientWidth;
    const height = svgRef.current.clientHeight;

    // Clear previous render
    d3.select(svgRef.current).selectAll("*").remove();

    const svg = d3.select(svgRef.current)
      .attr("viewBox", [0, 0, width, height]);

    // Construct nodes and links
    const nodes = items.map(d => ({ ...d }));
    const links: any[] = [];

    // Create links based on dependencies
    items.forEach(source => {
      source.l1_deps.forEach(targetId => {
        // Find target in our mocked items list
        const target = items.find(t => t.id === targetId);
        if (target) {
          links.push({ source: source.id, target: target.id });
        }
      });
    });

    const simulation = d3.forceSimulation(nodes as any)
      .force("link", d3.forceLink(links).id((d: any) => d.id).distance(150))
      .force("charge", d3.forceManyBody().strength(-400))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collide", d3.forceCollide(40));

    // Draw lines
    const link = svg.append("g")
      .attr("stroke", "#475569")
      .attr("stroke-opacity", 0.6)
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("stroke-width", 1.5)
      .attr("marker-end", "url(#arrowhead)");

    // Define Arrowhead
    svg.append("defs").append("marker")
        .attr("id", "arrowhead")
        .attr("viewBox", "0 -5 10 10")
        .attr("refX", 25) // Shift arrow back so it doesn't overlap node
        .attr("refY", 0)
        .attr("markerWidth", 6)
        .attr("markerHeight", 6)
        .attr("orient", "auto")
        .append("path")
        .attr("d", "M0,-5L10,0L0,5")
        .attr("fill", "#475569");

    // Draw Nodes
    const node = svg.append("g")
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
      .attr("fill", (d: AiItem) => {
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

    simulation.on("tick", () => {
      link
        .attr("x1", (d: any) => d.source.x)
        .attr("y1", (d: any) => d.source.y)
        .attr("x2", (d: any) => d.target.x)
        .attr("y2", (d: any) => d.target.y);

      node
        .attr("transform", (d: any) => `translate(${d.x},${d.y})`);
    });

    function dragstarted(event: any, d: any) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }

    function dragged(event: any, d: any) {
      d.fx = event.x;
      d.fy = event.y;
    }

    function dragended(event: any, d: any) {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }

  }, [items]);

  return (
    <div className="h-full w-full flex flex-col">
        <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-800">
            <h2 className="text-lg font-bold text-white">Dependency Graph (L1)</h2>
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