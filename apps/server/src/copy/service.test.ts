import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createClipsWorld, type ClipsWorld } from '../clips/__fixtures__/clipsWorld.js';
import { frames as framesTable, generations, photos, videos } from '../db/schema.js';
import { StudioError } from '../studio/errors.js';
import { findQuestionnaire, insertQuestionnaire, updateQuestionnaire } from '../studio/repository.js';
import { createCopyService, type CopyService } from './service.js';

// 第 12 階段：複製影片（F17）

let t: ClipsWorld;
let copies: CopyService;

beforeEach(async () => {
  t = await createClipsWorld();
  const q = insertQuestionnaire(t.world.db, { id: 'q1', videoId: 'v1', answers: [{ questionId: 'story', custom: '講媽祖的故事', source: 'user' }] });
  updateQuestionnaire(t.world.db, q.id, { answers: q.answers, submittedAt: '2026-11-03T09:00:00.000Z' });
  copies = createCopyService({ db: t.world.db, clock: t.world.clock, plans: t.plans, characters: t.characters });
});

afterEach(async () => {
  await t.close();
});

describe('複製影片', () => {
  it('同一個系列、同一間廟、同樣的模型，記下複製來源；停在建立影片，模型沒有鎖定', () => {
    const source = t.world.db.select().from(videos).all().find((v) => v.id === 'v1');
    const copy = copies.copy('v1');
    expect(copy.id).not.toBe('v1');
    expect(copy).toMatchObject({
      seriesId: source?.seriesId,
      templeId: source?.templeId,
      imageModel: source?.imageModel,
      videoModel: source?.videoModel,
      copiedFromVideoId: 'v1',
      stage: 'creating',
      modelsLockedAt: null,
      templeBoardVersionId: null,
    });
  });

  it('問卷答案照抄，已經送出', () => {
    const copy = copies.copy('v1');
    const questionnaire = findQuestionnaire(t.world.db, copy.id);
    expect(questionnaire?.answers).toEqual(findQuestionnaire(t.world.db, 'v1')?.answers);
    expect(questionnaire?.submittedAt).not.toBeNull();
  });

  it('現行方案成為新影片的第 1 版：內容相同，對應照片清空', () => {
    t.plans.updateShot('v1', 'k2', { description: '阿嬤站在香爐旁' });
    const copy = copies.copy('v1');
    const source = t.plans.current('v1');
    const plan = t.plans.current(copy.id);
    expect(plan?.version).toBe(1);
    const content = (shots: NonNullable<typeof plan>['shots']) => shots.map(({ photoId: _p, ...rest }) => rest);
    expect(content(plan?.shots ?? [])).toEqual(content(source?.shots ?? []));
    expect(plan?.shots.every((shot) => shot.photoId === null)).toBe(true);
  });

  it('不複製照片、寺廟定裝版、精緻圖、影片、成品與生成紀錄', () => {
    const copy = copies.copy('v1');
    const db = t.world.db;
    expect(db.select().from(photos).all().filter((p) => p.videoId === copy.id)).toEqual([]);
    expect(db.select().from(framesTable).all().filter((f) => f.videoId === copy.id)).toEqual([]);
    expect(db.select().from(generations).all().filter((g) => g.videoId === copy.id)).toEqual([]);
    expect(t.clips.get(copy.id)).toMatchObject({ final: null, generating: false });
    expect(t.clips.get(copy.id).shots.every((shot) => shot.clip === null)).toBe(true);
  });

  it('角色另建這支影片自己的：同樣的名稱、描述與連續性鎖，沒有定裝圖、還沒確認', () => {
    const copy = copies.copy('v1');
    const source = t.characters.listForVideo('v1').find((c) => c.name === '阿嬤');
    const characters = t.characters.listForVideo(copy.id);
    expect(characters.map((c) => c.name)).toEqual(['阿嬤']);
    const grandma = characters[0];
    expect(grandma?.id).not.toBe(source?.id);
    expect(grandma?.version.continuityLocks).toEqual(source?.version.continuityLocks);
    expect(grandma?.version.lookAssetId).toBeNull();
    expect(grandma?.state).not.toBe('confirmed');
  });

  it('影片不存在：404', () => {
    let caught: unknown = null;
    try {
      copies.copy('nope');
    } catch (error: unknown) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(StudioError);
    expect(caught).toMatchObject({ status: 404, message: '找不到這支影片' });
  });
});
