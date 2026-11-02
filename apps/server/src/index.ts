import { buildApp } from './app.js';

const port = Number(process.env.API_PORT ?? 3001);
const app = buildApp();

app.listen({ port, host: '127.0.0.1' }).then(
  () => {
    console.log(`廟埕影室後端已啟動：http://127.0.0.1:${port}`);
  },
  (error: unknown) => {
    console.error('後端啟動失敗', error);
    process.exit(1);
  },
);
