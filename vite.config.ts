import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3200',
        changeOrigin: true,
        secure: false,
        // Улучшенная обработка ошибок подключения
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, res) => {
            // Подавляем спам ошибок ECONNREFUSED
            if (err.code === 'ECONNREFUSED') {
              // Логируем только один раз при первом подключении
              if (!(globalThis as any).__backendConnectionErrorLogged) {
                console.warn('\n⚠️  Backend server не запущен на порту 3200');
                console.warn('   Запустите backend: npm run server\n');
                (globalThis as any).__backendConnectionErrorLogged = true;
              }
              // Возвращаем 503 вместо ошибки соединения
              if (res && !res.headersSent) {
                res.writeHead(503, {
                  'Content-Type': 'application/json',
                });
                res.end(JSON.stringify({
                  success: false,
                  error: 'Backend server unavailable. Please run: npm run server'
                }));
              }
            } else {
              // Для других ошибок логируем как обычно
              console.error('Proxy error:', err);
            }
          });
        },
      },
    },
  },
});