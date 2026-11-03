import { configDefaults, defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// 會花錢的實測（*.live.test.ts）只由 pnpm test:live 執行，pnpm test 一律排除
const exclude = [...configDefaults.exclude, '**/*.live.test.ts'];

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
          exclude,
          // 第 11 階段起有用本機 FFmpeg 合成 1080p 成品的整合測試：單獨跑約 2 秒，
          // 整套並行時多個測試同時編碼會超過預設的 5 秒，放寬到 15 秒
          testTimeout: 15_000,
        },
      },
      {
        test: {
          name: 'packages',
          include: ['packages/*/src/**/*.test.ts'],
          environment: 'node',
          exclude,
        },
      },
      {
        root: 'apps/web',
        plugins: [react()],
        test: {
          name: 'web',
          include: ['src/**/*.test.{ts,tsx}'],
          environment: 'jsdom',
          exclude,
          // 設計 token 的對比測試要讀 tokens.css 的原文（?raw），其他 CSS 照預設不處理
          css: { include: [/tokens\.css/] },
          setupFiles: ['./src/test-setup.ts'],
        },
      },
    ],
  },
});
