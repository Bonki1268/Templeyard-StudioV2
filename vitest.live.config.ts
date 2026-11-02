import { defineConfig } from 'vitest/config';

// 真的呼叫外部服務（要花錢）：只有使用者能執行 pnpm test:live。
export default defineConfig({
  test: {
    include: ['**/*.live.test.ts'],
    exclude: ['**/node_modules/**'],
    passWithNoTests: true,
  },
});
