import type { Video } from '@templeyard/shared';
import { eq } from 'drizzle-orm';
import type { CharacterService } from '../characters/service.js';
import type { AppDatabase } from '../db/client.js';
import { videos } from '../db/schema.js';
import { insertPlan } from '../plans/repository.js';
import type { PlanService } from '../plans/service.js';
import type { Clock } from '../series/repository.js';
import { StudioError, VIDEO_NOT_FOUND } from '../studio/errors.js';
import { findQuestionnaire, insertQuestionnaire, updateQuestionnaire } from '../studio/repository.js';
import { createVideo, findVideo } from '../videos/repository.js';

// 複製影片（F17）：同一個系列、同一間廟，帶入問卷答案與現行分鏡方案（成為新影片的第 1 版），
// 不複製照片、寺廟定裝版、精緻圖、影片與成品；角色另建這支影片自己的（沒有定裝圖、還沒確認）。
// 新影片停在建立影片（creating），模型沒有鎖定，可以改選其他模型。

export type CopyService = {
  /** 影片不存在：StudioError 404「找不到這支影片」 */
  copy(videoId: string): Video;
};

export function createCopyService(deps: { db: AppDatabase; clock: Clock; plans: PlanService; characters: CharacterService }): CopyService {
  const { db, clock } = deps;
  return {
    copy(videoId) {
      const source = findVideo(db, videoId);
      if (!source) throw new StudioError(404, VIDEO_NOT_FOUND);
      return db.transaction(() => {
        const created = createVideo(db, { seriesId: source.seriesId, templeId: source.templeId, imageModel: source.imageModel, videoModel: source.videoModel }, clock);
        const now = clock.now().toISOString();
        // 使用者補充的寺廟資料、創作輸入、費用上限一併帶入；照片、定裝版不帶
        db.update(videos)
          .set({
            copiedFromVideoId: source.id,
            userTempleNotes: source.userTempleNotes,
            creativeInput: source.creativeInput,
            costLimit: source.costLimit,
            updatedAt: now,
          })
          .where(eq(videos.id, created.id))
          .run();

        // 問卷：答案照抄，保留原影片的送出時間（2026-11-03 使用者決定）
        const questionnaire = findQuestionnaire(db, source.id);
        if (questionnaire) {
          const copied = insertQuestionnaire(db, { id: clock.newId(), videoId: created.id, answers: questionnaire.answers });
          if (questionnaire.submittedAt) updateQuestionnaire(db, copied.id, { answers: copied.answers, submittedAt: questionnaire.submittedAt });
        }

        // 分鏡方案：現行版本成為第 1 版；角色另建這支影片自己的（沒有定裝圖、還沒確認），對應照片清空
        const plan = deps.plans.current(source.id);
        if (plan) {
          const sourceCharacters = deps.characters.listForVideo(source.id);
          const names = [...new Set(plan.shots.flatMap((shot) => shot.characters))];
          const ids = deps.characters.resolve(
            created.id,
            names.map((name) => {
              const found = sourceCharacters.find((c) => c.name === name);
              return found ? { name, description: found.version.description, continuityLocks: found.version.continuityLocks } : { name };
            }),
          );
          insertPlan(
            db,
            {
              id: clock.newId(),
              videoId: created.id,
              version: 1,
              styleNote: plan.styleNote,
              source: plan.source,
              diff: { changedShotKeys: plan.shots.map((shot) => shot.shotKey), summary: `從原影片的第 ${plan.version} 版複製` },
              createdAt: now,
            },
            plan.shots.map((shot) => ({ ...shot, id: clock.newId(), photoId: null, characters: shot.characters.map((name) => ids.get(name) ?? name) })),
          );
        }
        const copy = findVideo(db, created.id);
        if (!copy) throw new Error('複製影片失敗');
        return copy;
      });
    },
  };
}
