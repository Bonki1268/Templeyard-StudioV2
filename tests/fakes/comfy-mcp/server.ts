import { createHash, randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

// 假的 Comfy Cloud MCP 伺服器：行為照 docs/07-實測紀錄.md 與 docs/reference/comfyui-test/server.mjs
// - initialize 回 Mcp-Session-Id；之後每次要帶，不認得的 session 回 404（過期）
// - 沒帶 X-API-Key 或錯誤時回 401
// - 付費工具第一次呼叫回一段要求確認的文字、不建立任務；帶 confirm: true 才回 prompt_id
// - get_job_status 回 { result: { status, job_status, raw_status } }
// - get_output 回短連結與 storage 連結，短連結可以下載
// 任務結果由指令裡的標記決定：[fail] 失敗、[cancel] 取消、[never] 一直在跑、[slow] 第 40 次查詢才完成、其他第 2 次查詢時完成
// - fake_upload_file：假的上傳工具（真的上傳方式待實測，07「下一輪測試」第 1 項），回 { file_ref }，記下收到的檔案 sha256
// - GET /__calls：情境測試查詢收到的呼叫與上傳（只有假伺服器有）

export const FAKE_API_KEY = 'fake-comfy-key';
export const FAKE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

type Job = { id: string; tool: string; prompt: string; polls: number };
export type RecordedCall = { method: string; tool?: string; args?: Record<string, unknown>; sessionId?: string };
export type RecordedUpload = { ref: string; sha256: string; mime: string; filename: string };

export type FakeComfyMcp = {
  url: string;
  calls: RecordedCall[];
  jobs: Map<string, Job>;
  uploads: RecordedUpload[];
  /** 讓目前所有 session 失效，下一次請求會收到 404 */
  expireSessions(): void;
  /** 之後的回應改用 text/event-stream（真的 MCP 有時這樣回） */
  useEventStream(on: boolean): void;
  close(): Promise<void>;
};

function promptOf(args: Record<string, unknown>): string {
  if (typeof args.prompt === 'string') return args.prompt;
  return JSON.stringify(args.input_overrides ?? {});
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

export async function startFakeComfyMcp(options: { port?: number } = {}): Promise<FakeComfyMcp> {
  const sessions = new Set<string>();
  const jobs = new Map<string, Job>();
  const calls: RecordedCall[] = [];
  const uploads: RecordedUpload[] = [];
  let eventStream = false;
  let base = '';

  function reply(res: ServerResponse, id: unknown, result: unknown, headers: Record<string, string> = {}) {
    const message = JSON.stringify({ jsonrpc: '2.0', id, result });
    if (eventStream) {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', ...headers });
      res.end(`event: message\ndata: ${message}\n\n`);
    } else {
      res.writeHead(200, { 'Content-Type': 'application/json', ...headers });
      res.end(message);
    }
  }

  const text = (value: string, isError = false) => ({ content: [{ type: 'text', text: value }], isError });

  function callTool(tool: string, args: Record<string, unknown>) {
    if (tool === 'partner_generate' || tool === 'run_template') {
      if (args.confirm !== true) {
        return text('This generation will spend about 124 credits. Ask the user, then call again with confirm: true to proceed.');
      }
      const id = randomUUID();
      jobs.set(id, { id, tool, prompt: promptOf(args), polls: 0 });
      return text(JSON.stringify({ prompt_id: id, status: 'queued' }));
    }
    if (tool === 'fake_upload_file') {
      if (typeof args.data_base64 !== 'string' || args.data_base64 === '') return text('沒有檔案內容', true);
      const sha256 = createHash('sha256').update(Buffer.from(args.data_base64, 'base64')).digest('hex');
      const ref = `fake-ref-${sha256.slice(0, 12)}-${uploads.length + 1}`;
      uploads.push({ ref, sha256, mime: String(args.mime ?? ''), filename: String(args.filename ?? '') });
      return { ...text(JSON.stringify({ file_ref: ref })), structuredContent: { file_ref: ref } };
    }
    if (tool === 'get_job_status') {
      const job = jobs.get(String(args.prompt_id));
      if (!job) return text('找不到這個任務', true);
      job.polls += 1;
      const needed = job.prompt.includes('[slow]') ? 40 : 2;
      let status = job.polls >= needed ? 'completed' : 'running';
      if (job.prompt.includes('[never]')) status = 'running';
      if (job.prompt.includes('[fail]') && job.polls >= 2) status = 'failed';
      if (job.prompt.includes('[cancel]') && job.polls >= 2) status = 'cancelled';
      const result = {
        status: status === 'completed' ? 'succeeded' : status,
        job_status: status,
        raw_status: status,
        ...(status === 'failed' ? { error_message: '假的雲端錯誤：內容未通過審查' } : {}),
      };
      return { ...text(JSON.stringify({ result })), structuredContent: { result } };
    }
    if (tool === 'get_output') {
      const job = jobs.get(String(args.prompt_id));
      if (!job) return text('找不到這個任務', true);
      return text(
        `Outputs:\n- ${base}/api/s/${job.id}\n- https://storage.googleapis.com/fake-bucket/${job.id}.png?X-Goog-Signature=abc\\u0026x=1`,
      );
    }
    return text(`未知的工具：${tool}`, true);
  }

  const server = createServer(async (req, res) => {
    if (req.method === 'GET' && req.url === '/__calls') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ calls, uploads }));
      return;
    }
    if (req.method === 'GET' && req.url?.startsWith('/api/s/')) {
      const id = req.url.slice('/api/s/'.length);
      if (!jobs.has(id)) {
        res.writeHead(404).end();
        return;
      }
      res.writeHead(200, { 'Content-Type': 'image/png' });
      res.end(FAKE_PNG);
      return;
    }
    if (req.method !== 'POST') {
      res.writeHead(405).end();
      return;
    }
    if (req.headers['x-api-key'] !== FAKE_API_KEY) {
      res.writeHead(401, { 'Content-Type': 'application/json' }).end('{"error":"unauthorized"}');
      return;
    }
    const body = JSON.parse(await readBody(req)) as { id?: unknown; method: string; params?: Record<string, unknown> };
    const sessionHeader = req.headers['mcp-session-id'];
    const sessionId = typeof sessionHeader === 'string' ? sessionHeader : undefined;

    if (body.method === 'initialize') {
      const id = randomUUID();
      sessions.add(id);
      calls.push({ method: 'initialize', sessionId: id });
      reply(res, body.id, { protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'fake-comfy', version: '0' } }, {
        'Mcp-Session-Id': id,
      });
      return;
    }
    if (!sessionId || !sessions.has(sessionId)) {
      res.writeHead(404).end();
      return;
    }
    if (body.method === 'notifications/initialized') {
      calls.push({ method: body.method, sessionId });
      res.writeHead(202).end();
      return;
    }
    if (body.method === 'tools/call') {
      const tool = String(body.params?.name);
      const args = (body.params?.arguments ?? {}) as Record<string, unknown>;
      calls.push({ method: 'tools/call', tool, args, sessionId });
      reply(res, body.id, callTool(tool, args));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, error: { code: -32601, message: `未知的方法：${body.method}` } }));
  });

  await new Promise<void>((resolve) => server.listen(options.port ?? 0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  return {
    url: `${base}/mcp`,
    calls,
    jobs,
    uploads,
    expireSessions: () => sessions.clear(),
    useEventStream: (on) => {
      eventStream = on;
    },
    close: () => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  };
}
