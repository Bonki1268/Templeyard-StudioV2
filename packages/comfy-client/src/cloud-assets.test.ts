import { createHash } from 'node:crypto';
import { NotCloudOkError, type Asset, type CloudOkAsset } from '@templeyard/shared';
import { describe, expect, it } from 'vitest';
import { FAKE_API_KEY, startFakeComfyMcp } from '../../../tests/fakes/comfy-mcp/server.js';
import { UploadNotConfiguredError, createCloudAssetSender, createMcpUploadTransport, type CloudAssetTransport } from './cloud-assets.js';
import { createMcpSession } from './rpc.js';

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

describe('用 MCP 工具上傳檔案', () => {
  const uploadConfig = {
    tool: 'fake_upload_file',
    args: {},
    dataPath: ['data_base64'],
    mimePath: ['mime'],
    namePath: ['filename'],
    refPath: ['file_ref'],
  };
  const deid = asset('deid_photo', true) as CloudOkAsset;

  it('照設定把 base64、MIME、檔名寫進參數，回傳雲端參照', async () => {
    const fake = await startFakeComfyMcp();
    try {
      const transport = createMcpUploadTransport(createMcpSession({ url: fake.url, apiKey: FAKE_API_KEY }), uploadConfig);
      const bytes = new Uint8Array([1, 2, 3, 4]);

      const ref = await transport.send({ asset: deid, bytes });

      expect(ref.remoteRef).toBe(fake.uploads[0]?.ref);
      expect(fake.uploads[0]).toMatchObject({
        sha256: createHash('sha256').update(bytes).digest('hex'),
        mime: 'image/jpeg',
        filename: 'asset-deid_photo.jpg',
      });
    } finally {
      await fake.close();
    }
  });

  it('上傳設定是 null（還沒實測）時不呼叫任何工具，說明原因', async () => {
    const calls: string[] = [];
    const transport = createMcpUploadTransport(
      {
        callTool: async (name) => {
          calls.push(name);
          return { isError: false, text: '', data: null };
        },
      },
      null,
    );

    await expect(transport.send({ asset: deid, bytes: new Uint8Array([1]) })).rejects.toBeInstanceOf(UploadNotConfiguredError);
    expect(calls).toEqual([]);
  });

  it('工具回傳錯誤或沒有參照時丟出錯誤', async () => {
    const transport = createMcpUploadTransport(
      { callTool: async () => ({ isError: false, text: '{}', data: {} }) },
      uploadConfig,
    );
    await expect(transport.send({ asset: deid, bytes: new Uint8Array([1]) })).rejects.toThrow('上傳後沒有拿到雲端參照');

    const failing = createMcpUploadTransport(
      { callTool: async () => ({ isError: true, text: '檔案太大', data: null }) },
      uploadConfig,
    );
    await expect(failing.send({ asset: deid, bytes: new Uint8Array([1]) })).rejects.toThrow('上傳圖片失敗：檔案太大');
  });
});
