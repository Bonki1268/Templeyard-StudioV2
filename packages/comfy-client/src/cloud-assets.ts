import type { CloudOkAsset } from '@templeyard/shared';

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
export function createCloudAssetSender(_deps: CloudAssetSenderDeps): (asset: CloudOkAsset) => Promise<CloudAssetRef> {
  throw new Error('尚未實作');
}
