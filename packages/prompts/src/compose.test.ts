import { describe, expect, it } from 'vitest';
import { createFakeWriter } from '../../../tests/fakes/claude/fake-writer.js';
import { MissingLocksError, composeFinalPrompt } from './compose.js';
import type { RenderedRequest } from './render.js';

const request: RenderedRequest = {
  promptId: 'temple-view',
  promptVersion: 2,
  step: 2,
  target: { kind: 'image', model: 'nano-banana-pro', aspectRatio: '16:9' },
  system: '撰寫規則',
  messages: [{ role: 'user', content: '寺廟：鄞山寺' }],
};
const locks = ['red swallowtail roof ridge', 'grey granite dragon columns'];
const good = 'A 16:9 empty plate: red swallowtail roof ridge above grey granite dragon columns.';

describe('圖片與影片節點的最終指令', () => {
  it('撰寫者寫出的指令包含所有鎖時直接採用', async () => {
    const writer = createFakeWriter([{ prompt: good, notes: '用照片 1 的屋脊' }]);

    const result = await composeFinalPrompt({ request, locks, writer });

    expect(result).toEqual({ prompt: good, notes: '用照片 1 的屋脊', source: 'writer', attempts: 1, lockWarnings: [] });
    expect(writer.calls[0]?.content).toBe('寺廟：鄞山寺');
  });

  it('缺少鎖時請撰寫者重寫一次，並說明缺了哪些', async () => {
    const writer = createFakeWriter([{ prompt: 'A temple at dusk.' }, { prompt: good }]);

    const result = await composeFinalPrompt({ request, locks, writer });

    expect(result).toMatchObject({ prompt: good, attempts: 2 });
    expect(writer.calls[1]?.retryNote).toContain('red swallowtail roof ridge');
    expect(writer.calls[1]?.retryNote).toContain('grey granite dragon columns');
  });

  it('重寫一次仍缺少就丟出 MissingLocksError，不再重試', async () => {
    const writer = createFakeWriter([{ prompt: 'A temple at dusk.' }]);

    const error = await composeFinalPrompt({ request, locks, writer }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(MissingLocksError);
    expect((error as MissingLocksError).missing).toEqual(locks);
    expect(writer.calls).toHaveLength(2);
  });

  it('這一格有自訂指令時以自訂指令為準，不呼叫撰寫者；缺少的鎖只提醒', async () => {
    const writer = createFakeWriter([{ prompt: good }]);

    const result = await composeFinalPrompt({ request, locks, writer, customPrompt: '  只要紅色屋脊：red swallowtail roof ridge  ' });

    expect(result).toEqual({
      prompt: '只要紅色屋脊：red swallowtail roof ridge',
      notes: undefined,
      source: 'custom',
      attempts: 0,
      lockWarnings: ['grey granite dragon columns'],
    });
    expect(writer.calls).toHaveLength(0);
  });

  it('自訂指令是空白時照常請撰寫者寫', async () => {
    const writer = createFakeWriter([{ prompt: good }]);

    expect((await composeFinalPrompt({ request, locks, writer, customPrompt: '   ' })).source).toBe('writer');
  });

  it('沒有鎖時不檢查', async () => {
    const writer = createFakeWriter([{ prompt: 'Any prompt.' }]);

    expect((await composeFinalPrompt({ request, locks: [], writer })).attempts).toBe(1);
  });
});
