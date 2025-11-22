import { AiItem, ChatMessage } from '../types';
import { MOCK_AI_ITEMS } from '../constants';

export interface DashboardStats {
  totalItems: number;
  totalDeps: number;
  averageDependencyDensity: string;
  typeStats: { name: string; count: number }[];
  languageStats: { name: string; value: number }[];
  vectorIndexSize: string;
  lastScan: string;
}

export interface GraphData {
  nodes: Array<{
    id: string;
    type: string;
    language: string;
    filePath: string;
    l2_desc: string;
  }>;
  links: Array<{
    source: string;
    target: string;
  }>;
}

export interface ChatResponse {
  response: string;
  usedContextIds: string[];
  timestamp: string;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status?: number,
    public code?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class ApiClient {
  private baseUrl: string;
  private isDemoMode: boolean;

  constructor(baseUrl: string = '', demoMode: boolean = false) {
    this.baseUrl = baseUrl;
    this.isDemoMode = demoMode;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    // If demo mode is explicitly enabled, throw error to indicate no API available
    if (this.isDemoMode) {
      throw new ApiError('Demo mode is active - API not available', 503, 'DEMO_MODE');
    }

    const url = `${this.baseUrl}${endpoint}`;
    
    const config: RequestInit = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    };

    try {
      const response = await fetch(url, config);
      
      // Check if response is HTML (indicating Vite dev server fallback)
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('text/html')) {
        throw new ApiError('Backend server not available', 503, 'SERVER_UNAVAILABLE');
      }

      if (!response.ok) {
        let errorData: any = {};
        try {
          errorData = await response.json();
        } catch {
          // Ignore JSON parse errors for error responses
        }
        
        throw new ApiError(
          errorData.error || `HTTP ${response.status}: ${response.statusText}`,
          response.status,
          'HTTP_ERROR'
        );
      }

      return await response.json();
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      
      // Network errors, CORS errors, etc.
      throw new ApiError(
        `Network error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        0,
        'NETWORK_ERROR'
      );
    }
  }

  // GET /api/items - получение всех AiItem
  async getItems(): Promise<AiItem[]> {
    return this.request<AiItem[]>('/api/items');
  }

  // GET /api/items/:id - получение конкретного AiItem
  async getItem(id: string): Promise<AiItem> {
    return this.request<AiItem>(`/api/items/${encodeURIComponent(id)}`);
  }

  // GET /api/stats - статистика для Dashboard
  async getStats(): Promise<DashboardStats> {
    return this.request<DashboardStats>('/api/stats');
  }

  // GET /api/graph - данные для Knowledge Graph
  async getGraph(): Promise<GraphData> {
    return this.request<GraphData>('/api/graph');
  }

  // POST /api/chat - RAG чат
  async chat(query: string): Promise<ChatResponse> {
    return this.request<ChatResponse>('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ query }),
    });
  }

  // Health check method
  async healthCheck(): Promise<{ status: string; timestamp: string }> {
    return this.request('/api/health');
  }

  // Run a single pipeline step
  async runPipelineStep(stepId: number, config?: any): Promise<{ success: boolean; step: any }> {
    return this.request<{ success: boolean; step: any }>('/api/pipeline/step/' + stepId + '/run', {
      method: 'POST',
      body: JSON.stringify(config || {}),
    });
  }

  // Get status of all pipeline steps
  async getPipelineStepsStatus(): Promise<{ success: boolean; steps: any[] }> {
    return this.request<{ success: boolean; steps: any[] }>('/api/pipeline/steps/status');
  }

  // Switch to demo mode
  setDemoMode(enabled: boolean) {
    this.isDemoMode = enabled;
  }

  getDemoMode(): boolean {
    return this.isDemoMode;
  }
}

// Create default API client instance
export const apiClient = new ApiClient();

// Export convenience functions that handle demo mode fallback
export const getItemsWithFallback = async (): Promise<{ data: AiItem[]; isDemo: boolean }> => {
  try {
    const data = await apiClient.getItems();
    return { data, isDemo: false };
  } catch (error) {
    if (error instanceof ApiError && (error.code === 'SERVER_UNAVAILABLE' || error.code === 'NETWORK_ERROR')) {
      console.warn('API unavailable, using demo data:', error.message);
      return { data: MOCK_AI_ITEMS, isDemo: true };
    }
    throw error; // Re-throw other errors (like authentication issues)
  }
};

export const getStatsWithFallback = async (): Promise<{ data: DashboardStats; isDemo: boolean }> => {
  try {
    const data = await apiClient.getStats();
    return { data, isDemo: false };
  } catch (error) {
    if (error instanceof ApiError && (error.code === 'SERVER_UNAVAILABLE' || error.code === 'NETWORK_ERROR')) {
      // Generate mock stats
      const mockStats: DashboardStats = {
        totalItems: MOCK_AI_ITEMS.length,
        totalDeps: MOCK_AI_ITEMS.reduce((acc, item) => acc + item.l1_deps.length, 0),
        averageDependencyDensity: '2.1',
        typeStats: [
          { name: 'Function', count: MOCK_AI_ITEMS.filter(i => i.type === 'function').length },
          { name: 'Class', count: MOCK_AI_ITEMS.filter(i => i.type === 'class').length },
          { name: 'Interface', count: MOCK_AI_ITEMS.filter(i => i.type === 'interface').length },
          { name: 'Struct', count: MOCK_AI_ITEMS.filter(i => i.type === 'struct').length },
        ],
        languageStats: Object.entries(MOCK_AI_ITEMS.reduce((acc, item) => {
          acc[item.language] = (acc[item.language] || 0) + 1;
          return acc;
        }, {} as Record<string, number>)).map(([name, value]) => ({ name, value })),
        vectorIndexSize: '5.1 MB',
        lastScan: new Date().toISOString()
      };
      return { data: mockStats, isDemo: true };
    }
    throw error;
  }
};

export const getGraphWithFallback = async (): Promise<{ data: GraphData; isDemo: boolean }> => {
  try {
    const data = await apiClient.getGraph();
    return { data, isDemo: false };
  } catch (error) {
    if (error instanceof ApiError && (error.code === 'SERVER_UNAVAILABLE' || error.code === 'NETWORK_ERROR')) {
      // Generate mock graph data
      const nodes = MOCK_AI_ITEMS.map(item => ({
        id: item.id,
        type: item.type,
        language: item.language,
        filePath: item.filePath,
        l2_desc: item.l2_desc
      }));
      
      const links: Array<{ source: string; target: string }> = [];
      MOCK_AI_ITEMS.forEach(source => {
        source.l1_deps.forEach(targetId => {
          const target = MOCK_AI_ITEMS.find(t => t.id === targetId);
          if (target) {
            links.push({ source: source.id, target: target.id });
          }
        });
      });
      
      return { data: { nodes, links }, isDemo: true };
    }
    throw error;
  }
};
