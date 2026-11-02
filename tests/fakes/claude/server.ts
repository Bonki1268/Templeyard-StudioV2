import { readFileSync } from 'node:fs';
import { createServer, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 假的 Claude API（POST /v1/messages）：依 recordings.json 回覆錄製的回應，記下每次收到的請求。
// 測試把 SDK 的 baseURL 指過來；不會連到真的 Claude API。
// - 沒帶 x-api-key 回 401
// - system 沒有符合任何錄製回應時回 500（測試寫錯了要看得出來）
// - GET /__requests：情境測試查詢收到的請求

export const FAKE_CLAUDE_API_KEY = 'fake-claude-key';

type Recording = { match: string; text: string };
export type RecordedRequest = { model: string; system: string; user: string };

const here = path.dirname(fileURLToPath(import.meta.url));

function loadRecordings(): Recording[] {
  const file = JSON.parse(readFileSync(path.join(here, 'recordings.json'), 'utf8')) as { recordings: Recording[] };
  return file.recordings;
}

function textOf(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((block: unknown) =>
      typeof block === 'object' && block !== null && 'text' in block && typeof block.text === 'string' ? block.text : '',
    )
    .join('');
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
    const body = JSON.parse(await readBody(req)) as { model?: string; system?: unknown; messages?: { content: unknown }[] };
    const system = textOf(body.system);
    const user = (body.messages ?? []).map((m) => textOf(m.content)).join('\n');
    requests.push({ model: String(body.model ?? ''), system, user });
    const recording = recordings.find((r) => system.includes(r.match));
    if (!recording) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ type: 'error', error: { type: 'api_error', message: '假的 Claude 沒有符合的錄製回應' } }));
      return;
    }
    count += 1;
    const text = recording.text.replace('{{user}}', JSON.stringify(user).slice(1, -1));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        id: `msg_fake_${count}`,
        type: 'message',
        role: 'assistant',
        model: body.model,
        content: [{ type: 'text', text }],
        stop_reason: 'end_turn',
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
