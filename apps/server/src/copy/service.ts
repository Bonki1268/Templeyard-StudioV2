import type { Video } from '@templeyard/shared';
import type { CharacterService } from '../characters/service.js';
import type { AppDatabase } from '../db/client.js';
import type { PlanService } from '../plans/service.js';
import type { Clock } from '../series/repository.js';

// 複製影片（F17）：同一個系列、同一間廟，帶入問卷答案與現行分鏡方案（成為新影片的第 1 版），
// 不複製照片、寺廟定裝版、精緻圖、影片與成品；角色另建這支影片自己的（沒有定裝圖、還沒確認）。
// 新影片停在建立影片（creating），模型沒有鎖定，可以改選其他模型。

export type CopyService = {
  /** 影片不存在：StudioError 404「找不到這支影片」 */
  copy(videoId: string): Video;
};

export function createCopyService(deps: { db: AppDatabase; clock: Clock; plans: PlanService; characters: CharacterService }): CopyService {
  void deps;
  return {
    copy: () => {
      throw new Error('尚未實作');
    },
  };
}
