// Local bridge between the web page and Comfy Cloud's MCP server.
// The API key stays here; the browser only ever talks to this process.
import { createServer } from 'node:http';
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { writeFile, rename } from 'node:fs/promises';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
if (existsSync(join(ROOT, '.env'))) process.loadEnvFile(join(ROOT, '.env'));

const PORT = Number(process.env.PORT || 5180);
const MCP_URL = process.env.COMFY_MCP_URL || 'https://cloud.comfy.org/mcp';
const API_KEY = (process.env.COMFY_API_KEY || '').trim();
const POLL_MS = Number(process.env.POLL_MS || 4000);
const JOB_TIMEOUT_MS = 20 * 60 * 1000;
const PUBLIC_DIR = join(ROOT, 'public');
const OUTPUT_DIR = join(ROOT, 'outputs');
const HISTORY_FILE = join(OUTPUT_DIR, 'history.json');
mkdirSync(OUTPUT_DIR, { recursive: true });

// ---------------------------------------------------------------- models

const SIZES = {
  '1:1': [1024, 1024],
  '16:9': [1344, 768],
  '9:16': [768, 1344],
  '4:3': [1152, 864],
  '3:4': [864, 1152],
};
const partner = (type, model, extra = {}) => ({ tool: 'partner_generate', args: { type, model, client_os: 'darwin', ...extra } });
const withAspect = (o) => o.aspect ? { aspect_ratio: o.aspect } : {};

const MODELS = [
  {
    id: 'z-image-turbo', media: 'image', label: 'Z-Image Turbo', note: '開源模型，無付費 API 節點',
    aspects: ['1:1', '16:9', '9:16', '4:3', '3:4'],
    build: ({ prompt, aspect }) => {
      const [width, height] = SIZES[aspect] || SIZES['1:1'];
      return {
        tool: 'run_template',
        args: {
          name: 'image_z_image_turbo',
          slot_overrides: {
            '57.text': prompt, '57.width': width, '57.height': height,
            '57.seed': Math.floor(Math.random() * 2 ** 32),
          },
        },
      };
    },
  },
  {
    id: 'nano-banana-2-lite', media: 'image', label: 'Nano Banana 2 Lite', note: '低價草稿',
    aspects: ['1:1', '16:9', '9:16', '4:3', '3:4'],
    build: (o) => partner('image', 'vertexai/nano-banana-2-lite', { prompt: o.prompt, ...withAspect(o) }),
  },
  {
    id: 'nano-banana-2', media: 'image', label: 'Nano Banana 2', note: '通用',
    aspects: ['1:1', '16:9', '9:16', '4:3', '3:4'],
    build: (o) => partner('image', 'vertexai/nano-banana-2', { prompt: o.prompt, ...withAspect(o) }),
  },
  {
    id: 'nano-banana-pro', media: 'image', label: 'Nano Banana Pro', note: 'Gemini 3 Pro Image，高品質',
    aspects: ['1:1', '16:9', '9:16', '4:3', '3:4'],
    build: (o) => partner('image', 'vertexai/nano-banana-pro', { prompt: o.prompt, ...withAspect(o) }),
  },
  {
    id: 'flux-2-pro', media: 'image', label: 'Flux 2 Pro', note: '高品質',
    aspects: ['1:1', '16:9', '9:16', '4:3', '3:4'],
    build: (o) => partner('image', 'bfl/flux-2-pro', { prompt: o.prompt, ...withAspect(o) }),
  },
  {
    id: 'qwen-image-3', media: 'image', label: 'Qwen Image 3', note: '擅長中英文字排版',
    aspects: ['1:1', '16:9', '9:16', '4:3', '3:4'],
    build: ({ prompt, aspect }) => {
      const [width, height] = SIZES[aspect] || SIZES['1:1'];
      return partner('image', 'qwen/qwen-image-3', { prompt, params: { width, height, seed: Math.floor(Math.random() * 2 ** 31) } });
    },
  },
  {
    id: 'seedance-mini', media: 'video', label: 'Seedance 2.0 Mini', note: '低價快速草稿',
    aspects: ['16:9', '9:16', '1:1'], durations: [5, 8, 10, 15],
    build: ({ prompt, aspect, duration }) => partner('video', 'byteplus/seedance-2.0-t2v', {
      prompt, params: { model: 'Seedance 2.0 Mini', resolution: '720p', ratio: aspect, duration },
    }),
  },
  {
    id: 'kling-turbo', media: 'video', label: 'Kling 3.0 Turbo', note: '速度優先，含原生音訊',
    aspects: ['16:9', '9:16', '1:1'], durations: [5, 10, 15],
    build: ({ prompt, aspect, duration }) => partner('video', 'kling/kling-3.0-turbo-t2v', {
      prompt, aspect_ratio: aspect, params: { resolution: '720p', duration },
    }),
  },
  {
    id: 'ltx-2-5', media: 'video', label: 'LTX-2.5 Fast', note: '含 AI 音訊',
    aspects: ['16:9', '9:16'], durations: [4, 6, 8, 10],
    build: ({ prompt, aspect, duration }) => partner('video', 'ltx/ltx-2-5-t2v', {
      prompt,
      params: {
        model: 'LTX-2.5 (Fast)', duration: String(duration),
        resolution: aspect === '9:16' ? '1080x1920' : '1920x1080', generate_audio: true,
      },
    }),
  },
  {
    id: 'veo-lite', media: 'video', label: 'Veo 3.1 Lite', note: 'Google Veo 輕量版',
    aspects: ['16:9', '9:16'], durations: [4, 6, 8],
    build: ({ prompt, aspect, duration }) => partner('video', 'veo/veo-3-t2v', {
      prompt, aspect_ratio: aspect, params: { model: 'veo-3.1-lite', duration_seconds: duration },
    }),
  },
  {
    // Gemini Omni has no partner_generate slug; it runs through the GeminiVideoOmniV2 template.
    // Length is not a widget — the model reads it from the prompt (3–10 s).
    id: 'gemini-omni', media: 'video', label: 'Gemini Omni 1.1 Flash', note: '含音訊，約 31 credits/秒',
    aspects: ['16:9', '9:16'], durations: [4, 6, 8, 10],
    build: ({ prompt, aspect, duration }) => ({
      tool: 'run_template',
      args: {
        name: 'api_google_gemini_omni_flash_1_1_t2v',
        input_overrides: {
          26: {
            'model.prompt': `A ${duration}-second, ${aspect} clip. ${prompt}`,
            'model.aspect_ratio': aspect,
            'model.resolution': '720p',
            'model.task_type': 'text_to_video',
            'model.seed': Math.floor(Math.random() * 2 ** 31),
          },
        },
      },
    }),
  },
  {
    id: 'ace-step', media: 'audio', label: 'ACE-Step 音樂', note: '純音樂，描述曲風即可',
    durations: [30, 60, 120],
    build: ({ prompt, duration }) => ({
      tool: 'run_template',
      args: {
        name: 'audio_ace_step1_5_xl_turbo',
        input_overrides: {
          94: { tags: prompt, lyrics: '[Instrumental]', duration },
          98: { seconds: duration },
          109: { value: Math.floor(Math.random() * 2 ** 31) },
        },
      },
    }),
  },
  {
    id: 'elevenlabs-sfx', media: 'audio', label: 'ElevenLabs 音效', note: '短音效',
    durations: [3, 5, 10, 20, 30],
    build: ({ prompt, duration }) => partner('audio', 'elevenlabs/sound-generation', { prompt, params: { duration } }),
  },
];

// ---------------------------------------------------------------- MCP client

let sessionId = null;
let rpcId = 0;

async function rpcPost(body) {
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
    'X-API-Key': API_KEY,
  };
  if (sessionId) headers['Mcp-Session-Id'] = sessionId;
  const res = await fetch(MCP_URL, { method: 'POST', headers, body: JSON.stringify(body) });
  const sid = res.headers.get('mcp-session-id');
  if (sid) sessionId = sid;
  const text = await res.text();
  if (res.status === 401 || res.status === 403) {
    throw new UserError('Comfy Cloud 拒絕了這組 API key，請確認 .env 裡的 COMFY_API_KEY 是否正確。');
  }
  if (res.status === 404 && sessionId) throw new SessionExpired();
  if (!res.ok && res.status !== 202) throw new Error(`Comfy Cloud 回應 HTTP ${res.status}`);
  if (body.id === undefined) return null;
  const messages = (res.headers.get('content-type') || '').includes('text/event-stream')
    ? text.split(/\r?\n/).filter((l) => l.startsWith('data:')).map((l) => JSON.parse(l.slice(5)))
    : [JSON.parse(text)];
  const reply = messages.find((m) => m.id === body.id);
  if (!reply) throw new Error('Comfy Cloud 沒有回傳對應的結果');
  if (reply.error) throw new Error(reply.error.message || 'Comfy Cloud 回傳錯誤');
  return reply.result;
}

class UserError extends Error {}
class SessionExpired extends Error {}

let initializing = null;
function ensureSession() {
  if (sessionId) return Promise.resolve();
  initializing ||= (async () => {
    await rpcPost({
      jsonrpc: '2.0', id: ++rpcId, method: 'initialize',
      params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'comfy-studio', version: '1.0.0' } },
    });
    await rpcPost({ jsonrpc: '2.0', method: 'notifications/initialized' });
  })().finally(() => { initializing = null; });
  return initializing;
}

async function callTool(name, args) {
  for (let attempt = 0; ; attempt++) {
    await ensureSession();
    try {
      const result = await rpcPost({ jsonrpc: '2.0', id: ++rpcId, method: 'tools/call', params: { name, arguments: args } });
      const text = (result.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n');
      let data = result.structuredContent;
      if (!data) { try { data = JSON.parse(text); } catch { data = null; } }
      return { isError: !!result.isError, text, data };
    } catch (err) {
      if (err instanceof SessionExpired && attempt === 0) { sessionId = null; continue; }
      throw err;
    }
  }
}

// ---------------------------------------------------------------- results

const flat = (r) => `${JSON.stringify(r.data ?? '')}\n${r.text}`;

function findPromptId(r) {
  const m = flat(r).match(/\\?"prompt_id\\?"\s*:\s*\\?"([\w-]+)/);
  return m ? m[1] : null;
}

// Real shape: { result: { status: "succeeded", job_status: "completed", raw_status: "completed" } }.
// job_status is the documented lifecycle value, so it wins over the outcome-style result.status.
function findStatus(r) {
  const d = r.data && typeof r.data === 'object' ? r.data : {};
  const value = d.result?.job_status || d.job_status || d.result?.status || d.status;
  if (typeof value === 'string') return value;
  const m = flat(r).match(/\\?"(?:job_status|status)\\?"\s*:\s*\\?"(\w+)/);
  return m ? m[1] : null;
}

const DONE = new Set(['completed', 'succeeded', 'success']);
const FAILED = new Set(['error', 'failed', 'failure']);

// Prefers the provider's explanation; never shows a bare status object to the person.
function failureMessage(r) {
  const d = r.data && typeof r.data === 'object' ? r.data : null;
  const found = d && [d, d.result].filter(Boolean)
    .flatMap((o) => [o.error_message, o.message, o.error?.message, o.error, o.details])
    .find((v) => typeof v === 'string' && v);
  if (found) return found.slice(0, 500);
  if (!d && r.text) return r.text.slice(0, 500);
  return '生成失敗，Comfy Cloud 沒有提供原因。';
}

// Collects output links; shortlinks win over signed storage URLs for the same result.
function findFileUrls(r) {
  const body = flat(r).replace(/\\u0026/g, '&').replace(/\\\//g, '/');
  const urls = [...new Set(body.match(/https?:\/\/[^\s"'\\<>)`]+/g) || [])];
  const short = urls.filter((u) => /\/api\/s\//.test(u));
  if (short.length) return short;
  return urls.filter((u) => /storage\.googleapis\.com|\/api\/view/.test(u));
}

const EXT = {
  'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif',
  'video/mp4': '.mp4', 'video/webm': '.webm', 'video/quicktime': '.mov',
  'audio/mpeg': '.mp3', 'audio/mp3': '.mp3', 'audio/wav': '.wav', 'audio/x-wav': '.wav',
  'audio/flac': '.flac', 'audio/ogg': '.ogg', 'audio/mp4': '.m4a',
};

async function download(url, base) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`下載產出檔案失敗（HTTP ${res.status}）`);
  const type = (res.headers.get('content-type') || '').split(';')[0].trim();
  const urlExt = extname(new URL(url).pathname).toLowerCase();
  const ext = EXT[type] || (Object.values(EXT).includes(urlExt) ? urlExt : '.bin');
  const file = `${base}${ext}`;
  await writeFile(join(OUTPUT_DIR, file), Buffer.from(await res.arrayBuffer()));
  return file;
}

// ---------------------------------------------------------------- jobs

let items = [];
try { items = JSON.parse(readFileSync(HISTORY_FILE, 'utf8')); } catch { items = []; }

let saveQueue = Promise.resolve();
function save() {
  const snapshot = JSON.stringify(items, null, 2);
  saveQueue = saveQueue.then(async () => {
    const tmp = `${HISTORY_FILE}.tmp`;
    await writeFile(tmp, snapshot);
    await rename(tmp, HISTORY_FILE);
  }).catch((err) => console.error('無法寫入歷史紀錄：', err.message));
}

const update = (item, patch) => { Object.assign(item, patch); save(); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function collect(item, urls) {
  if (!urls.length) throw new Error('任務完成了，但 Comfy Cloud 沒有回傳可下載的檔案連結');
  const files = [];
  for (let i = 0; i < urls.length; i++) files.push(await download(urls[i], `${item.id}-${i}`));
  update(item, { status: 'done', files, finishedAt: Date.now() });
}

async function track(item) {
  try {
    const started = item.createdAt;
    let failures = 0;
    for (;;) {
      if (Date.now() - started > JOB_TIMEOUT_MS) throw new Error('等待超過 20 分鐘，已停止追蹤；任務可能仍在雲端執行');
      let res;
      try {
        res = await callTool('get_job_status', { prompt_id: item.promptId });
        failures = 0;
      } catch (err) {
        if (err instanceof UserError || ++failures >= 5) throw err;
        await sleep(POLL_MS);
        continue;
      }
      const status = findStatus(res);
      if (DONE.has(status)) break;
      if (FAILED.has(status) || status === 'cancelled' || res.isError) {
        throw new Error(status === 'cancelled' ? '任務已取消' : failureMessage(res));
      }
      await sleep(POLL_MS);
    }
    const output = await callTool('get_output', { prompt_id: item.promptId, client_os: 'darwin', inline_urls: false });
    if (output.isError) throw new Error(output.text.slice(0, 500));
    await collect(item, findFileUrls(output));
  } catch (err) {
    update(item, { status: 'error', error: err.message, finishedAt: Date.now() });
  }
}

// Spend prompts come back as ordinary text, with no job started.
const looksLikeSpendGate = (r) => /confirm/i.test(r.text);

async function generate({ modelId, prompt, aspect, duration, confirm }) {
  const model = MODELS.find((m) => m.id === modelId);
  if (!model) throw new UserError('未知的模型');
  prompt = String(prompt || '').trim();
  if (!prompt) throw new UserError('請輸入描述');
  if (prompt.length > 4000) throw new UserError('描述太長（上限 4000 字）');
  if (model.aspects && !model.aspects.includes(aspect)) throw new UserError('此模型不支援這個比例');
  duration = Number(duration);
  if (model.durations && !model.durations.includes(duration)) throw new UserError('此模型不支援這個長度');

  const { tool, args } = model.build({ prompt, aspect, duration });
  // confirm is only ever true after the person clicks 確認 in the page's spend dialog.
  const res = await callTool(tool, confirm === true ? { ...args, confirm: true } : args);
  const promptId = findPromptId(res);
  const urls = promptId ? [] : findFileUrls(res);

  if (!promptId && !urls.length) {
    if (looksLikeSpendGate(res) && confirm !== true) return { needsConfirmation: true, message: res.text };
    throw new UserError(res.text.slice(0, 800) || 'Comfy Cloud 沒有接受這個任務');
  }

  const item = {
    id: randomUUID(), media: model.media, modelLabel: model.label, prompt, aspect: model.aspects ? aspect : null,
    duration: model.durations ? duration : null, status: 'running', promptId, files: [], createdAt: Date.now(),
  };
  items.unshift(item);
  save();
  if (promptId) track(item);
  else collect(item, urls).catch((err) => update(item, { status: 'error', error: err.message, finishedAt: Date.now() }));
  return { item };
}

// ---------------------------------------------------------------- HTTP

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.flac': 'audio/flac', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4',
};

function json(res, code, body) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function sendFile(req, res, baseDir, relPath) {
  const full = resolve(baseDir, relPath);
  if (!full.startsWith(baseDir + sep) || full === HISTORY_FILE) return json(res, 404, { error: 'not found' });
  let stat;
  try { stat = statSync(full); } catch { return json(res, 404, { error: 'not found' }); }
  if (!stat.isFile()) return json(res, 404, { error: 'not found' });
  const type = MIME[extname(full).toLowerCase()] || 'application/octet-stream';
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  if (range && (range[1] || range[2])) {
    let start = range[1] ? Number(range[1]) : Math.max(stat.size - Number(range[2]), 0);
    let end = range[1] && range[2] ? Math.min(Number(range[2]), stat.size - 1) : stat.size - 1;
    if (start > end || start >= stat.size) {
      res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` });
      return res.end();
    }
    res.writeHead(206, {
      'Content-Type': type, 'Accept-Ranges': 'bytes',
      'Content-Range': `bytes ${start}-${end}/${stat.size}`, 'Content-Length': end - start + 1,
    });
    return createReadStream(full, { start, end }).pipe(res);
  }
  res.writeHead(200, { 'Content-Type': type, 'Content-Length': stat.size, 'Accept-Ranges': 'bytes' });
  createReadStream(full).pipe(res);
}

function readJson(req) {
  return new Promise((ok, fail) => {
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 100_000) { fail(new UserError('請求太大')); req.destroy(); } });
    req.on('end', () => { try { ok(JSON.parse(body || '{}')); } catch { fail(new UserError('請求格式錯誤')); } });
    req.on('error', fail);
  });
}

const server = createServer(async (req, res) => {
  // Other sites must not be able to reach this process and spend credits through it.
  const host = (req.headers.host || '').split(':')[0];
  if (!['localhost', '127.0.0.1'].includes(host)) return json(res, 403, { error: 'forbidden' });

  const { pathname } = new URL(req.url, 'http://localhost');
  try {
    if (pathname === '/api/config' && req.method === 'GET') {
      return json(res, 200, {
        configured: !!API_KEY,
        models: MODELS.map(({ id, media, label, note, aspects, durations }) => ({ id, media, label, note, aspects, durations })),
      });
    }
    if (pathname === '/api/items' && req.method === 'GET') return json(res, 200, { items });
    if (pathname === '/api/generate' && req.method === 'POST') {
      if (!(req.headers['content-type'] || '').startsWith('application/json')) return json(res, 415, { error: 'JSON only' });
      if (!API_KEY) throw new UserError('尚未設定 COMFY_API_KEY，請依照頁面上方的說明設定後重新啟動。');
      return json(res, 200, await generate(await readJson(req)));
    }
    if (pathname.startsWith('/outputs/') && req.method === 'GET') {
      return sendFile(req, res, OUTPUT_DIR, decodeURIComponent(pathname.slice('/outputs/'.length)));
    }
    if (req.method === 'GET') {
      return sendFile(req, res, PUBLIC_DIR, pathname === '/' ? 'index.html' : decodeURIComponent(pathname.slice(1)));
    }
    json(res, 405, { error: 'method not allowed' });
  } catch (err) {
    if (!(err instanceof UserError)) console.error(err);
    json(res, err instanceof UserError ? 400 : 502, { error: err.message });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Comfy Studio：http://localhost:${PORT}`);
  if (!API_KEY) console.log('尚未設定 COMFY_API_KEY，頁面可以開啟，但還無法生成。');
  // Pick back up on jobs that were still running when the server last stopped.
  for (const item of items) {
    if (item.status !== 'running') continue;
    if (item.promptId && API_KEY) track(item);
    else update(item, { status: 'error', error: '伺服器重新啟動，任務已中斷', finishedAt: Date.now() });
  }
});
