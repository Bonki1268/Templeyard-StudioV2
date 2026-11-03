import { readFileSync } from 'node:fs';
import { createServer, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 假的 Claude API（POST /v1/messages）：依 recordings.json 回覆錄製的回應，記下每次收到的請求。
// 測試把 SDK 的 baseURL 指過來；不會連到真的 Claude API。
// - 沒帶 x-api-key 回 401
// - 依序找第一筆符合的錄製回應：
//   - match：system 裡要出現的文字
//   - matchUser（選填）：所有訊息的文字（含 tool_result 的內容）裡要出現的文字
//   - afterToolResult（選填）：最後一則訊息是不是工具結果（Agent 的工具迴圈用）
// - 回應是 text（一段文字）或 content（內容區塊，可含 tool_use）；有 tool_use 時 stop_reason 是 tool_use
// - 回應裡的替換：{{user}} 是所有訊息的文字、{{lastUser}} 是最後一則使用者文字訊息、{{n}} 是第幾次回應
//   （替換進去的文字以 JSON 字串跳脫：text 多半本身是 JSON；content 解析後就是原文）
// - 沒有符合的錄製回應時回 500（測試寫錯了要看得出來）
// - GET /__requests：情境測試查詢收到的請求

export const FAKE_CLAUDE_API_KEY = 'fake-claude-key';

type Recording = {
  match: string;
  matchUser?: string;
  afterToolResult?: boolean;
  text?: string;
  content?: unknown[];
};
export type RecordedRequest = { model: string; system: string; user: string; tools?: string[] };

type Message = { role?: string; content: unknown };

const here = path.dirname(fileURLToPath(import.meta.url));

function loadRecordings(): Recording[] {
  const file = JSON.parse(readFileSync(path.join(here, 'recordings.json'), 'utf8')) as { recordings: Recording[] };
  return file.recordings;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** 訊息的文字：text 區塊與 tool_result 的內容 */
function textOf(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((block: unknown) => {
      if (!isRecord(block)) return '';
      if (typeof block.text === 'string') return block.text;
      if (block.type === 'tool_result') return textOf(block.content);
      return '';
    })
    .join('');
}

function isToolResult(message: Message | undefined): boolean {
  return Array.isArray(message?.content) && message.content.some((block: unknown) => isRecord(block) && block.type === 'tool_result');
}

/** 最後一則使用者「文字」訊息（略過工具結果） */
function lastUserText(messages: Message[]): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message?.role === 'user' && !isToolResult(message)) return textOf(message.content);
  }
  return '';
}

/** 放進 JSON 字串裡的文字要跳脫 */
function escapeForJson(text: string): string {
  return JSON.stringify(text).slice(1, -1);
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

export type FakeClaude = { url: string; requests: RecordedRequest[]; close(): Promise<void> };

export async function startFakeClaude(options: { port?: number } = {}): Promise<FakeClaude> {
  const recordings = loadRecordings();
  const requests: RecordedRequest[] = [];
  let count = 0;

  const server = createServer(async (req, res) => {
    if (req.method === 'GET' && req.url === '/__requests') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ requests }));
      return;
    }
    if (req.method !== 'POST' || !req.url?.startsWith('/v1/messages')) {
      res.writeHead(404).end();
      return;
    }
    if (req.headers['x-api-key'] !== FAKE_CLAUDE_API_KEY) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }));
      return;
    }
    const body = JSON.parse(await readBody(req)) as { model?: string; system?: unknown; messages?: Message[]; tools?: { name?: string }[] };
    const messages = body.messages ?? [];
    const system = textOf(body.system);
    const user = messages.map((m) => textOf(m.content)).join('\n');
    const afterToolResult = isToolResult(messages.at(-1));
    const recorded: RecordedRequest = { model: String(body.model ?? ''), system, user };
    if (body.tools) recorded.tools = body.tools.map((tool) => String(tool.name ?? ''));
    requests.push(recorded);

    const recording = recordings.find(
      (r) =>
        system.includes(r.match) &&
        (r.matchUser === undefined || user.includes(r.matchUser)) &&
        (r.afterToolResult === undefined || r.afterToolResult === afterToolResult),
    );
    if (!recording) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ type: 'error', error: { type: 'api_error', message: '假的 Claude 沒有符合的錄製回應' } }));
      return;
    }
    count += 1;
    const fill = (text: string) =>
      text
        .replaceAll('{{user}}', escapeForJson(user))
        .replaceAll('{{lastUser}}', escapeForJson(lastUserText(messages)))
        .replaceAll('{{n}}', String(count));
    const content = recording.content
      ? (JSON.parse(fill(JSON.stringify(recording.content))) as unknown[])
      : // text 多半本身就是 JSON，替換的文字保持跳脫，解析後才是原文
        [{ type: 'text', text: fill(recording.text ?? '') }];
    const usesTool = content.some((block) => isRecord(block) && block.type === 'tool_use');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        id: `msg_fake_${count}`,
        type: 'message',
        role: 'assistant',
        model: body.model,
        content,
        stop_reason: usesTool ? 'tool_use' : 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 100, output_tokens: 50 },
      }),
    );
  });

  await new Promise<void>((resolve) => server.listen(options.port ?? 0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    url,
    requests,
    close: () => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  };
}
