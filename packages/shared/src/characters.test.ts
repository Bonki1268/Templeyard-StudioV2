import { describe, expect, it } from 'vitest';
import { characterBlockers, characterTags, parseLocks, updateCharacterSchema } from './characters.js';

describe('角色還沒確認時不能生成', () => {
  it('列出沒確認的角色；已確認的不列', () => {
    expect(
      characterBlockers([
        { name: '阿嬤', state: 'draft' },
        { name: '阿公', state: 'confirmed' },
        { name: '小明', state: 'pending_confirm' },
        { name: '廟公', state: 'generating' },
        { name: '香客', state: 'failed' },
      ]),
    ).toEqual(['角色「阿嬤」還沒確認定裝圖', '角色「小明」還沒確認定裝圖', '角色「廟公」還沒確認定裝圖', '角色「香客」還沒確認定裝圖']);
  });

  it('沒有角色時沒有原因', () => {
    expect(characterBlockers([])).toEqual([]);
  });
});

describe('連續性鎖', () => {
  it('一行一條，去掉空白、空行與重複', () => {
    expect(parseLocks(' grey cotton cardigan \n\nsilver hairpin\ngrey cotton cardigan\n')).toEqual(['grey cotton cardigan', 'silver hairpin']);
  });

  it('外觀描述空白時說明；連續性鎖最多 10 條', () => {
    expect(updateCharacterSchema.safeParse({ description: '  ' }).error?.issues[0]?.message).toBe('請填寫角色的外觀描述');
    const many = Array.from({ length: 11 }, (_, i) => `lock ${i}`);
    expect(updateCharacterSchema.safeParse({ description: '阿嬤', continuityLocks: many }).error?.issues[0]?.message).toBe('連續性鎖最多 10 條');
  });
});

describe('角色的標籤', () => {
  it.each([
    [{ isSeries: false, state: 'draft' as const }, ['待產生定裝圖']],
    [{ isSeries: false, state: 'pending_confirm' as const }, ['待確認']],
    [{ isSeries: true, state: 'confirmed' as const }, ['系列角色', '已確認']],
    [{ isSeries: false, state: 'failed' as const }, ['生成失敗']],
  ])('%o → %o', (character, tags) => {
    expect(characterTags(character)).toEqual(tags);
  });
});
