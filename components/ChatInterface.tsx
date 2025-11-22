import React, { useState, useRef, useEffect } from 'react';
import { AiItem, ChatMessage } from '../types';
import { queryRagAgent } from '../services/geminiService';

interface ChatInterfaceProps {
  items: AiItem[];
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({ items }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'model',
      text: 'Hello! I am the AiItem RAG Client. I have analyzed your codebase. Ask me anything about the architecture, functions, or logic.',
      timestamp: Date.now()
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      text: input,
      timestamp: Date.now()
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    const response = await queryRagAgent(input, items);

    const modelMsg: ChatMessage = {
      id: (Date.now() + 1).toString(),
      role: 'model',
      text: response.text,
      retrievedContext: items.filter(i => response.usedContextIds.includes(i.id)),
      timestamp: Date.now()
    };

    setMessages(prev => [...prev, modelMsg]);
    setIsLoading(false);
  };

  return (
    <div className="flex flex-col h-full max-w-5xl mx-auto w-full bg-slate-900">
      {/* Chat Header */}
      <div className="p-4 border-b border-slate-700 bg-slate-800 shadow-sm z-10">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <span className="text-2xl">🤖</span> RAG Client
        </h2>
        <p className="text-slate-400 text-xs">Model: Gemini 2.5 Flash • Index: FAISS (Simulated)</p>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] rounded-2xl p-4 ${
              msg.role === 'user' 
                ? 'bg-blue-600 text-white rounded-br-none' 
                : 'bg-slate-800 text-slate-200 border border-slate-700 rounded-bl-none'
            }`}>
              <div className="whitespace-pre-wrap leading-relaxed text-sm">{msg.text}</div>
              
              {/* RAG Context Cards */}
              {msg.retrievedContext && msg.retrievedContext.length > 0 && (
                <div className="mt-4 pt-3 border-t border-slate-700">
                  <p className="text-xs font-bold text-slate-400 mb-2 flex items-center gap-1">
                    <span>🔍</span> Retrieved Context (L2)
                  </p>
                  <div className="space-y-2">
                    {msg.retrievedContext.map(ctx => (
                      <div key={ctx.id} className="bg-slate-900 p-2 rounded border border-slate-700 text-xs">
                        <div className="flex justify-between text-slate-300 mb-1">
                          <span className="font-mono font-bold text-blue-400">{ctx.id}</span>
                          <span className="bg-slate-700 px-1 rounded text-[10px]">{ctx.type}</span>
                        </div>
                        <p className="text-slate-500 italic truncate">{ctx.l2_desc}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              <div className="text-[10px] opacity-50 mt-2 text-right">
                {new Date(msg.timestamp).toLocaleTimeString()}
              </div>
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-slate-800 rounded-2xl p-4 border border-slate-700 rounded-bl-none flex items-center gap-2">
               <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce"></div>
               <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
               <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 border-t border-slate-700 bg-slate-800">
        <form onSubmit={handleSubmit} className="relative flex gap-4">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about 'parser.py' or how L2 generation works..."
            className="flex-1 bg-slate-900 text-white rounded-xl border border-slate-700 p-4 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
            disabled={isLoading}
          />
          <button 
            type="submit"
            disabled={isLoading || !input.trim()}
            className="bg-blue-600 hover:bg-blue-500 text-white rounded-xl px-6 font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
};

export default ChatInterface;