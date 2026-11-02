/** Comfy Cloud 拒絕金鑰（401／403）；訊息不含金鑰 */
export class ComfyAuthError extends Error {
  override name = 'ComfyAuthError';
  constructor() {
    super('Comfy Cloud 拒絕了這組 API 金鑰，請確認 .env.local 的 COMFY_CLOUD_API_KEY。');
  }
}

/** 其他 Comfy Cloud 錯誤（HTTP 錯誤、JSON-RPC 錯誤、回應格式不對） */
export class ComfyError extends Error {
  override name = 'ComfyError';
}

/** session 過期（HTTP 404）；內部用來重新初始化 */
export class SessionExpiredError extends Error {
  override name = 'SessionExpiredError';
}
