import express from 'express';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';

// ES modules compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Add middleware for parsing JSON
app.use(express.json());

// Получаем порт из переменной окружения или используем 3200 по умолчанию
const PORT = process.env.PORT || 3200;

// Папка, которую будем сканировать (по умолчанию - корень самого проекта)
const PROJECT_ROOT = process.env.PROJECT_ROOT || path.resolve(__dirname, '../');

// --- LOGGING SYSTEM ---
const MAX_LOGS = 1000;
const serverLogs = [];

function addLog(level, message, ...args) {
    const timestamp = new Date().toISOString();
    const formattedArgs = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
    ).join(' ');
    
    const entry = {
        id: Date.now().toString() + Math.random().toString().slice(2),
        timestamp,
        level,
        message: message + (formattedArgs ? ' ' + formattedArgs : '')
    };
    
    serverLogs.unshift(entry);
    if (serverLogs.length > MAX_LOGS) serverLogs.pop();
    
    process.stdout.write(`[${level}] ${message} ${formattedArgs}\n`);
}

const originalLog = console.log;
const originalError = console.error;
console.log = (...args) => addLog('INFO', ...args);
console.error = (...args) => addLog('ERROR', ...args);
console.warn = (...args) => addLog('WARN', ...args);
// --- END LOGGING SYSTEM ---

// --- MOCK DATA ---
const AiItemType = {
  FUNCTION: 'function',
  CLASS: 'class',
  METHOD: 'method',
  MODULE: 'module',
  INTERFACE: 'interface',
  STRUCT: 'struct'
};

const MOCK_AI_ITEMS = [
  {
    id: 'parser.parse_file',
    type: AiItemType.FUNCTION,
    language: 'python',
    filePath: 'backend/parser.py',
    l0_code: 'def parse_file(path):\n    with open(path) as f:\n        tree = ast.parse(f.read())\n    return tree',
    l1_deps: [],
    l2_desc: 'Parses a single Python file into an AST object.'
  },
  {
    id: 'core.AiItem',
    type: AiItemType.CLASS,
    language: 'python',
    filePath: 'ai_item/core.py',
    l0_code: 'class AiItem:\n    def __init__(self, id, type):\n        self.id = id\n        self.type = type',
    l1_deps: [],
    l2_desc: 'Base class representing an atomic unit of knowledge in the codebase.'
  },
  {
    id: 'generator.generate_l2',
    type: AiItemType.FUNCTION,
    language: 'python',
    filePath: 'ai_item/generator.py',
    l0_code: 'def generate_l2(item):\n    prompt = f"Describe {item.l0}"\n    return llm.invoke(prompt)',
    l1_deps: ['core.AiItem', 'utils.llm_client'],
    l2_desc: 'Generates the L2 semantic description for an AiItem using an external LLM.'
  },
  {
    id: 'graph.build_graph',
    type: AiItemType.FUNCTION,
    language: 'python',
    filePath: 'ai_item/graph.py',
    l0_code: 'def build_graph(items):\n    G = nx.DiGraph()\n    for item in items:\n        G.add_node(item.id)\n    return G',
    l1_deps: ['core.AiItem'],
    l2_desc: 'Constructs a NetworkX directed graph from a list of AiItems.'
  },
  {
    id: 'main.run_pipeline',
    type: AiItemType.FUNCTION,
    language: 'python',
    filePath: 'backend/main.py',
    l0_code: 'def run_pipeline(path):\n    items = parser.parse_file(path)\n    enriched = generator.generate_l2(items)\n    graph.build_graph(enriched)',
    l1_deps: ['parser.parse_file', 'generator.generate_l2', 'graph.build_graph'],
    l2_desc: 'Orchestrates the entire RAG extraction pipeline from parsing to graph construction.'
  },
  {
    id: 'utils.llm_client',
    type: AiItemType.FUNCTION,
    language: 'python',
    filePath: 'backend/utils.py',
    l0_code: 'def llm_client(prompt):\n    return requests.post(API_URL, json={"prompt": prompt})',
    l1_deps: [],
    l2_desc: 'Helper function to communicate with the LLM API.'
  },
  {
    id: 'App.render',
    type: AiItemType.FUNCTION,
    language: 'typescript',
    filePath: 'frontend/App.tsx',
    l0_code: 'const App: React.FC = () => {\n  useEffect(() => { api.fetchData(); }, []);\n  return <div>AiItem Dashboard</div>;\n};',
    l1_deps: ['api.fetchData'],
    l2_desc: 'Main React component entry point that triggers initial data fetching.'
  },
  {
    id: 'api.fetchData',
    type: AiItemType.FUNCTION,
    language: 'typescript',
    filePath: 'frontend/api.ts',
    l0_code: 'export const fetchData = async () => {\n  const res = await fetch("/api/graph");\n  return res.json();\n};',
    l1_deps: [],
    l2_desc: 'Asynchronous utility to fetch graph data from the backend.'
  },
  {
    id: 'service.ProcessingJob',
    type: AiItemType.STRUCT,
    language: 'go',
    filePath: 'backend/service.go',
    l0_code: 'type ProcessingJob struct {\n    ID string\n    Status string\n    Payload []byte\n}',
    l1_deps: [],
    l2_desc: 'Go struct defining the schema for a background processing job.'
  },
  {
    id: 'auth.Authenticator',
    type: AiItemType.INTERFACE,
    language: 'java',
    filePath: 'backend/Auth.java',
    l0_code: 'public interface Authenticator {\n    boolean login(String user, String pass);\n    void logout(String token);\n}',
    l1_deps: [],
    l2_desc: 'Java Interface defining the contract for authentication providers.'
  }
];

// --- Gemini Service Setup ---
let GoogleGenAI;

// Async function to initialize Gemini
async function initializeGemini() {
  try {
    const geminiModule = await import('@google/genai');
    GoogleGenAI = geminiModule.GoogleGenAI;
    console.log('Gemini SDK loaded successfully');
  } catch (error) {
    console.warn('Gemini SDK not available. Install @google/genai for chat functionality.');
  }
}

const getGeminiClient = () => {
  if (!GoogleGenAI) {
    throw new Error('Gemini SDK not installed');
  }
  
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error('API_KEY environment variable is missing');
  }
  
  return new GoogleGenAI({ apiKey });
};

const queryRagAgent = async (query, contextItems) => {
  // Same retrieval logic as client-side
  const relevantItems = contextItems.filter(item => 
    query.toLowerCase().includes(item.id.split('.')[0].toLowerCase()) ||
    query.toLowerCase().includes(item.type.toLowerCase()) ||
    item.l2_desc.toLowerCase().split(' ').some(word => query.toLowerCase().includes(word) && word.length > 4)
  ).slice(0, 3);

  const finalContext = relevantItems.length > 0 ? relevantItems : contextItems.slice(0, 2);

  const contextString = finalContext.map(item => `
---
ID: ${item.id}
TYPE: ${item.type}
LANGUAGE: ${item.language}
FILE: ${item.filePath}
DESCRIPTION (L2): ${item.l2_desc}
SOURCE (L0):
${item.l0_code}
---
`).join('\n');

  const systemPrompt = `
You are the "AiItem RAG Agent", an intelligent assistant capable of answering questions about a specific codebase (Polyglot: Python, TS, Go, etc.) based on retrieved context.

Here is the retrieved context (AiItems) relevant to the user's query:
${contextString}

Instructions:
1. Use the provided context to answer the user's question technically and precisely.
2. If the context explains the code, cite the function/class names.
3. If the context is insufficient, state that you don't have that information in the vectorized knowledge base.
4. Be concise and developer-focused.
5. Be mindful of the programming language indicated in the context.
`;

  try {
    const ai = getGeminiClient();
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: query,
      config: {
        systemInstruction: systemPrompt,
      }
    });

    return {
      text: response.text || "No response generated.",
      usedContextIds: finalContext.map(i => i.id)
    };

  } catch (error) {
    console.error("Gemini API Error:", error);
    throw error;
  }
};

// --- END MOCK DATA ---

// Middleware: CORS
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    
    next();
});

// Middleware: Logging
app.use((req, res, next) => {
    console.log(`${req.method} ${req.url}`);
    next();
});

app.get('/api/logs', (req, res) => {
    res.json(serverLogs);
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        endpoints: ['items', 'stats', 'graph', 'chat', 'files', 'logs']
    });
});

// --- NEW API ENDPOINTS ---

// GET /api/items - получение всех AiItem
app.get('/api/items', (req, res) => {
    console.log('[API] GET /api/items - Fetching all AiItems');
    res.json(MOCK_AI_ITEMS);
});

// GET /api/items/:id - получение конкретного AiItem
app.get('/api/items/:id', (req, res) => {
    const { id } = req.params;
    console.log(`[API] GET /api/items/${id} - Fetching specific AiItem`);
    
    const item = MOCK_AI_ITEMS.find(item => item.id === id);
    if (!item) {
        return res.status(404).json({ error: `AiItem with id '${id}' not found` });
    }
    
    res.json(item);
});

// GET /api/stats - статистика для Dashboard
app.get('/api/stats', (req, res) => {
    console.log('[API] GET /api/stats - Computing dashboard statistics');
    
    const typeStats = [
        { name: 'Function', count: MOCK_AI_ITEMS.filter(i => i.type === AiItemType.FUNCTION).length },
        { name: 'Class', count: MOCK_AI_ITEMS.filter(i => i.type === AiItemType.CLASS).length },
        { name: 'Interface', count: MOCK_AI_ITEMS.filter(i => i.type === AiItemType.INTERFACE).length },
        { name: 'Struct', count: MOCK_AI_ITEMS.filter(i => i.type === AiItemType.STRUCT).length },
    ];

    const languageStats = Object.entries(MOCK_AI_ITEMS.reduce((acc, item) => {
        acc[item.language] = (acc[item.language] || 0) + 1;
        return acc;
    }, {})).map(([name, value]) => ({ name, value }));

    const totalDeps = MOCK_AI_ITEMS.reduce((acc, item) => acc + item.l1_deps.length, 0);

    const stats = {
        totalItems: MOCK_AI_ITEMS.length,
        totalDeps,
        averageDependencyDensity: (totalDeps / MOCK_AI_ITEMS.length).toFixed(1),
        typeStats,
        languageStats,
        vectorIndexSize: '5.1 MB', // Mock value
        lastScan: new Date().toISOString()
    };
    
    res.json(stats);
});

// GET /api/graph - данные для Knowledge Graph
app.get('/api/graph', (req, res) => {
    console.log('[API] GET /api/graph - Preparing graph data');
    
    const nodes = MOCK_AI_ITEMS.map(item => ({
        id: item.id,
        type: item.type,
        language: item.language,
        filePath: item.filePath,
        l2_desc: item.l2_desc
    }));
    
    const links = [];
    MOCK_AI_ITEMS.forEach(source => {
        source.l1_deps.forEach(targetId => {
            const target = MOCK_AI_ITEMS.find(t => t.id === targetId);
            if (target) {
                links.push({ 
                    source: source.id, 
                    target: target.id 
                });
            }
        });
    });
    
    res.json({ nodes, links });
});

// POST /api/chat - RAG чат
app.post('/api/chat', async (req, res) => {
    const { query } = req.body;
    
    if (!query || typeof query !== 'string') {
        return res.status(400).json({ error: 'Query is required and must be a string' });
    }
    
    console.log(`[API] POST /api/chat - Processing query: "${query}"`);
    
    try {
        const result = await queryRagAgent(query, MOCK_AI_ITEMS);
        res.json({
            response: result.text,
            usedContextIds: result.usedContextIds,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('[API] Chat error:', error);
        
        // Return different error messages based on error type
        if (error.message.includes('API_KEY')) {
            return res.status(500).json({ 
                error: 'Gemini API Key is not configured. Set API_KEY environment variable.' 
            });
        }
        
        if (error.message.includes('Gemini SDK')) {
            return res.status(500).json({ 
                error: 'Gemini SDK is not installed. Run: npm install @google/genai' 
            });
        }
        
        res.status(500).json({ 
            error: 'Failed to process chat request: ' + error.message 
        });
    }
});

// --- END NEW API ENDPOINTS ---

const getFileTree = (dirPath) => {
  try {
    // Relaxed path check: Just warn in logs if path looks suspicious but try anyway
    if (os.platform() !== 'win32' && dirPath.includes(':')) {
       console.warn(`Attempting to access Windows-style path '${dirPath}' on ${os.platform()} environment. This may fail.`);
    }

    if (!fs.existsSync(dirPath)) {
        throw new Error(`Directory not found: ${dirPath}. (If you are on Linux/Cloud, 'C:/' is not accessible).`);
    }

    const stats = fs.statSync(dirPath);
    const name = path.basename(dirPath);
    
    const node = {
        id: dirPath, 
        name: name,
        type: stats.isDirectory() ? 'folder' : 'file',
        checked: true
    };

    if (stats.isDirectory()) {
        const items = fs.readdirSync(dirPath);
        const ignored = ['node_modules', '.git', '.idea', '__pycache__', 'dist', 'build', '.vscode', 'coverage', '.DS_Store'];
        
        const filtered = items.filter(item => !ignored.includes(item));
        
        node.children = filtered.map(child => {
            return getFileTree(path.join(dirPath, child));
        });
    }
    return node;
  } catch (e) {
    console.error(`[FS Error] ${dirPath}:`, e.message);
    return { 
        id: dirPath, 
        name: dirPath.split(/[/\\]/).pop() || dirPath, 
        type: 'file', 
        error: true, 
        errorMessage: e.message 
    };
  }
};

app.get('/api/files', (req, res) => {
  try {
    let targetPath = req.query.path || PROJECT_ROOT;
    // Clean up quotes
    targetPath = targetPath.replace(/^["']|["']$/g, '');

    console.log(`[Scan Request] Path: ${targetPath}`);
    const tree = getFileTree(targetPath);
    res.json([tree]);
  } catch (error) {
    console.error(`[Fatal API Error]`, error);
    res.status(500).json({ error: error.message });
  }
});

app.use('/api/*', (req, res) => {
    console.error(`[404] API Route not found: ${req.originalUrl}`);
    res.status(404).json({ error: `API endpoint not found: ${req.originalUrl}` });
});

app.use(express.static(path.join(__dirname, '../'), {
    extensions: ['html', 'js', 'ts', 'tsx', 'css', 'json'],
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) {
            res.set('Content-Type', 'application/javascript');
        }
    }
}));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../index.html'));
});

// Initialize Gemini and start server
async function startServer() {
  await initializeGemini();
  
  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📂 Default Root: ${PROJECT_ROOT}`);
  });
}

startServer().catch(console.error);