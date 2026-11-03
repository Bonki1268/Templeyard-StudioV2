import { createFfmpeg } from '../../compose/ffmpeg.js';
import { createFramesWorld, type FramesWorld } from '../../frames/__fixtures__/framesWorld.js';
import { CLIP_NODES, createClipService, type ClipService } from '../service.js';

// 影片測試共用：在精緻圖的測試世界（4 格：6、8、2、10 秒）上，產生並確認所有格的精緻圖，接上影片服務

export type ClipsWorld = FramesWorld & {
  clips: ClipService;
  /** 確認所有格的精緻圖 */
  confirmAll(): void;
  /** 影片與背景音樂要同意的費用 */
  clipConsent(): string;
};

export async function createClipsWorld(options: { confirm?: boolean } = {}): Promise<ClipsWorld> {
  const base = await createFramesWorld();
  const { world } = base;
  await base.frames.generate('v1', base.consent(4));
  await base.settleAll();
  const confirmAll = () => {
    for (const shot of base.frames.get('v1').shots) base.frames.confirm('v1', shot.shotKey);
  };
  if (options.confirm ?? true) confirmAll();

  const clips = createClipService({
    db: world.db,
    clock: world.clock,
    workflows: world.workflows,
    prompts: world.prompts,
    plans: base.plans,
    characters: base.characters,
    frames: base.frames,
    generation: { service: world.generation, writer: world.writer, sendAsset: world.sendAsset },
    store: world.store,
    ffmpeg: createFfmpeg(),
  });
  for (const node of CLIP_NODES) world.handlers[node] = clips.handleGenerated;
  base.onFrameChange.push((videoId, change) => clips.invalidate(videoId, change));
  base.clipLookup.current = (videoId, shotKey) => clips.clipOf(videoId, shotKey);

  // 4 格依模型最短 3 秒生成：6 + 8 + 3 + 10 = 27 秒；背景音樂 1 次
  const clipConsent = () =>
    world.consents.issue('v1', [
      { model: 'gemini-omni-1.1-flash', units: 27 },
      { model: 'ace-step-1.5', units: 1 },
    ]).token;

  return { ...base, clips, confirmAll, clipConsent };
}
