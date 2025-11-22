export enum AppView {
  DASHBOARD = 'DASHBOARD',
  FILES = 'FILES',
  PIPELINE = 'PIPELINE',
  INSPECTOR = 'INSPECTOR', // New view for deep dive
  GRAPH = 'GRAPH',
  CHAT = 'CHAT'
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
  language: 'python' | 'javascript' | 'typescript' | 'java' | 'go' | 'unknown';
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