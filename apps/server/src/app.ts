import Fastify, { type FastifyInstance } from 'fastify';

// 建立 Fastify 應用；路由在這裡註冊，方便測試用 inject 呼叫。
export function buildApp(): FastifyInstance {
  const app = Fastify({ logger: false });
  return app;
}
