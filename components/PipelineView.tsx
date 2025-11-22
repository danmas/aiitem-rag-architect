import React, { useState, useEffect } from 'react';
import { PipelineStep } from '../types';
import { apiClient } from '../services/apiClient';

const STEP_DETAILS: Record<number, string> = {
  1: 'Parsing AST for .py, .ts, .go, .java files...',
  2: 'Resolving imports, class hierarchy, and calls...',
  3: 'Generating natural language descriptions via LLM...',
  4: 'Creating embeddings (text-embedding-ada-002 or Gecko)...',
  5: 'Building FAISS/ChromaDB index...'
};

const STEP_LABELS: Record<number, string> = {
  1: 'Polyglot Parsing (L0)',
  2: 'Dependency Analysis (L1)',
  3: 'Semantic Enrichment (L2)',
  4: 'Vectorization',
  5: 'Index Construction'
};

const PipelineView: React.FC = () => {
  const [isRunning, setIsRunning] = useState(false);
  const [steps, setSteps] = useState<PipelineStep[]>([
    { id: '1', label: STEP_LABELS[1], status: 'pending', details: STEP_DETAILS[1] },
    { id: '2', label: STEP_LABELS[2], status: 'pending', details: STEP_DETAILS[2] },
    { id: '3', label: STEP_LABELS[3], status: 'pending', details: STEP_DETAILS[3] },
    { id: '4', label: STEP_LABELS[4], status: 'pending', details: STEP_DETAILS[4] },
    { id: '5', label: STEP_LABELS[5], status: 'pending', details: STEP_DETAILS[5] },
  ]);
  const [loadingSteps, setLoadingSteps] = useState<Set<number>>(new Set());

  // Загрузка статуса шагов с сервера
  const fetchStepsStatus = async () => {
    try {
      const response = await apiClient.getPipelineStepsStatus();
      if (response.success && response.steps) {
        const serverSteps = response.steps;
        setSteps(prevSteps => prevSteps.map(prevStep => {
          const serverStep = serverSteps.find(s => s.id === parseInt(prevStep.id));
          if (serverStep) {
            // Маппинг статусов с сервера на статусы фронтенда
            let status: 'pending' | 'processing' | 'completed' | 'error' = 'pending';
            if (serverStep.status === 'running') {
              status = 'processing';
            } else if (serverStep.status === 'completed') {
              status = 'completed';
            } else if (serverStep.status === 'failed') {
              status = 'error';
            }
            
            return {
              ...prevStep,
              status,
              label: serverStep.label || prevStep.label
            };
          }
          return prevStep;
        }));
      }
    } catch (error) {
      // Если API недоступен, используем локальное состояние
      console.warn('Failed to fetch steps status:', error);
    }
  };

  // Polling для обновления статуса
  useEffect(() => {
    fetchStepsStatus(); // Загружаем сразу
    const interval = setInterval(fetchStepsStatus, 2000); // Обновляем каждые 2 секунды
    return () => clearInterval(interval);
  }, []);

  // Запуск отдельного шага
  const runStep = async (stepId: number) => {
    // Проверяем, не выполняется ли уже этот шаг
    if (loadingSteps.has(stepId)) {
      return;
    }

    setLoadingSteps(prev => new Set(prev).add(stepId));
    
    // Обновляем локальное состояние сразу
    setSteps(prev => prev.map(s => 
      s.id === stepId.toString() ? { ...s, status: 'processing' } : s
    ));

    try {
      await apiClient.runPipelineStep(stepId);
      // Статус будет обновлен через polling
    } catch (error) {
      console.error(`Failed to run step ${stepId}:`, error);
      setSteps(prev => prev.map(s => 
        s.id === stepId.toString() ? { ...s, status: 'error' } : s
      ));
    } finally {
      setLoadingSteps(prev => {
        const newSet = new Set(prev);
        newSet.delete(stepId);
        return newSet;
      });
    }
  };

  const runPipeline = () => {
    if (isRunning) return;
    setIsRunning(true);
    
    // Reset
    setSteps(steps.map(s => ({ ...s, status: 'pending' })));

    let currentStepIndex = 0;

    const processNextStep = () => {
      if (currentStepIndex >= steps.length) {
        setIsRunning(false);
        return;
      }

      setSteps(prev => prev.map((s, i) => {
        if (i === currentStepIndex) return { ...s, status: 'processing' };
        return s;
      }));

      // Simulate processing time
      setTimeout(() => {
        setSteps(prev => prev.map((s, i) => {
          if (i === currentStepIndex) return { ...s, status: 'completed' };
          return s;
        }));
        currentStepIndex++;
        processNextStep();
      }, 1200);
    };

    processNextStep();
  };

  return (
    <div className="p-8 max-w-5xl mx-auto h-full overflow-y-auto">
      <div className="mb-8 text-center">
        <h2 className="text-3xl font-bold text-white mb-2">Knowledge Processing Pipeline</h2>
        <p className="text-slate-400">
            This pipeline transforms raw source code into a vectorized knowledge base ready for RAG.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Pipeline Steps */}
          <div className="bg-slate-800 rounded-xl p-8 border border-slate-700 shadow-xl">
            <div className="space-y-6">
              {steps.map((step, index) => (
                <div key={step.id} className="relative pl-10">
                  {/* Connector Line */}
                  {index !== steps.length - 1 && (
                    <div className={`absolute left-[19px] top-8 bottom-[-24px] w-0.5 ${
                      step.status === 'completed' ? 'bg-green-500' : 'bg-slate-700'
                    }`} />
                  )}
                  
                  {/* Status Icon - кликабельный */}
                  <div 
                    onClick={() => runStep(index + 1)}
                    className={`absolute left-0 top-1 w-10 h-10 rounded-full flex items-center justify-center border-2 z-10 bg-slate-800 transition-all ${
                      step.status === 'completed' ? 'border-green-500 text-green-500 hover:border-green-400 hover:bg-green-900/20 cursor-pointer' :
                      step.status === 'processing' ? 'border-blue-500 text-blue-500 animate-pulse cursor-wait' :
                      step.status === 'error' ? 'border-red-500 text-red-500 hover:border-red-400 hover:bg-red-900/20 cursor-pointer' :
                      'border-slate-600 text-slate-600 hover:border-blue-500 hover:text-blue-500 hover:bg-blue-900/20 cursor-pointer'
                    }`}
                    title={step.status === 'processing' ? 'Processing...' : `Click to run ${step.label}`}
                  >
                    {step.status === 'completed' ? '✓' : 
                     step.status === 'processing' ? '↻' : 
                     (index + 1)}
                  </div>

                  {/* Content */}
                  <div className={`p-4 rounded-lg border transition-all ${
                     step.status === 'processing' ? 'bg-blue-900/20 border-blue-500/50' :
                     step.status === 'completed' ? 'bg-green-900/10 border-green-500/30' :
                     'bg-slate-900 border-slate-700'
                  }`}>
                    <h3 className={`font-semibold text-lg ${
                      step.status === 'completed' ? 'text-green-400' : 
                      step.status === 'processing' ? 'text-blue-400' : 'text-slate-300'
                    }`}>{step.label}</h3>
                    <p className="text-slate-500 text-sm mt-1">{step.details}</p>
                    
                    {step.status === 'processing' && (
                      <div className="mt-3 w-full bg-slate-700 rounded-full h-1.5 overflow-hidden">
                        <div className="bg-blue-500 h-1.5 rounded-full animate-progress"></div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-8 flex justify-end">
              <button
                onClick={runPipeline}
                disabled={isRunning}
                className={`px-6 py-3 rounded-lg font-bold text-white shadow-lg transition-all transform hover:scale-105 ${
                  isRunning ? 'bg-slate-600 cursor-not-allowed opacity-50' : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500'
                }`}
              >
                {isRunning ? 'Processing...' : 'Run Simulation'}
              </button>
            </div>
          </div>

          {/* Info / Theory Panel */}
          <div className="space-y-6">
             <div className="bg-slate-900 p-6 rounded-xl border border-slate-700">
                <h3 className="text-xl font-bold text-white mb-3">How Vectorization Works</h3>
                <div className="text-slate-400 text-sm space-y-3">
                    <p>
                        1. <span className="text-blue-400 font-bold">Chunking:</span> Code is not split by lines, but by "AiItems" (functions/classes). This preserves context.
                    </p>
                    <p>
                        2. <span className="text-blue-400 font-bold">Description Generation:</span> An LLM reads the code and generates a summary (L2).
                        <br/>
                        <em className="text-slate-500">"This function calculates the Fibonacci sequence recursively."</em>
                    </p>
                    <p>
                        3. <span className="text-blue-400 font-bold">Embedding:</span> The summary + signature is sent to an Embedding Model (e.g., Gemini Embedding) to produce a vector (e.g., `[0.1, -0.5, ...]`).
                    </p>
                    <p>
                        4. <span className="text-blue-400 font-bold">Storage:</span> Vectors are saved in a local `faiss.index` file for millisecond-speed retrieval.
                    </p>
                </div>
             </div>

             <div className="bg-slate-800 p-6 rounded-xl border border-slate-700">
                <h3 className="text-white font-bold mb-3">Configuration</h3>
                <div className="space-y-4">
                    <div>
                        <label className="block text-xs text-slate-500 uppercase mb-1">Embedding Model</label>
                        <select className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-sm text-white">
                            <option>Google Gemini (text-embedding-004)</option>
                            <option>OpenAI (text-embedding-3-small)</option>
                            <option>Local (SentenceTransformers)</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs text-slate-500 uppercase mb-1">Chunk Strategy</label>
                        <select className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-sm text-white">
                            <option>Semantic (AiItem / Function-based)</option>
                            <option>Fixed Size (512 tokens)</option>
                            <option>File-based</option>
                        </select>
                    </div>
                </div>
             </div>
          </div>
      </div>
    </div>
  );
};

export default PipelineView;