import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';

// 假的 Comfy Cloud MCP 伺服器：行為照 docs/07-實測紀錄.md 與 docs/reference/comfyui-test/server.mjs
// - initialize 回 Mcp-Session-Id；之後每次要帶，不認得的 session 回 404（過期）
// - 沒帶 X-API-Key 或錯誤時回 401
// - 付費工具第一次呼叫回一段要求確認的文字、不建立任務；帶 confirm: true 才回 prompt_id
// - get_job_status 回 { result: { status, job_status, raw_status } }
// - get_output 回短連結與 storage 連結，短連結可以下載
// 任務結果由指令裡的標記決定：[fail] 失敗、[cancel] 取消、[never] 一直在跑、[slow] 第 40 次查詢才完成、其他第 2 次查詢時完成
// - fake_upload_file：假的上傳工具（真的上傳方式待實測，07「下一輪測試」第 1 項），回 { file_ref }，記下收到的檔案 sha256
// - upload_file：照 07 實測（2026-11-03），回一行 PUT 指令到假伺服器的一次性網址 /api/uploads/<token>；
//   PUT 上去回 { name, subfolder: "", type: "input" }，記下收到的檔案 sha256；同一個網址只能用一次（第二次 404）；空檔案回 422
// - tools/list：列出假伺服器認得的工具（探測腳本的本機驗證用）
// - GET /__calls：情境測試查詢收到的呼叫與上傳（只有假伺服器有）
// - 產出依任務種類：影片（partner_generate 的 type 是 video，或範本名稱有 t2v／i2v）回 12 秒 1280×720、30 fps、有聲音的 MP4；
//   音訊（範本名稱有 audio）回 40 秒的 WAV；其他回 1×1 PNG。影片與音訊在啟動時用本機 FFmpeg 產生一次（不花錢）

export const FAKE_API_KEY = 'fake-comfy-key';
export const FAKE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

type JobKind = 'image' | 'video' | 'audio';
type Job = { id: string; tool: string; prompt: string; polls: number; kind: JobKind };

function jobKindOf(args: Record<string, unknown>): JobKind {
  const name = typeof args.name === 'string' ? args.name : '';
  if (args.type === 'video' || /t2v|i2v|video/.test(name)) return 'video';
  if (args.type === 'audio' || /audio/.test(name)) return 'audio';
  return 'image';
}

const media = new Map<JobKind, { mime: string; bytes: Buffer }>();

/** 用本機 FFmpeg 產生假的影片與音訊（只產生一次） */
function fakeMedia(kind: JobKind): { mime: string; bytes: Buffer } {
  if (kind === 'image') return { mime: 'image/png', bytes: FAKE_PNG };
  const cached = media.get(kind);
  if (cached) return cached;
  const dir = mkdtempSync(path.join(tmpdir(), 'fake-comfy-'));
  const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';
  try {
    const file = path.join(dir, kind === 'video' ? 'clip.mp4' : 'music.wav');
    const args =
      kind === 'video'
        ? ['-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=30:duration=12', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=12', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'ultrafast', '-c:a', 'aac', '-shortest', file]
        : ['-f', 'lavfi', '-i', 'sine=frequency=220:duration=40', '-ac', '1', '-ar', '16000', file];
    execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', ...args]);
    const made = { mime: kind === 'video' ? 'video/mp4' : 'audio/wav', bytes: readFileSync(file) };
    media.set(kind, made);
    return made;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
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
  // 啟動時先產生假的影片與音訊，下載時不會卡住（第一次產生要 1～2 秒）
  fakeMedia('video');
  fakeMedia('audio');
  const sessions = new Set<string>();
  const jobs = new Map<string, Job>();
  const calls: RecordedCall[] = [];
  const uploads: RecordedUpload[] = [];
  const uploadTokens = new Map<string, { filename: string }>();
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
      jobs.set(id, { id, tool, prompt: promptOf(args), polls: 0, kind: jobKindOf(args) });
      return text(JSON.stringify({ prompt_id: id, status: 'queued' }));
    }
    if (tool === 'upload_file') {
      if (typeof args.file_path !== 'string' || !['darwin', 'linux', 'windows'].includes(String(args.client_os))) return text('Input validation error: file_path, client_os', true);
      const token = randomUUID().replace(/-/g, '');
      uploadTokens.set(token, { filename: path.basename(args.file_path) });
      return text(
        `This client cannot run shell commands, so hand this command to the user.\n\ncurl -sS --fail-with-body -X PUT -H 'Content-Type: image/png' --upload-file '${args.file_path}' -- '${base}/api/uploads/${token}'\n\nOn success it prints a JSON body like {"name":"...","subfolder":"","type":"input"}.`,
      );
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
    if (req.method === 'PUT' && req.url?.startsWith('/api/uploads/')) {
      const token = req.url.slice('/api/uploads/'.length);
      const pending = uploadTokens.get(token);
      uploadTokens.delete(token);
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const bytes = Buffer.concat(chunks);
      if (!pending) {
        res.writeHead(404).end('{"code":"NOT_FOUND"}');
        return;
      }
      if (bytes.length === 0) {
        res.writeHead(422, { 'Content-Type': 'application/json' }).end('{"code":"INVALID_IMAGE","message":"Uploaded input is not a valid image"}\n');
        return;
      }
      const sha256 = createHash('sha256').update(bytes).digest('hex');
      const name = `${sha256}.png`;
      uploads.push({ ref: name, sha256, mime: String(req.headers['content-type'] ?? ''), filename: pending.filename });
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ name, subfolder: '', type: 'input' }));
      return;
    }
    if (req.method === 'GET' && req.url?.startsWith('/api/s/')) {
      const job = jobs.get(req.url.slice('/api/s/'.length));
      if (!job) {
        res.writeHead(404).end();
        return;
      }
      const file = fakeMedia(job.kind);
      res.writeHead(200, { 'Content-Type': file.mime });
      res.end(file.bytes);
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
    // 探測腳本（scripts/probe-comfy.mjs）用：列出假伺服器認得的工具；參數格式是假的，真的格式要實測
    if (body.method === 'tools/list') {
      calls.push({ method: 'tools/list', sessionId });
      const names = ['partner_generate', 'run_template', 'get_job_status', 'get_output', 'upload_file', 'fake_upload_file'];
      reply(res, body.id, { tools: names.map((name) => ({ name, description: `假的 ${name}`, inputSchema: { type: 'object', properties: {} } })) });
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
