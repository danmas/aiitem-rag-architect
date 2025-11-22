const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();

// Получаем порт из переменной окружения или используем 3000 по умолчанию
const PORT = process.env.PORT || 3000;

// Папка, которую будем сканировать (по умолчанию - корень самого проекта)
const PROJECT_ROOT = process.env.PROJECT_ROOT || path.resolve(__dirname, '../');

// Рекурсивная функция для построения дерева файлов
const getFileTree = (dirPath) => {
  try {
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
    console.error(`Error accessing ${dirPath}:`, e.message);
    // Возвращаем null или "битый" узел, если нет доступа
    return { id: dirPath, name: path.basename(dirPath), type: 'file', error: true };
  }
};

// API endpoint для получения дерева файлов
app.get('/api/files', (req, res) => {
  try {
    // Если передан query параметр path, используем его, иначе дефолтный корень
    const targetPath = req.query.path || PROJECT_ROOT;
    console.log(`Scanning directory: ${targetPath}`);

    if (!fs.existsSync(targetPath)) {
        return res.status(404).json({ error: `Directory not found: ${targetPath}` });
    }
    
    const tree = getFileTree(targetPath);
    res.json([tree]); // Возвращаем массив, так как компонент ожидает массив корневых узлов
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Раздаем статические файлы из корневой директории (на уровень выше)
app.use(express.static(path.join(__dirname, '../')));

// Любой запрос, не являющийся файлом, отправляем на index.html (для SPA роутинга)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../index.html'));
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Default Project Root: ${PROJECT_ROOT}`);
  console.log(`Open http://localhost:${PORT} in your browser`);
});