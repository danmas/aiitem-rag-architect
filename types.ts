export enum AppView {
  DASHBOARD = 'DASHBOARD',
  FILES = 'FILES',
  PIPELINE = 'PIPELINE',
  INSPECTOR = 'INSPECTOR', // New view for deep dive
  GRAPH = 'GRAPH',
  CHAT = 'CHAT',
  LOGS = 'LOGS'
}

export enum AiItemType {
  FUNCTION = 'function',
  CLASS = 'class',
  METHOD = 'method',
  MODULE = 'module',
  INTERFACE = 'interface', // For TS/Java
  STRUCT = 'struct'        // For Go
}

export interface AiItem {
  id: string;
  type: AiItemType;
  language: Language;
  l0_code: string;
  l1_deps: string[];
  l2_desc: string;
  filePath: string;
}

export interface FileNode {
  id: string;
  name: string;
  type: 'file' | 'folder';
  children?: FileNode[];
  checked?: boolean;
  error?: boolean;
  errorMessage?: string;
}

// ────────────────────────────────────── v2.1.1 Types

export type Language = 'python' | 'javascript' | 'typescript' | 'java' | 'go' | 'unknown';

export interface ProjectFile {
  path: string; // Относительный путь от корня проекта (всегда с ./)
  name: string;
  type: 'file' | 'directory';
  size: number;
  selected: boolean;
  children?: ProjectFile[];
  language?: Language | null;
  error?: boolean;
  errorMessage?: string;
}

export interface KnowledgeBaseConfig {
  // Обратная совместимость (legacy)
  targetPath: string;
  includeMask: string;
  ignorePatterns: string;
  
  // Новые обязательные поля v2.1.1
  rootPath: string; // Абсолютный путь к проекту на стороне бэкенда
  fileSelection: string[]; // Точный список выбранных относительных путей
  
  // Опциональные поля
  metadata?: {
    projectName?: string;
    description?: string;
    version?: string;
    tags?: string[];
    [key: string]: any;
  };
  
  lastUpdated: string;
}

export interface FileSelectionRequest {
  rootPath: string; // Абсолютный путь к проекту на сервере
  files: string[]; // Массив относительных путей (начинающихся с ./)
}

export interface PipelineStep {
  id: string;
  label: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  details?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  retrievedContext?: AiItem[]; // Simulation of RAG context
  timestamp: number;
}

export interface ServerLog {
    id: string;
    timestamp: string;
    level: 'INFO' | 'ERROR' | 'WARN';
    message: string;
}