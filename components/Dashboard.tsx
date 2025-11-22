import React from 'react';
import { AiItem, AiItemType } from '../types';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, PieChart, Pie, Cell } from 'recharts';

interface DashboardProps {
  items: AiItem[];
}

const Dashboard: React.FC<DashboardProps> = ({ items }) => {
  const typeStats = [
    { name: 'Function', count: items.filter(i => i.type === AiItemType.FUNCTION).length },
    { name: 'Class', count: items.filter(i => i.type === AiItemType.CLASS).length },
    { name: 'Interface', count: items.filter(i => i.type === AiItemType.INTERFACE).length },
    { name: 'Struct', count: items.filter(i => i.type === AiItemType.STRUCT).length },
  ];

  const languageStats = Object.entries(items.reduce((acc, item) => {
    acc[item.language] = (acc[item.language] || 0) + 1;
    return acc;
  }, {} as Record<string, number>)).map(([name, value]) => ({ name, value }));

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];

  const totalDeps = items.reduce((acc, item) => acc + item.l1_deps.length, 0);

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <h2 className="text-3xl font-bold text-white mb-6">Project Overview</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-slate-800 p-6 rounded-xl border border-slate-700">
          <h3 className="text-slate-400 text-sm uppercase tracking-wide font-semibold">Total AiItems</h3>
          <p className="text-4xl font-bold text-white mt-2">{items.length}</p>
          <p className="text-green-400 text-sm mt-2">↑ 12% from last scan</p>
        </div>
        <div className="bg-slate-800 p-6 rounded-xl border border-slate-700">
          <h3 className="text-slate-400 text-sm uppercase tracking-wide font-semibold">Knowledge Links (L1)</h3>
          <p className="text-4xl font-bold text-blue-400 mt-2">{totalDeps}</p>
          <p className="text-slate-500 text-sm mt-2">Dependency Density: {(totalDeps / items.length).toFixed(1)}</p>
        </div>
        <div className="bg-slate-800 p-6 rounded-xl border border-slate-700">
          <h3 className="text-slate-400 text-sm uppercase tracking-wide font-semibold">Vector Index Size</h3>
          <p className="text-4xl font-bold text-purple-400 mt-2">5.1 MB</p>
          <p className="text-slate-500 text-sm mt-2">FAISS Index optimized</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 h-80">
          <h3 className="text-white font-semibold mb-4">AiItem Distribution by Type</h3>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={typeStats}>
              <XAxis dataKey="name" stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" />
              <Tooltip 
                contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f8fafc' }}
                itemStyle={{ color: '#3b82f6' }}
              />
              <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 h-80">
          <h3 className="text-white font-semibold mb-4">Language Breakdown</h3>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={languageStats}
                cx="50%"
                cy="50%"
                labelLine={false}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
              >
                {languageStats.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f8fafc' }} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;