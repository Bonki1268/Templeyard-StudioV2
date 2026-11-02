import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// 單元與整合測試：測試檔放在被測檔案旁（*.test.ts／*.test.tsx）。
// 每個專案以自己的資料夾為根目錄，才解析得到各自的依賴。
export default defineConfig({
  test: {
    projects: [
      {
        root: 'apps/server',
        test: {
          name: 'server',
          include: ['src/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'packages',
          include: ['packages/*/src/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        root: 'apps/web',
        plugins: [react()],
        test: {
          name: 'web',
          include: ['src/**/*.test.{ts,tsx}'],
          environment: 'jsdom',
          setupFiles: ['./src/test-setup.ts'],
        },
      },
    ],
  },
});
