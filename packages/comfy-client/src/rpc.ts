import { ComfyAuthError, ComfyError, SessionExpiredError } from './errors.js';

// MCP 的 JSON-RPC over HTTP（07「已確認的 MCP 呼叫流程」、docs/reference/comfyui-test/server.mjs）

export type ToolResult = {
  isError: boolean;
  /** content 裡所有 text 接起來 */
  text: string;
  /** structuredContent，沒有就嘗試把 text 當 JSON 解析；都不行為 null */
  data: unknown;
};

export type McpSessionOptions = {
  url: string;
  apiKey: string;
  fetch?: typeof fetch;
  clientInfo?: { name: string; version: string };
};

export type McpSession = {
  /** tools/call；第一次呼叫前自動 initialize，session 過期（404）時重新初始化並重送一次 */
  callTool(name: string, args: Record<string, unknown>): Promise<ToolResult>;
};

type RpcMessage = { id?: unknown; result?: unknown; error?: { message?: string } };

const PROTOCOL_VERSION = '2025-03-26';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 回應可能是 JSON，也可能是 text/event-stream（每行 data: 一則訊息） */
function parseMessages(body: string, contentType: string): RpcMessage[] {
  const raw = contentType.includes('text/event-stream')
    ? body
        .split(/\r?\n/)
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trim())
    : [body];
  return raw.filter(Boolean).map((text) => {
    try {
      const parsed: unknown = JSON.parse(text);
      return isRecord(parsed) ? (parsed as RpcMessage) : {};
    } catch {
      throw new ComfyError('Comfy Cloud 回應的格式看不懂');
    }
  });
}

function toToolResult(result: unknown): ToolResult {
  const record = isRecord(result) ? result : {};
  const content = Array.isArray(record.content) ? record.content : [];
  const text = content
    .filter((item): item is { type: 'text'; text: string } => isRecord(item) && item.type === 'text' && typeof item.text === 'string')
    .map((item) => item.text)
    .join('\n');
  let data: unknown = record.structuredContent ?? null;
  if (data === null) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  return { isError: record.isError === true, text, data };
}

export function createMcpSession(options: McpSessionOptions): McpSession {
  const doFetch = options.fetch ?? fetch;
  let sessionId: string | null = null;
  let rpcId = 0;
  let initializing: Promise<void> | null = null;

  async function post(body: { jsonrpc: '2.0'; id?: number; method: string; params?: unknown }): Promise<unknown> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'X-API-Key': options.apiKey,
    };
    if (sessionId) headers['Mcp-Session-Id'] = sessionId;
    let response: Response;
    try {
      response = await doFetch(options.url, { method: 'POST', headers, body: JSON.stringify(body) });
    } catch {
      throw new ComfyError('連不上 Comfy Cloud，請確認網路');
    }
    const returnedSession = response.headers.get('mcp-session-id');
    if (returnedSession) sessionId = returnedSession;
    const text = await response.text();
    if (response.status === 401 || response.status === 403) throw new ComfyAuthError();
    if (response.status === 404 && body.method !== 'initialize') throw new SessionExpiredError('session 已過期');
    if (!response.ok && response.status !== 202) throw new ComfyError(`Comfy Cloud 回應 HTTP ${response.status}`);
    if (body.id === undefined) return null;
    const reply = parseMessages(text, response.headers.get('content-type') ?? '').find((m) => m.id === body.id);
    if (!reply) throw new ComfyError('Comfy Cloud 沒有回傳對應的結果');
    if (reply.error) throw new ComfyError(reply.error.message ?? 'Comfy Cloud 回傳錯誤');
    return reply.result;
  }

  function ensureSession(): Promise<void> {
    if (sessionId) return Promise.resolve();
    initializing ??= (async () => {
      await post({
        jsonrpc: '2.0',
        id: ++rpcId,
        method: 'initialize',
        params: {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: options.clientInfo ?? { name: 'templeyard-studio', version: '0.0.0' },
        },
      });
      await post({ jsonrpc: '2.0', method: 'notifications/initialized' });
    })().finally(() => {
      initializing = null;
    });
    return initializing;
  }

  return {
    async callTool(name, args) {
      for (let attempt = 0; ; attempt += 1) {
        await ensureSession();
        try {
          const result = await post({ jsonrpc: '2.0', id: ++rpcId, method: 'tools/call', params: { name, arguments: args } });
          return toToolResult(result);
        } catch (error: unknown) {
          if (error instanceof SessionExpiredError && attempt === 0) {
            sessionId = null;
            continue;
          }
          if (error instanceof SessionExpiredError) throw new ComfyError('Comfy Cloud 的 session 一直過期，請稍後再試');
          throw error;
        }
      }
    },
  };
}
