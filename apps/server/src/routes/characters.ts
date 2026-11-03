import type { FastifyInstance } from 'fastify';
import type { CharacterService } from '../characters/service.js';

/**
 * GET   /api/videos/:id/characters             這支影片能用的角色
 * PATCH /api/characters/:cid                    外觀描述與連續性鎖
 * POST  /api/characters/:cid/generate           產生三視圖與定裝圖（body：videoId、consentToken）；需要同意時 409
 * POST  /api/characters/:cid/confirm            確認
 * POST  /api/characters/:cid/series             設為系列角色
 */
export function registerCharacterRoutes(_app: FastifyInstance, _characters: CharacterService): void {
  // 尚未實作
}
