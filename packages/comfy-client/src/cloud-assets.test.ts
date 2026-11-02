import { NotCloudOkError, type Asset, type CloudOkAsset } from '@templeyard/shared';
import { describe, expect, it } from 'vitest';
import { createCloudAssetSender, type CloudAssetTransport } from './cloud-assets.js';

function asset(kind: Asset['kind'], cloudOk: boolean): Asset {
  return { id: `asset-${kind}`, kind, mime: 'image/jpeg', width: 320, height: 240, durationSec: null, sha256: 'abc', cloudOk };
}

// 記錄每次讀檔與送出，確認原圖連讀都不會被讀
function recordingDeps() {
  const reads: string[] = [];
  const sent: string[] = [];
  const transport: CloudAssetTransport = {
    send: async ({ asset: file, bytes }) => {
      sent.push(`${file.id}:${bytes.length}`);
      return { remoteRef: `remote-${file.id}` };
    },
  };
  return {
    reads,
    sent,
    deps: {
      transport,
      readBytes: async (file: CloudOkAsset) => {
        reads.push(file.id);
        return new Uint8Array([1, 2, 3]);
      },
    },
  };
}

describe('送往雲端的檔案', () => {
  it('去識別後的照片可以送出，回傳雲端的參照', async () => {
    const { deps, reads, sent } = recordingDeps();
    const send = createCloudAssetSender(deps);

    const ref = await send(asset('deid_photo', true) as CloudOkAsset);

    expect(ref).toEqual({ remoteRef: 'remote-asset-deid_photo' });
    expect(reads).toEqual(['asset-deid_photo']);
    expect(sent).toEqual(['asset-deid_photo:3']);
  });

  it('原圖被強制轉型傳進來，仍在讀檔之前被擋下', async () => {
    const { deps, reads, sent } = recordingDeps();
    const send = createCloudAssetSender(deps);

    await expect(send(asset('original_photo', false) as unknown as CloudOkAsset)).rejects.toBeInstanceOf(NotCloudOkError);
    expect(reads).toEqual([]);
    expect(sent).toEqual([]);
  });

  it('原圖在型別上就傳不進去', () => {
    const { deps } = recordingDeps();
    const send = createCloudAssetSender(deps);
    const original = asset('original_photo', false);

    // @ts-expect-error 原圖（Asset）不是 CloudOkAsset，pnpm typecheck 會在這裡報錯；拿掉這行註解就編譯不過
    const attempt = () => send(original);

    return expect(attempt()).rejects.toBeInstanceOf(NotCloudOkError);
  });
});
