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

// Middleware: CORS
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
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

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📂 Default Root: ${PROJECT_ROOT}`);
});