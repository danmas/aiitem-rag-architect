const express = require('express');
const path = require('path');
const fs = require('fs');
const os = require('os');
const app = express();

// Получаем порт из переменной окружения или используем 3200 по умолчанию
const PORT = process.env.PORT || 3200;

// Папка, которую будем сканировать (по умолчанию - корень самого проекта)
const PROJECT_ROOT = process.env.PROJECT_ROOT || path.resolve(__dirname, '../');

// --- LOGGING SYSTEM ---
const MAX_LOGS = 1000;
const serverLogs = [];

function addLog(level, message, ...args) {
    const timestamp = new Date().toISOString();
    // Convert args to string if necessary
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
    
    // Also output to real console
    const originalFn = level === 'ERROR' ? console.error : console.log;
    // We need to bypass our override to avoid infinite loop if we overrode globally,
    // but here we just use a helper.
    process.stdout.write(`[${level}] ${message} ${formattedArgs}\n`);
}

// Override console methods to capture logs
const originalLog = console.log;
const originalError = console.error;

console.log = (...args) => addLog('INFO', ...args);
console.error = (...args) => addLog('ERROR', ...args);
console.warn = (...args) => addLog('WARN', ...args);

// --- END LOGGING SYSTEM ---

// Middleware для логирования запросов
app.use((req, res, next) => {
    console.log(`${req.method} ${req.url}`);
    next();
});

// API Endpoint for logs
app.get('/api/logs', (req, res) => {
    res.json(serverLogs);
});

// Рекурсивная функция для построения дерева файлов
const getFileTree = (dirPath) => {
  try {
    // Проверка на системные ограничения путей
    if (os.platform() !== 'win32' && dirPath.includes(':')) {
       // Если мы на Linux, а путь виндовый
       throw new Error(`Cannot access Windows path '${dirPath}' on this ${os.platform()} server.`);
    }

    if (!fs.existsSync(dirPath)) {
        throw new Error(`Directory does not exist: ${dirPath}`);
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
        // Игнорируем тяжелые системные папки
        const ignored = ['node_modules', '.git', '.idea', '__pycache__', 'dist', 'build', '.vscode', 'coverage'];
        
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
        name: dirPath.split(/[/\\]/).pop(), 
        type: 'file', 
        error: true, 
        errorMessage: e.message 
    };
  }
};

// API endpoint для получения дерева файлов
app.get('/api/files', (req, res) => {
  try {
    let targetPath = req.query.path || PROJECT_ROOT;
    console.log(`[Scan Request] Path: ${targetPath}`);

    // Clean up quotes if user pasted them
    targetPath = targetPath.replace(/^["']|["']$/g, '');

    const tree = getFileTree(targetPath);
    res.json([tree]);
  } catch (error) {
    console.error(`[Fatal API Error]`, error);
    res.status(500).json({ error: error.message });
  }
});

// IMPORTANT: Catch 404s for API routes specifically to return JSON
// This prevents index.html being returned for failed API calls
app.use('/api/*', (req, res) => {
    console.error(`[404] API Route not found: ${req.originalUrl}`);
    res.status(404).json({ error: `API endpoint not found: ${req.originalUrl}` });
});

// Раздаем статические файлы
app.use(express.static(path.join(__dirname, '../'), {
    extensions: ['html', 'js', 'ts', 'tsx', 'css', 'json'],
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) {
            res.set('Content-Type', 'application/javascript');
        }
    }
}));

// Fallback to index.html for SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../index.html'));
});

app.listen(PORT, () => {
  console.log(`--------------------------------------------------`);
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📂 Root: ${PROJECT_ROOT}`);
  console.log(`--------------------------------------------------`);
});