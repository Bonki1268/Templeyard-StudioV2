import { describe, expect, it } from 'vitest';
import { characterBlockers, characterTags, createSeriesCharacterSchema, parseLocks, updateCharacterSchema } from './characters.js';

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

// 使用者 2026-11-05 提出：系列設定的角色庫可以新增系列角色
describe('新增系列角色的資料', () => {
  it('名稱與外觀描述去掉前後空白；連續性鎖沒填時是空的', () => {
    expect(createSeriesCharacterSchema.parse({ name: ' 阿嬤 ', description: ' 七十歲、短白髮 ' })).toEqual({
      name: '阿嬤',
      description: '七十歲、短白髮',
      continuityLocks: [],
    });
  });

  it.each([
    ['角色名稱是空白', { name: '  ', description: '短髮' }, 'name', '請填寫角色名稱'],
    ['角色名稱超過 20 字', { name: '名'.repeat(21), description: '短髮' }, 'name', '角色名稱最多 20 字'],
    ['外觀描述是空白', { name: '阿嬤', description: '' }, 'description', '請填寫角色的外觀描述'],
    ['連續性鎖超過 10 條', { name: '阿嬤', description: '短髮', continuityLocks: Array.from({ length: 11 }, (_, i) => `lock ${i}`) }, 'continuityLocks', '連續性鎖最多 10 條'],
  ] as const)('%s', (_name, input, field, message) => {
    const result = createSeriesCharacterSchema.safeParse(input);
    expect(result.success).toBe(false);
    expect(result.error?.issues.find((issue) => issue.path[0] === field)?.message).toBe(message);
  });
});
