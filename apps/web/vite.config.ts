import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 留白時用預設值
const apiPort = process.env.API_PORT?.trim() || '3001';
const webPort = Number(process.env.WEB_PORT?.trim() || 5173);

export default defineConfig({
  plugins: [react()],
  server: {
    port: webPort,
    strictPort: true,
    host: '127.0.0.1',
    // 前端只和本機後端溝通
    proxy: {
      '/api': `http://127.0.0.1:${apiPort}`,
    },
  },
});
