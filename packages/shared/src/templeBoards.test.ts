import { describe, expect, it } from 'vitest';
import {
  NO_VIEW_MESSAGE,
  boardPendingItems,
  generateTempleBoardSchema,
  planBoardViews,
  regenerateTempleViewSchema,
  updateTempleBoardSchema,
  viewTags,
} from './templeBoards.js';

const photo = (id: string, viewKey: string | null) => ({ id, viewKey });

describe('要產生哪些視角', () => {
  it('有照片的視角依照片，順序同標準清單，帶上這個視角的所有照片', () => {
    const views = planBoardViews([photo('p2', 'courtyard'), photo('p1', 'front_overview'), photo('p3', 'courtyard')], []);
    expect(views).toEqual([
      { key: 'front_overview', name: '廟前全景', source: 'photo', photoIds: ['p1'] },
      { key: 'courtyard', name: '廟埕', source: 'photo', photoIds: ['p2', 'p3'] },
    ]);
  });

  it('缺少照片、選了讓 AI 推測的視角為 AI 推測；沒選的缺少視角不產生', () => {
    const views = planBoardViews([photo('p1', 'front_overview')], ['courtyard']);
    expect(views.map((v) => [v.key, v.source])).toEqual([
      ['front_overview', 'photo'],
      ['courtyard', 'ai_inferred'],
    ]);
    expect(views[1]?.photoIds).toEqual([]);
  });

  it('已有照片的視角即使選了 AI 推測，仍依照片', () => {
    const views = planBoardViews([photo('p1', 'main_hall')], ['main_hall']);
    expect(views).toEqual([{ key: 'main_hall', name: '正殿內部', source: 'photo', photoIds: ['p1'] }]);
  });

  it('沒有指定視角的照片不會產生任何視角', () => {
    expect(planBoardViews([photo('p1', null)], [])).toEqual([]);
  });

  it('同一個 AI 推測視角重複送出只產生一次', () => {
    expect(planBoardViews([], ['courtyard', 'courtyard'])).toHaveLength(1);
  });
});

type ViewLike = Parameters<typeof boardPendingItems>[0][number];
const view = (patch: Partial<ViewLike> = {}): ViewLike => ({
  viewName: '廟前全景',
  source: 'photo',
  confirmed: true,
  state: 'ready',
  ...patch,
});

describe('確認定裝版前還要處理的事', () => {
  it('依照片、已產生、已確認的視角都好了，沒有待處理', () => {
    expect(boardPendingItems([view(), view({ viewName: '廟埕' })])).toEqual([]);
  });

  it('AI 推測的視角未確認時要先確認或補傳照片', () => {
    expect(boardPendingItems([view(), view({ viewName: '廟埕', source: 'ai_inferred', confirmed: false })])).toEqual([
      '「廟埕」為 AI 推測，請先確認或補傳照片',
    ]);
  });

  it('重生後未確認的視角要重新確認', () => {
    expect(boardPendingItems([view({ confirmed: false })])).toEqual(['「廟前全景」重新產生了，請確認這張']);
  });

  it('生成中、失敗的視角各自列出，不再要求確認', () => {
    expect(
      boardPendingItems([
        view({ state: 'generating', confirmed: false }),
        view({ viewName: '廟埕', state: 'failed', source: 'ai_inferred', confirmed: false }),
      ]),
    ).toEqual(['「廟前全景」還在生成中', '「廟埕」生成失敗，請重生']);
  });

  it('沒有任何視角時不能確認', () => {
    expect(boardPendingItems([])).toEqual([NO_VIEW_MESSAGE]);
  });
});

describe('視角圖卡的標籤', () => {
  it.each([
    [{ source: 'photo', confirmed: true, state: 'ready' }, ['依照片']],
    [{ source: 'photo', confirmed: false, state: 'ready' }, ['依照片', '需重新確認']],
    [{ source: 'ai_inferred', confirmed: false, state: 'ready' }, ['AI 推測・待確認']],
    [{ source: 'ai_inferred', confirmed: true, state: 'ready' }, ['AI 推測・已確認']],
    [{ source: 'photo', confirmed: false, state: 'generating' }, ['依照片']],
    [{ source: 'ai_inferred', confirmed: false, state: 'failed' }, ['AI 推測・待確認']],
  ] as const)('%o → %o', (input, expected) => {
    expect(viewTags(input)).toEqual(expected);
  });
});

describe('定裝版的請求驗證', () => {
  it('AI 推測的視角要在標準清單裡', () => {
    const result = generateTempleBoardSchema.safeParse({ inferredViewKeys: ['custom_gate'] });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('請從清單選擇視角');
  });

  it('沒有給 AI 推測的視角時當作空清單', () => {
    expect(generateTempleBoardSchema.parse({})).toEqual({ inferredViewKeys: [] });
  });

  it('修改指令去掉前後空白，最多 500 字', () => {
    expect(regenerateTempleViewSchema.parse({ instruction: '  燈光暗一點 ' }).instruction).toBe('燈光暗一點');
    expect(regenerateTempleViewSchema.safeParse({ instruction: '字'.repeat(501) }).success).toBe(false);
  });

  it('外觀規範不能有空白的一條，光線要從清單選', () => {
    expect(updateTempleBoardSchema.safeParse({ appearanceLocks: ['  '] }).error?.issues[0]?.message).toBe('外觀規範不能是空白');
    expect(updateTempleBoardSchema.safeParse({ defaultLighting: '正中午' }).error?.issues[0]?.message).toBe('請從清單選擇光線與時段');
    expect(updateTempleBoardSchema.safeParse({}).success).toBe(false);
  });
});
