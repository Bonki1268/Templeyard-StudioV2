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

export function createMcpSession(_options: McpSessionOptions): McpSession {
  throw new Error('尚未實作');
}
