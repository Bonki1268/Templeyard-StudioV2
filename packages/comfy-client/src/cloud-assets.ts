import { requireCloudOk, type CloudOkAsset, type UploadConfig } from '@templeyard/shared';
import type { McpSession } from './rpc.js';

// 把本機檔案交給 Comfy Cloud。
// 07 實測紀錄：「圖片怎麼交給 MCP」還沒驗證（待測 tools/list），所以真實的傳送格式不在這裡猜，
// 只定義介面；第 4 階段實測後再寫真的 transport。
// 這是本機檔案送往雲端的唯一入口：參數型別只收 CloudOkAsset，執行期再檢查一次。

/** 雲端收到檔案後回給我們的參照（之後放進 MCP 呼叫參數） */
export type CloudAssetRef = { remoteRef: string };

/** 真正把位元組送出去的方式（待實測） */
export interface CloudAssetTransport {
  send(file: { asset: CloudOkAsset; bytes: Uint8Array }): Promise<CloudAssetRef>;
}

export type CloudAssetSenderDeps = {
  transport: CloudAssetTransport;
  /** 讀取本機檔案；只會對通過檢查的資產呼叫 */
  readBytes: (asset: CloudOkAsset) => Promise<Uint8Array>;
};

/** 建立送檔函式：原圖在型別上傳不進來；即使被強制轉型，執行期也會在讀檔之前擋下 */
export function createCloudAssetSender(deps: CloudAssetSenderDeps): (asset: CloudOkAsset) => Promise<CloudAssetRef> {
  return async (asset) => {
    const checked = requireCloudOk(asset);
    const bytes = await deps.readBytes(checked);
    return deps.transport.send({ asset: checked, bytes });
  };
}

/** 還不知道怎麼把圖片上傳到 Comfy Cloud（workflows 設定檔的 upload 是 null） */
export class UploadNotConfiguredError extends Error {
  override name = 'UploadNotConfiguredError';
  constructor() {
    super('圖片上傳到 Comfy Cloud 的方式還沒實測（07「下一輪測試」第 1 項），不能用照片生成');
  }
}

/**
 * 依 workflows 設定檔的 upload 設定，用 MCP 工具上傳檔案：
 * 把 base64、MIME、檔名寫到設定的位置，從回應的 refPath 取出雲端參照。
 * upload 是 null 時，send 一律丟出 UploadNotConfiguredError（不猜真的格式）。
 */
export function createMcpUploadTransport(_session: McpSession, _upload: UploadConfig | null): CloudAssetTransport {
  throw new Error('尚未實作');
}
