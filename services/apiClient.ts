import { AiItem, ChatMessage, ProjectFile, KnowledgeBaseConfig, FileSelectionRequest } from '../types';
import { MOCK_AI_ITEMS } from '../constants';
import { validateApiResponse, ValidationResult } from './contractValidator';

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
  private contractValidationEnabled: boolean;

  constructor(baseUrl: string = '', demoMode: boolean = false) {
    this.baseUrl = baseUrl;
    this.isDemoMode = demoMode;
    // Валидация контракта включена по умолчанию в development режиме
    this.contractValidationEnabled = import.meta.env.DEV;
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
    
    // Логирование запроса
    console.log('[ApiClient] Making request:', {
      method: options.method || 'GET',
      url,
      baseUrl: this.baseUrl || '(empty - using relative path)',
      endpoint,
      hasBody: !!options.body
    });
    
    const config: RequestInit = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    };

    try {
      const response = await fetch(url, config);
      
      // Логирование ответа
      const contentType = response.headers.get('content-type');
      console.log('[ApiClient] Response received:', {
        url,
        status: response.status,
        statusText: response.statusText,
        contentType: contentType || '(not set)',
        ok: response.ok
      });
      
      // Check if response is HTML (indicating Vite dev server fallback)
      if (contentType && contentType.includes('text/html')) {
        console.error('[ApiClient] Got HTML response instead of JSON - server not available or proxy issue');
        throw new ApiError('Backend server not available', 503, 'SERVER_UNAVAILABLE');
      }

      // Читаем данные ответа (для успешных и ошибочных ответов)
      let responseData: any;
      const isJson = contentType && contentType.includes('application/json');
      
      if (isJson) {
        try {
          responseData = await response.json();
          // Логируем данные ответа для диагностики
          console.log('[ApiClient] Response data:', {
            url,
            dataKeys: responseData && typeof responseData === 'object' && !Array.isArray(responseData) 
              ? Object.keys(responseData) 
              : Array.isArray(responseData) 
                ? `Array[${responseData.length}]` 
                : typeof responseData,
            dataType: typeof responseData,
            isArray: Array.isArray(responseData),
            dataPreview: responseData && typeof responseData === 'object' 
              ? JSON.stringify(responseData).substring(0, 300) 
              : String(responseData).substring(0, 100)
          });
        } catch (e) {
          console.error('[ApiClient] Failed to parse JSON response:', e);
          // Если не удалось прочитать как JSON, пробуем как текст
          try {
            responseData = await response.text();
            console.log('[ApiClient] Response as text:', responseData.substring(0, 200));
          } catch {
            responseData = {};
          }
        }
      } else {
        try {
          responseData = await response.text();
          console.log('[ApiClient] Non-JSON response:', responseData.substring(0, 200));
        } catch {
          responseData = {};
        }
      }

      // Валидация контракта (всегда включена для JSON ответов)
      if (isJson) {
        const validation = validateApiResponse(
          options.method || 'GET',
          endpoint,
          response.status,
          responseData
        );

        if (!validation.valid) {
          // Формируем детальное сообщение об ошибке
          const errorDetails = {
            method: options.method || 'GET',
            endpoint: endpoint,
            statusCode: response.status,
            errors: validation.errors,
            responsePreview: JSON.stringify(responseData).substring(0, 500)
          };
          
          const errorMessage = `[Contract Validator] ❌ Validation FAILED for ${errorDetails.method} ${errorDetails.endpoint} (${errorDetails.statusCode}): ${validation.errors.join('; ')}`;
          
          // Всегда логируем в консоль с деталями
          console.error(errorMessage);
          console.error('[Contract Validator] Response preview:', errorDetails.responsePreview);
          console.error('[Contract Validator] Full error details:', errorDetails);
          
          // Отправляем ошибку валидации в backend логи (с деталями)
          const backendLogMessage = `${errorMessage}\nDetails: ${JSON.stringify(errorDetails, null, 2)}`;
          this.logToBackend('ERROR', backendLogMessage).catch((logError) => {
            // Если не удалось отправить в backend, логируем это
            console.warn('[Contract Validator] Failed to send validation error to backend:', logError);
          });

          // Дополнительно: отправляем структурированное сообщение
          this.logToBackend('ERROR', JSON.stringify({
            type: 'CONTRACT_VALIDATION_ERROR',
            timestamp: new Date().toISOString(),
            ...errorDetails
          })).catch(() => {
            // Игнорируем ошибки отправки структурированных логов
          });
        }

        // Логируем предупреждения отдельно (даже если валидация прошла)
        if (validation.warnings.length > 0) {
          const warningMessage = `[Contract Validator] ⚠️ Warnings for ${options.method || 'GET'} ${endpoint}: ${validation.warnings.join('; ')}`;
          console.warn(warningMessage);
          
          // Отправляем предупреждения в backend
          this.logToBackend('WARN', warningMessage).catch(() => {
            // Игнорируем ошибки отправки предупреждений
          });
        }
      }

      if (!response.ok) {
        throw new ApiError(
          (responseData && typeof responseData === 'object' && responseData.error) || `HTTP ${response.status}: ${response.statusText}`,
          response.status,
          'HTTP_ERROR'
        );
      }

      console.log('[ApiClient] Request successful:', {
        url,
        status: response.status,
        dataType: typeof responseData
      });
      
      return responseData;
    } catch (error) {
      // Детальное логирование ошибок
      if (error instanceof ApiError) {
        console.error('[ApiClient] ApiError:', {
          url,
          message: error.message,
          status: error.status,
          code: error.code
        });
        throw error;
      }
      
      // Network errors, CORS errors, etc.
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorType = error instanceof Error ? error.constructor.name : typeof error;
      
      console.error('[ApiClient] Request failed:', {
        url,
        error: errorMessage,
        errorType,
        baseUrl: this.baseUrl || '(empty)',
        endpoint,
        isNetworkError: error instanceof TypeError && error.message.includes('fetch')
      });
      
      throw new ApiError(
        `Network error: ${errorMessage}`,
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

  // ─────────────────── v2.1.1 API Methods ───────────────────

  // GET /api/kb-config - получить конфигурацию KB (v2.1.1 совместимый)
  async getKbConfig(): Promise<{ success: boolean; config: KnowledgeBaseConfig }> {
    return this.request<{ success: boolean; config: KnowledgeBaseConfig }>('/api/kb-config');
  }

  // POST /api/kb-config - обновить конфигурацию KB (v2.1.1 совместимый)
  async updateKbConfig(updates: Partial<KnowledgeBaseConfig>): Promise<{ success: boolean; message: string; config: KnowledgeBaseConfig }> {
    return this.request<{ success: boolean; message: string; config: KnowledgeBaseConfig }>('/api/kb-config', {
      method: 'POST',
      body: JSON.stringify(updates),
    });
  }

  // GET /api/project/tree - получить дерево файлов проекта (v2.1.1)
  async getProjectTree(rootPath: string, depth?: number): Promise<ProjectFile[]> {
    const params = new URLSearchParams({ rootPath });
    if (depth !== undefined) {
      params.append('depth', depth.toString());
    }
    
    return this.request<ProjectFile[]>(`/api/project/tree?${params.toString()}`);
  }

  // POST /api/project/selection - сохранить точную выборку файлов (v2.1.1)
  async saveFileSelection(request: FileSelectionRequest): Promise<{ success: boolean; message: string; config: KnowledgeBaseConfig }> {
    return this.request<{ success: boolean; message: string; config: KnowledgeBaseConfig }>('/api/project/selection', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  // Switch to demo mode
  setDemoMode(enabled: boolean) {
    this.isDemoMode = enabled;
  }

  getDemoMode(): boolean {
    return this.isDemoMode;
  }

  /**
   * Отправляет лог на backend через POST /api/logs
   * Использует относительный путь, который проксируется через Vite на внешний сервер
   */
  private async logToBackend(level: 'INFO' | 'WARN' | 'ERROR', message: string): Promise<void> {
    try {
      // Используем относительный путь, который будет проксироваться через Vite на внешний сервер
      const logUrl = this.baseUrl ? `${this.baseUrl}/api/logs` : '/api/logs';
      
      console.log(`[ApiClient] Sending log to backend: ${level}`, {
        url: logUrl,
        message: message.substring(0, 100)
      });
      
      const response = await fetch(logUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ level, message }),
      });
      
      if (!response.ok) {
        console.warn(`[ApiClient] Failed to send log to backend: ${response.status} ${response.statusText}`);
      } else {
        console.log(`[ApiClient] Log sent successfully to backend: ${level}`);
      }
    } catch (error) {
      // Логируем ошибку, но не прерываем основной поток
      console.warn('[ApiClient] Error sending log to backend:', error instanceof Error ? error.message : error);
    }
  }

  /**
   * Включает/выключает валидацию контракта
   */
  setContractValidation(enabled: boolean) {
    this.contractValidationEnabled = enabled;
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
      console.warn('[ApiClient] getItemsWithFallback: API unavailable, using demo data. Error:', error.message);
      return { data: MOCK_AI_ITEMS, isDemo: true };
    }
    throw error; // Re-throw other errors (like authentication issues)
  }
};

export const getStatsWithFallback = async (): Promise<{ data: DashboardStats; isDemo: boolean }> => {
  try {
    const data = await apiClient.getStats();
    // Гарантируем, что languageStats и typeStats всегда массивы
    return { 
      data: {
        ...data,
        languageStats: data.languageStats || [],
        typeStats: data.typeStats || []
      }, 
      isDemo: false 
    };
  } catch (error) {
    if (error instanceof ApiError && (error.code === 'SERVER_UNAVAILABLE' || error.code === 'NETWORK_ERROR')) {
      console.warn('[ApiClient] getStatsWithFallback: API unavailable, using demo data. Error:', error.message);
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
      console.warn('[ApiClient] getGraphWithFallback: API unavailable, using demo data. Error:', error.message);
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

// ─────────────────── v2.1.1 Convenience Functions ───────────────────

export const getProjectTreeWithFallback = async (rootPath: string, depth?: number): Promise<{ data: ProjectFile[]; isDemo: boolean }> => {
  try {
    const data = await apiClient.getProjectTree(rootPath, depth);
    return { data, isDemo: false };
  } catch (error) {
    if (error instanceof ApiError && (error.code === 'SERVER_UNAVAILABLE' || error.code === 'NETWORK_ERROR')) {
      console.warn('[ApiClient] getProjectTreeWithFallback: New API unavailable, falling back to old /api/files');
      
      try {
        // Fallback на старый /api/files endpoint
        const params = new URLSearchParams({ path: rootPath });
        const fallbackData = await apiClient.request<any[]>(`/api/files?${params.toString()}`);
        
        // Конвертируем старый формат в новый ProjectFile формат
        const convertToProjectFile = (node: any): ProjectFile => ({
          path: node.id || node.name,
          name: node.name,
          type: node.type === 'folder' ? 'directory' : 'file',
          size: 0, // Старый API не предоставляет размер
          selected: node.checked || false,
          children: node.children ? node.children.map(convertToProjectFile) : undefined,
          error: node.error || false,
          errorMessage: node.errorMessage
        });
        
        const convertedData = fallbackData.map(convertToProjectFile);
        return { data: convertedData, isDemo: true };
      } catch (fallbackError) {
        console.error('[ApiClient] Fallback to /api/files also failed:', fallbackError);
        throw error; // Выбрасываем исходную ошибку
      }
    }
    throw error;
  }
};

export const getKbConfigWithFallback = async (): Promise<{ data: KnowledgeBaseConfig; isDemo: boolean }> => {
  try {
    const result = await apiClient.getKbConfig();
    return { data: result.config, isDemo: false };
  } catch (error) {
    if (error instanceof ApiError && (error.code === 'SERVER_UNAVAILABLE' || error.code === 'NETWORK_ERROR')) {
      console.warn('[ApiClient] getKbConfigWithFallback: API unavailable, using demo data');
      
      // Возвращаем демо-конфигурацию v2.1.1
      const demoConfig: KnowledgeBaseConfig = {
        targetPath: './',
        includeMask: '**/*.{py,js,ts,tsx,go,java}',
        ignorePatterns: '**/node_modules/**,**/venv/**,**/__pycache__/**',
        rootPath: '/demo/project',
        fileSelection: [],
        metadata: {
          projectName: 'Demo Project',
          description: 'Demo configuration for offline mode',
          version: '2.1.1'
        },
        lastUpdated: new Date().toISOString()
      };
      
      return { data: demoConfig, isDemo: true };
    }
    throw error;
  }
};
