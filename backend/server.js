const express = require('express');
const path = require('path');
const fs = require('fs');
const os = require('os');
const app = express();

// Получаем порт из переменной окружения или используем 3200 по умолчанию
const PORT = process.env.PORT || 3200;

// Папка, которую будем сканировать (по умолчанию - корень самого проекта)
const PROJECT_ROOT = process.env.PROJECT_ROOT || path.resolve(__dirname, '../');

// Middleware для логирования запросов (Server Logs)
app.use((req, res, next) => {
    const time = new Date().toISOString().split('T')[1].split('.')[0];
    console.log(`[${time}] ${req.method} ${req.url}`);
    next();
});

// Рекурсивная функция для построения дерева файлов
const getFileTree = (dirPath) => {
  try {
    // Проверка на системные ограничения путей
    if (os.platform() !== 'win32' && dirPath.includes(':')) {
       // Попытка использовать Windows-путь на Linux/Mac
       console.warn(`Warning: Accessing Windows path '${dirPath}' on non-Windows OS.`);
    }

    const stats = fs.statSync(dirPath);
    const name = path.basename(dirPath);
    
    const node = {
        id: dirPath, // Используем полный путь как ID
        name: name,
        type: stats.isDirectory() ? 'folder' : 'file',
        checked: true
    };

    if (stats.isDirectory()) {
        const items = fs.readdirSync(dirPath);
        // Игнорируем тяжелые системные папки, чтобы не положить UI
        const ignored = ['node_modules', '.git', '.idea', '__pycache__', 'dist', 'build', '.vscode', 'coverage'];
        
        const filtered = items.filter(item => !ignored.includes(item));
        
        node.children = filtered.map(child => {
            return getFileTree(path.join(dirPath, child));
        });
    }
    return node;
  } catch (e) {
    console.error(`[Error] Accessing ${dirPath}:`, e.message);
    // Возвращаем узел с ошибкой, чтобы показать в UI
    return { id: dirPath, name: path.basename(dirPath), type: 'file', error: true, errorMessage: e.message };
  }
};

// API endpoint для получения дерева файлов
app.get('/api/files', (req, res) => {
  try {
    // Если передан query параметр path, используем его, иначе дефолтный корень
    const targetPath = req.query.path || PROJECT_ROOT;
    console.log(`[Scan] Processing directory: ${targetPath}`);

    if (!fs.existsSync(targetPath)) {
        console.error(`[Error] Directory not found: ${targetPath}`);
        return res.status(404).json({ error: `Directory not found: ${targetPath}` });
    }
    
    const tree = getFileTree(targetPath);
    res.json([tree]); // Возвращаем массив, так как компонент ожидает массив корневых узлов
  } catch (error) {
    console.error(`[Fatal] API Error:`, error);
    res.status(500).json({ error: error.message });
  }
});

// Раздаем статические файлы из корневой директории с поддержкой разрешений расширений
app.use(express.static(path.join(__dirname, '../'), {
    extensions: ['html', 'js', 'ts', 'tsx', 'css', 'json'],
    setHeaders: (res, filePath) => {
        // Принудительно устанавливаем JS MIME-тип для TS/TSX файлов
        if (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) {
            res.set('Content-Type', 'application/javascript');
        }
    }
}));

// Любой запрос, не являющийся файлом, отправляем на index.html (для SPA роутинга)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../index.html'));
});

app.listen(PORT, () => {
  console.log(`--------------------------------------------------`);
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
  console.log(`📂 Default Project Root: ${PROJECT_ROOT}`);
  console.log(`📝 Server logs will appear below:`);
  console.log(`--------------------------------------------------`);
});