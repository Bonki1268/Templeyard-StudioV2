import {
  AgentTurnError,
  ClaudeCallError,
  buildAgentSystem,
  createToolRegistry,
  runAgentTurn,
  type AgentMessage,
  type ClaudeModel,
} from '@templeyard/agent';
import { imageModelLabel, videoModelLabel, type ChatEvent, type ChatMessage, type Video, type VideoStage, type WorkflowConfig } from '@templeyard/shared';
import { eq } from 'drizzle-orm';
import type { ConsentStore } from '../costs/consents.js';
import type { AppDatabase } from '../db/client.js';
import { videos } from '../db/schema.js';
import { findSeries, type Clock } from '../series/repository.js';
import { findTemple } from '../temples/repository.js';
import { findVideo } from '../videos/repository.js';
import { createAgentTools } from './agentTools.js';
import { BOARD_NOT_CONFIRMED, StudioError, VIDEO_NOT_FOUND } from './errors.js';
import type { PlanService } from '../plans/service.js';
import type { QuestionnaireService } from './questionnaire.js';
import { findQuestionnaire, insertChatMessage, listChatMessages } from './repository.js';

/** 寺廟定裝版確認前的階段：還不能開始創作 */
const BEFORE_STUDIO: readonly VideoStage[] = ['creating', 'board_pending'];

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

export function createChatService(deps: {
  db: AppDatabase;
  clock: Clock;
  workflows: WorkflowConfig;
  consents: ConsentStore;
  questionnaires: QuestionnaireService;
  /** 有分鏡方案時，Agent 的系統指令列出方案，並多了 revise_plan */
  plans?: PlanService;
  model: ClaudeModel | null;
  unavailableMessage?: string;
}): ChatService {
  const { db, clock } = deps;

  function requireVideo(videoId: string): Video {
    const video = findVideo(db, videoId);
    if (!video) throw new StudioError(404, VIDEO_NOT_FOUND);
    return video;
  }

  function prepare(videoId: string): { video: Video; model: ClaudeModel } {
    const video = requireVideo(videoId);
    if (BEFORE_STUDIO.includes(video.stage)) throw new StudioError(409, BOARD_NOT_CONFIRMED);
    if (!deps.model) throw new StudioError(503, deps.unavailableMessage ?? '還沒設定 Claude，不能使用創作對話');
    return { video, model: deps.model };
  }

  /** 這支影片的資料，寫進 Agent 的系統指令 */
  function systemFor(video: Video): string {
    const temple = findTemple(db, video.templeId);
    const seriesRow = findSeries(db, video.seriesId);
    if (!temple || !seriesRow) throw new Error('影片的寺廟或系列不存在');
    return buildAgentSystem({
      temple: { name: temple.name, district: temple.district, deity: temple.deity, builtYear: temple.foundedYear },
      userTempleNotes: video.userTempleNotes,
      series: { name: seriesRow.name, visualStyle: seriesRow.visualStyle, durationSec: seriesRow.durationSec, direction: seriesRow.direction },
      models: { image: imageModelLabel(video.imageModel), video: videoModelLabel(video.videoModel) },
      questionnaireSubmitted: Boolean(findQuestionnaire(db, video.id)?.submittedAt),
    });
  }

  return {
    list(videoId) {
      requireVideo(videoId);
      return listChatMessages(db, videoId);
    },

    prepare(videoId) {
      prepare(videoId);
    },

    async send(videoId, content, onEvent) {
      const { video, model } = prepare(videoId);
      // 之前的對話只送文字；Claude 要求第一則是使用者訊息，所以略過開頭的 Agent 訊息
      const history: AgentMessage[] = listChatMessages(db, videoId).map((m) => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.content,
      }));
      while (history[0]?.role === 'assistant') history.shift();

      const userMessage = db.transaction(() => {
        const saved = insertChatMessage(db, { id: clock.newId(), videoId, role: 'user', content, toolCalls: [], createdAt: clock.now().toISOString() });
        if (video.creativeInput === null) {
          db.update(videos).set({ creativeInput: content, updatedAt: clock.now().toISOString() }).where(eq(videos.id, videoId)).run();
        }
        return saved;
      });
      onEvent({ type: 'user', message: userMessage });

      const tools = createAgentTools({ db, videoId, questionnaires: deps.questionnaires, workflows: deps.workflows });
      // 付費工具要有這一輪的同意憑證；第 6 階段的對話不帶憑證，所以付費工具一律不執行
      const registry = createToolRegistry(tools, { verifyConsent: () => false });
      try {
        const result = await runAgentTurn({
          model,
          system: systemFor(video),
          history,
          userMessage: content,
          registry,
          context: { consentToken: null },
          onEvent: (event) => onEvent(event.type === 'text' ? { type: 'text', text: event.text } : { type: 'tool', call: event.call }),
        });
        const agentMessage = insertChatMessage(db, {
          id: clock.newId(),
          videoId,
          role: 'agent',
          content: result.text,
          toolCalls: result.toolCalls,
          createdAt: clock.now().toISOString(),
        });
        onEvent({ type: 'done', message: agentMessage });
      } catch (error: unknown) {
        if (error instanceof AgentTurnError || error instanceof ClaudeCallError) {
          onEvent({ type: 'error', message: error.message });
          return;
        }
        throw error;
      }
    },
  };
}
