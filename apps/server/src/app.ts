import { randomUUID } from 'node:crypto';
import path from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import type { HealthResponse } from '@templeyard/shared';
import { createAssetStore } from './assets/store.js';
import type { AppDatabase } from './db/client.js';
import { resolveDataDir } from './paths.js';
import { registerAssetRoutes } from './routes/assets.js';
import { registerPhotoRoutes } from './routes/photos.js';
import { registerSeriesRoutes } from './routes/series.js';
import { registerTempleRoutes } from './routes/temples.js';
import { registerVideoRoutes } from './routes/videos.js';
import type { Clock } from './series/repository.js';

export type AppDeps = {
  db: AppDatabase;
  /** 測試可注入固定的時間與 ID */
  clock?: Clock;
  /** 檔案資料夾（data/assets/）；測試可指定暫存資料夾 */
  assetsDir?: string;
};

const systemClock: Clock = { now: () => new Date(), newId: () => randomUUID() };

// 建立 Fastify 應用；路由在這裡註冊，方便測試用 inject 呼叫。
export function buildApp(deps: AppDeps): FastifyInstance {
  const app = Fastify({ logger: false });

  app.get('/api/health', async (): Promise<HealthResponse> => ({ status: 'ok' }));
  const clock = deps.clock ?? systemClock;
  const store = createAssetStore(deps.assetsDir ?? path.join(resolveDataDir(), 'assets'));

  registerTempleRoutes(app, deps.db);
  registerSeriesRoutes(app, deps.db, clock);
  registerVideoRoutes(app, deps.db, clock);
  registerPhotoRoutes(app, deps.db, clock, store);
  registerAssetRoutes(app, deps.db, store);

  return app;
}
