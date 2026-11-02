import Fastify, { type FastifyInstance } from 'fastify';
import type { HealthResponse } from '@templeyard/shared';
import type { AppDatabase } from './db/client.js';
import { registerTempleRoutes } from './routes/temples.js';

export type AppDeps = {
  db: AppDatabase;
};

// 建立 Fastify 應用；路由在這裡註冊，方便測試用 inject 呼叫。
export function buildApp(deps: AppDeps): FastifyInstance {
  const app = Fastify({ logger: false });

  app.get('/api/health', async (): Promise<HealthResponse> => ({ status: 'ok' }));
  registerTempleRoutes(app, deps.db);

  return app;
}
