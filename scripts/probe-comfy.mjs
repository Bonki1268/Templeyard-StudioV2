#!/usr/bin/env node
// Comfy Cloud MCP 探測腳本（docs/07-實測紀錄.md「下一輪測試」）：只有使用者能執行，Claude Code 不執行。
//
// 用法：
//   pnpm probe:comfy                     第 1 輪（不花錢）：tools/list、範本的參數格式、搜尋可用範本
//   pnpm probe:comfy -- --requests <檔>  第 2 輪預演：只做不花錢的呼叫（例如上傳），付費的那幾筆只印出會送什麼，不呼叫
//   pnpm probe:comfy -- --requests <檔> --confirm
//                                        第 2 輪真的送出：付費的每一筆先不帶 confirm 取得雲端的扣點說明，
//                                        在終端機問你「要送出嗎？」，輸入 y 才帶 confirm: true 送出，完成後下載產出
//
// 金鑰：讀環境變數 COMFY_CLOUD_API_KEY 與 COMFY_MCP_URL；沒有設定時讀 repo 根目錄的 .env.local。
// 結果：存在 data/probe/<時間>/（已列入 .gitignore）。檔案裡不會寫入金鑰，可以整個資料夾交給 Claude Code。

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envFile = path.join(repoRoot, '.env.local');
// 用假的 MCP 驗證這支腳本時設定 TEMPLEYARD_NO_ENV_FILE，不讀 .env.local
if (!process.env.TEMPLEYARD_NO_ENV_FILE && existsSync(envFile)) process.loadEnvFile(envFile);

const API_KEY = process.env.COMFY_CLOUD_API_KEY ?? '';
const MCP_URL = process.env.COMFY_MCP_URL ?? '';
if (!API_KEY || !MCP_URL) {
  console.error('沒有設定 COMFY_CLOUD_API_KEY 或 COMFY_MCP_URL（放在 .env.local），不能探測。');
  process.exit(1);
}

const args = process.argv.slice(2);
const requestsFile = args.includes('--requests') ? args[args.indexOf('--requests') + 1] : null;
const confirm = args.includes('--confirm');

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outDir = path.join(repoRoot, 'data', 'probe', stamp);
mkdirSync(outDir, { recursive: true });

/** 寫進結果前把金鑰遮掉（以防回應裡帶回請求內容） */
function redact(value) {
  return JSON.stringify(value, null, 2).split(API_KEY).join('[金鑰已遮蔽]');
}

function save(name, value) {
  writeFileSync(path.join(outDir, name), `${redact(value)}\n`);
  console.log(`  已存：data/probe/${stamp}/${name}`);
}

// ── MCP 用戶端（照 docs/reference/comfyui-test/server.mjs，已實測可用） ──

let sessionId = null;
let rpcId = 0;

async function rpcPost(body) {
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'X-API-Key': API_KEY };
  if (sessionId) headers['Mcp-Session-Id'] = sessionId;
  const res = await fetch(MCP_URL, { method: 'POST', headers, body: JSON.stringify(body) });
  const sid = res.headers.get('mcp-session-id');
  if (sid) sessionId = sid;
  const text = await res.text();
  if (res.status === 401 || res.status === 403) throw new Error('Comfy Cloud 拒絕了這組 API key，請確認 .env.local 的 COMFY_CLOUD_API_KEY');
  if (!res.ok && res.status !== 202) throw new Error(`Comfy Cloud 回應 HTTP ${res.status}：${text.slice(0, 300)}`);
  if (body.id === undefined) return null;
  const messages = (res.headers.get('content-type') || '').includes('text/event-stream')
    ? text
        .split(/\r?\n/)
        .filter((line) => line.startsWith('data:'))
        .map((line) => JSON.parse(line.slice(5)))
    : [JSON.parse(text)];
  const reply = messages.find((m) => m.id === body.id);
  if (!reply) throw new Error('Comfy Cloud 沒有回傳對應的結果');
  if (reply.error) throw new Error(reply.error.message || 'Comfy Cloud 回傳錯誤');
  return reply.result;
}

async function ensureSession() {
  if (sessionId) return;
  await rpcPost({
    jsonrpc: '2.0',
    id: ++rpcId,
    method: 'initialize',
    params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'templeyard-probe', version: '1.0.0' } },
  });
  await rpcPost({ jsonrpc: '2.0', method: 'notifications/initialized' });
}

async function rpc(method, params) {
  await ensureSession();
  return rpcPost({ jsonrpc: '2.0', id: ++rpcId, method, params });
}

/** 呼叫工具；失敗時記下錯誤，不中斷整個探測 */
async function tool(name, toolArgs) {
  try {
    const result = await rpc('tools/call', { name, arguments: toolArgs });
    const text = (result.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n');
    return { ok: !result.isError, text, structured: result.structuredContent ?? null, raw: result };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

// ── 第 1 輪：不花錢的探測 ──

/** 只列出工具名稱、說明與參數格式；這些工具都不會建立任務 */
const FREE_CALLS = [
  // 07 第 2 項：Gemini 的範本參數（文字、圖片、參考圖生成影片；首尾畫格在 i2v 範本）
  ['get_template_schema', { template_id: 'api_google_gemini_omni_flash_1_1_t2v' }],
  ['get_template_schema', { template_id: 'api_google_gemini_omni_flash_1_1_i2v' }],
  ['get_template_schema', { template_id: 'api_google_gemini_omni_flash_1_1_r2v' }],
  // Seedance 2.0 首尾畫格
  ['get_template_schema', { template_id: 'api_seedance2_0_flf2v' }],
  // 07 第 7 項：Wan 首尾畫格與多關鍵畫格
  ['get_template_schema', { template_id: 'video_wan2_2_14B_flf2v' }],
  ['get_template_schema', { template_id: 'video_wan_vace_flf2v' }],
  // 07 第 4 項：Nano Banana Pro 怎麼收參考圖
  ['get_prompting_guide', { model: 'vertexai' }],
  ['get_prompting_guide', { model: 'gemini' }],
  // 範本的扣點預估（只讀、不送出）
  ['estimate_credits', { template_name: 'api_google_gemini_omni_flash_1_1_i2v' }],
  ['estimate_credits', { template_name: 'api_seedance2_0_flf2v' }],
];

async function roundOne() {
  console.log('第 1 輪（不花錢）：列出工具與參數格式');
  const listed = await rpc('tools/list', {});
  save('tools-list.json', listed);
  const tools = listed?.tools ?? [];
  const pick = (name) => tools.find((t) => t.name === name) ?? null;
  // 07 第 1 項：上傳本機圖片與兩個生成工具的參數格式
  save('tool-schemas.json', {
    upload_file: pick('upload_file'),
    partner_generate: pick('partner_generate'),
    run_template: pick('run_template'),
    get_output: pick('get_output'),
    use_previous_output: pick('use_previous_output'),
    estimate_credits: pick('estimate_credits'),
  });
  const results = [];
  for (const [name, toolArgs] of FREE_CALLS) {
    if (!pick(name)) {
      results.push({ name, args: toolArgs, skipped: '這個工具不在 tools/list 裡' });
      continue;
    }
    console.log(`  呼叫 ${name} ${JSON.stringify(toolArgs)}`);
    results.push({ name, args: toolArgs, result: await tool(name, toolArgs) });
  }
  save('free-calls.json', results);
  await probeUpload();
  console.log('\n第 1 輪完成，沒有花錢。請把 data/probe/ 底下這次的資料夾交給 Claude Code，它會依結果寫好第 2 輪的請求檔。');
}

// ── 第 1 輪：上傳一張合成的測試圖（不花錢；不是照片，沒有人臉） ──

/** 從 upload_file 的回應找出上傳網址與 header（回應是一行要在使用者 shell 執行的 PUT 指令） */
function parseUploadCommand(text) {
  const url = /https:\/\/[^\s'"]+/.exec(text)?.[0] ?? null;
  const headers = {};
  for (const match of text.matchAll(/-H\s+['"]([^:'"]+):\s*([^'"]+)['"]/g)) headers[match[1]] = match[2];
  return { url, headers };
}

async function probeUpload() {
  if (!(await rpc('tools/list', {}))?.tools?.some((t) => t.name === 'upload_file')) return;
  // 1×1 的灰色 PNG（合成的，不是照片）
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR42mN4+vQpAAZ8Av5L2y3jAAAAAElFTkSuQmCC', 'base64');
  const file = path.join(outDir, 'probe-upload.png');
  writeFileSync(file, png);
  console.log('  上傳一張合成的測試圖（不花錢）');
  const requested = await tool('upload_file', { file_path: file, client_os: 'darwin' });
  // 一次性的上傳網址帶有簽章：存檔時去掉網址的查詢字串
  const hideSignature = (value) => JSON.parse(JSON.stringify(value ?? null).replace(/(https:\/\/[^\s'"?\\]+)\?[^\s'"\\]+/g, '$1?…'));
  const record = {
    request: { file_path: file, client_os: 'darwin' },
    response: { ok: requested.ok, text: hideSignature(requested.text), structured: hideSignature(requested.structured), error: requested.error },
  };
  const { url, headers } = parseUploadCommand(`${requested.text ?? ''} ${JSON.stringify(requested.structured ?? {})}`);
  record.parsed = { url: url ? `${url.split('?')[0]}?…（已省略簽章）` : null, headers };
  if (url) {
    try {
      const put = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'image/png', ...headers }, body: png });
      record.put = { status: put.status, body: (await put.text()).slice(0, 2000) };
    } catch (error) {
      record.put = { error: error instanceof Error ? error.message : String(error) };
    }
  }
  save('upload.json', record);
}

// ── 第 2 輪：依請求檔送出（預設只取得扣點說明，加 --confirm 才真的生成） ──

/**
 * 請求檔格式（由 Claude Code 依第 1 輪結果產生）：
 * [{ "label": "說明", "tool": "upload_file" | "partner_generate" | "run_template" | ..., "args": { ... },
 *    "paid": true/false, "file": "要上傳的檔案（相對 repo 根目錄，選填）", "fileArg": "檔案 base64 放在 args 的哪個欄位（選填）" }]
 * - paid 為 false 的工具（例如上傳）直接呼叫
 * - paid 為 true：沒有 --confirm 時只送不帶 confirm 的那次，記下雲端回的扣點說明；有 --confirm 才帶 confirm: true
 * - 上一筆的結果可以用 "{{prev.<欄位>}}" 帶進下一筆（例如上傳回來的檔案參照）
 */
function fillPrevious(value, previous) {
  if (typeof value === 'string') {
    return value.replace(/\{\{prev\.([\w.]+)\}\}/g, (_, key) => {
      let node = previous;
      for (const part of key.split('.')) node = node?.[part];
      return node === undefined ? '' : String(node);
    });
  }
  if (Array.isArray(value)) return value.map((item) => fillPrevious(item, previous));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fillPrevious(v, previous)]));
  return value;
}

function parsed(result) {
  if (result.structured) return result.structured;
  try {
    return JSON.parse(result.text ?? '');
  } catch {
    return { text: result.text };
  }
}

async function waitJob(promptId) {
  for (let i = 0; i < 300; i += 1) {
    const status = await tool('get_job_status', { prompt_id: promptId });
    const data = parsed(status);
    const state = data?.result?.status ?? data?.status ?? '';
    if (['succeeded', 'completed', 'failed', 'cancelled', 'error'].includes(String(state))) return status;
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  return { ok: false, error: '等了 25 分鐘還沒完成' };
}

async function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await rl.question(question);
  } finally {
    rl.close();
  }
}

async function roundTwo(file) {
  const requests = JSON.parse(readFileSync(path.resolve(repoRoot, file), 'utf8'));
  console.log(confirm ? '第 2 輪：付費的每一筆會先顯示扣點說明，問過你才送出' : '第 2 輪預演：付費的呼叫不送出');
  const results = [];
  let previous = {};
  for (const request of requests) {
    const toolArgs = fillPrevious(structuredClone(request.args ?? {}), previous);
    if (request.file && request.fileArg) toolArgs[request.fileArg] = readFileSync(path.resolve(repoRoot, request.file)).toString('base64');
    console.log(`  ${request.label}`);
    if (!request.paid) {
      const result = await tool(request.tool, toolArgs);
      previous = parsed(result);
      results.push({ label: request.label, tool: request.tool, result: { ...result, raw: undefined }, parsed: previous });
      continue;
    }
    const entry = { label: request.label, tool: request.tool, args: toolArgs };
    if (!confirm) {
      // 預演：付費的呼叫一律不送，只記下會送什麼
      console.log(`    （預演，沒有送出）${request.tool} ${JSON.stringify(toolArgs).slice(0, 300)}`);
      results.push(entry);
      continue;
    }
    // 先不帶 confirm：雲端回扣點說明、不建立任務（07 已實測）；問過你才帶 confirm: true
    const estimate = await tool(request.tool, toolArgs);
    entry.estimate = estimate.text ?? estimate.error;
    console.log(`    雲端的扣點說明：${entry.estimate}`);
    const answer = await ask('    要送出嗎？輸入 y 送出，其他鍵略過：');
    if (answer.trim().toLowerCase() === 'y') {
      const submitted = await tool(request.tool, { ...toolArgs, confirm: true });
      const data = parsed(submitted);
      entry.submitted = data;
      const promptId = data?.prompt_id ?? data?.result?.prompt_id;
      if (promptId) {
        entry.status = parsed(await waitJob(promptId));
        entry.output = parsed(await tool('get_output', { prompt_id: promptId, client_os: 'darwin', inline_urls: false }));
      }
      previous = data;
    } else {
      entry.skipped = '使用者略過';
    }
    results.push(entry);
  }
  save(confirm ? 'paid-results.json' : 'estimates.json', results);
  console.log(confirm ? '\n第 2 輪完成。請到 Comfy Cloud 帳單頁記下實際扣點，連同 data/probe/ 這次的資料夾交給 Claude Code。' : '\n預演完成，付費的呼叫都沒有送出。確認內容後加上 --confirm 再跑一次。');
}

try {
  if (requestsFile) await roundTwo(requestsFile);
  else await roundOne();
} catch (error) {
  console.error(`探測失敗：${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
