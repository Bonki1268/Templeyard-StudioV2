import type { ClaudeModel } from '@templeyard/agent';
import type { ChatEvent, ChatMessage, WorkflowConfig } from '@templeyard/shared';
import type { ConsentStore } from '../costs/consents.js';
import type { AppDatabase } from '../db/client.js';
import type { Clock } from '../series/repository.js';
import type { QuestionnaireService } from './questionnaire.js';

// 創作對話（F6）：存下使用者的話，跑一輪 Agent，存下 Agent 的回覆與執行的操作。

export type ChatService = {
  /** 影片不存在：StudioError 404 */
  list(videoId: string): ChatMessage[];
  /**
   * 開始串流前的檢查（錯誤以一般的 JSON 回應）：
   * - 影片不存在：404「找不到這支影片」
   * - 寺廟定裝版還沒確認（階段是 creating、board_pending）：409「寺廟定裝版還沒確認，還不能開始創作」
   * - 沒有設定 Claude：503，訊息是 unavailableMessage
   */
  prepare(videoId: string): void;
  /**
   * 送出一句話：依序送出 user（存下的使用者訊息）、text、tool、最後 done（存下的 Agent 訊息）或 error。
   * - 這支影片還沒有創作輸入時，把這句話存成 creative_input
   * - 之前的對話（只有文字）一併送給 Claude
   * - Agent 失敗時送出 error，不存 Agent 訊息
   */
  send(videoId: string, content: string, onEvent: (event: ChatEvent) => void): Promise<void>;
};

export function createChatService(_deps: {
  db: AppDatabase;
  clock: Clock;
  workflows: WorkflowConfig;
  consents: ConsentStore;
  questionnaires: QuestionnaireService;
  model: ClaudeModel | null;
  unavailableMessage?: string;
}): ChatService {
  throw new Error('尚未實作');
}
