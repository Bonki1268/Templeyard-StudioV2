import {
  apiErrorSchema,
  assetResponseSchema,
  assistResponseSchema,
  characterResponseSchema,
  chatListResponseSchema,
  framesResponseSchema,
  planResponseSchema,
  planVersionResponseSchema,
  questionnaireResponseSchema,
  submitQuestionnaireResponseSchema,
  budgetResponseSchema,
  consentRequiredResponseSchema,
  consentResponseSchema,
  costCheckSchema,
  templeBoardResponseSchema,
  photoResponseSchema,
  seriesListResponseSchema,
  seriesResponseSchema,
  templeSearchResponseSchema,
  videoDetailResponseSchema,
  videoResponseSchema,
  type AnswerInput,
  type Asset,
  type AssistLog,
  type AssistRequest,
  type Character,
  type ChatEvent,
  type ChatMessage,
  type CreatePlanVersionInput,
  type FramesResponse,
  type Plan,
  type PlanResponse,
  type Questionnaire,
  type Budget,
  type CostCheck,
  type CostItem,
  type GenerateTempleBoardInput,
  type RegenerateTempleViewInput,
  type TempleBoard,
  type UpdateTempleBoardInput,
  type CreatePhotoInput,
  type CreateSeriesInput,
  type ImageUpload,
  type Photo,
  type Series,
  type TempleSummary,
  type UpdateCharacterInput,
  type UpdatePhotoInput,
  type UpdateVideoInput,
  type Video,
  type VideoDetail,
} from '@templeyard/shared';
import { readChatStream } from '../features/studio/chatStream';

/** API 回應錯誤：message 與各欄位的說明 */
export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly fieldErrors: Record<string, string> = {},
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

/** 呼叫本機後端；非 2xx 時丟出 ApiRequestError */
async function request(path: string, init?: RequestInit): Promise<unknown> {
  let response: Response;
  try {
    // 沒有內容的 POST 不標 JSON：Fastify 會拒絕標了 JSON 卻是空的內容
    response = await fetch(path, {
      ...init,
      headers: { ...(init?.body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...init?.headers },
    });
  } catch {
    throw new ApiRequestError('連不上本機後端，請確認 pnpm dev 有在執行', 0);
  }
  const body = await readJson(response);
  if (!response.ok) {
    const parsed = apiErrorSchema.safeParse(body);
    throw parsed.success
      ? new ApiRequestError(parsed.data.message, response.status, parsed.data.fieldErrors)
      : new ApiRequestError(`後端回應錯誤（${response.status}）`, response.status);
  }
  return body;
}

export async function fetchSeriesList(): Promise<Series[]> {
  return seriesListResponseSchema.parse(await request('/api/series')).series;
}

export async function postSeries(input: CreateSeriesInput): Promise<Series> {
  const body = await request('/api/series', { method: 'POST', body: JSON.stringify(input) });
  return seriesResponseSchema.parse(body).series;
}

export async function searchTemples(q: string, signal?: AbortSignal): Promise<TempleSummary[]> {
  const body = await request(`/api/temples?${new URLSearchParams({ q, limit: '20' })}`, { signal });
  return templeSearchResponseSchema.parse(body).temples;
}

export async function postVideo(input: { seriesId: string; templeId: string }): Promise<Video> {
  const body = await request('/api/videos', { method: 'POST', body: JSON.stringify(input) });
  return videoResponseSchema.parse(body).video;
}

export async function fetchVideoDetail(videoId: string): Promise<VideoDetail> {
  return videoDetailResponseSchema.parse(await request(`/api/videos/${encodeURIComponent(videoId)}`));
}

export async function patchVideo(videoId: string, input: UpdateVideoInput): Promise<Video> {
  const body = await request(`/api/videos/${encodeURIComponent(videoId)}`, { method: 'PATCH', body: JSON.stringify(input) });
  return videoResponseSchema.parse(body).video;
}

/** 原圖只送到本機後端，存在 data/assets/originals/，永遠不會送往雲端 */
export async function postOriginalPhoto(videoId: string, image: ImageUpload): Promise<Asset> {
  const body = await request(`/api/videos/${encodeURIComponent(videoId)}/photos/originals`, {
    method: 'POST',
    body: JSON.stringify(image),
  });
  return assetResponseSchema.parse(body).asset;
}

export async function postPhoto(videoId: string, input: CreatePhotoInput): Promise<Photo> {
  const body = await request(`/api/videos/${encodeURIComponent(videoId)}/photos`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return photoResponseSchema.parse(body).photo;
}

export async function patchPhoto(videoId: string, photoId: string, input: UpdatePhotoInput): Promise<Photo> {
  const body = await request(`/api/videos/${encodeURIComponent(videoId)}/photos/${encodeURIComponent(photoId)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  return photoResponseSchema.parse(body).photo;
}

/** 本機後端上的檔案網址 */
export function assetUrl(assetId: string): string {
  return `/api/assets/${encodeURIComponent(assetId)}`;
}

// ── 費用（第 4 階段 API）與寺廟定裝版（第 5 階段） ──

/** 需要同意卻沒有同意憑證：後端回 409 並附上預估 */
export class ConsentRequiredError extends ApiRequestError {
  constructor(readonly check: CostCheck) {
    super('這次生成需要先同意費用', 409);
    this.name = 'ConsentRequiredError';
  }
}

export async function postCostEstimate(videoId: string, items: CostItem[]): Promise<CostCheck> {
  const body = await request(`/api/videos/${videoId}/cost-estimate`, { method: 'POST', body: JSON.stringify({ items }) });
  return costCheckSchema.parse(body);
}

export async function postConsent(videoId: string, items: CostItem[]): Promise<string> {
  const body = await request(`/api/videos/${videoId}/consents`, { method: 'POST', body: JSON.stringify({ items }) });
  return consentResponseSchema.parse(body).consentToken;
}

export async function fetchVideoBudget(videoId: string): Promise<Budget> {
  const body = await request(`/api/videos/${videoId}/cost`);
  return budgetResponseSchema.parse(body).budget;
}

/** 送出生成：409 且附上 check 時丟出 ConsentRequiredError */
async function requestGeneration(path: string, payload: unknown): Promise<TempleBoard> {
  const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).catch(
    () => {
      throw new ApiRequestError('連不上本機後端，請確認 pnpm dev 有在執行', 0);
    },
  );
  const body = await readJson(response);
  if (response.status === 409) {
    const consent = consentRequiredResponseSchema.safeParse(body);
    if (consent.success) throw new ConsentRequiredError(consent.data.check);
  }
  if (!response.ok) {
    const parsed = apiErrorSchema.safeParse(body);
    throw parsed.success
      ? new ApiRequestError(parsed.data.message, response.status, parsed.data.fieldErrors)
      : new ApiRequestError(`後端回應錯誤（${response.status}）`, response.status);
  }
  return templeBoardResponseSchema.parse(body).board;
}

export async function fetchTempleBoard(videoId: string): Promise<TempleBoard> {
  return templeBoardResponseSchema.parse(await request(`/api/videos/${videoId}/temple-board`)).board;
}

export function generateTempleBoard(videoId: string, input: GenerateTempleBoardInput): Promise<TempleBoard> {
  return requestGeneration(`/api/videos/${videoId}/temple-board/generate`, input);
}

export function regenerateTempleView(videoId: string, viewKey: string, input: RegenerateTempleViewInput): Promise<TempleBoard> {
  return requestGeneration(`/api/videos/${videoId}/temple-board/views/${viewKey}/regenerate`, input);
}

export async function confirmTempleView(videoId: string, viewKey: string): Promise<TempleBoard> {
  const body = await request(`/api/videos/${videoId}/temple-board/views/${viewKey}/confirm`, { method: 'POST', body: '{}' });
  return templeBoardResponseSchema.parse(body).board;
}

export async function patchTempleBoard(videoId: string, input: UpdateTempleBoardInput): Promise<TempleBoard> {
  const body = await request(`/api/videos/${videoId}/temple-board`, { method: 'PATCH', body: JSON.stringify(input) });
  return templeBoardResponseSchema.parse(body).board;
}

export async function confirmTempleBoard(videoId: string): Promise<Video> {
  const body = await request(`/api/videos/${videoId}/temple-board/confirm`, { method: 'POST', body: '{}' });
  return videoResponseSchema.parse(body).video;
}

export async function reuseTempleBoard(videoId: string): Promise<TempleBoard> {
  const body = await request(`/api/videos/${videoId}/temple-board/reuse`, { method: 'POST', body: '{}' });
  return templeBoardResponseSchema.parse(body).board;
}

export async function saveTempleBoardVersion(videoId: string): Promise<TempleBoard> {
  const body = await request(`/api/videos/${videoId}/temple-board/versions`, { method: 'POST', body: '{}' });
  return templeBoardResponseSchema.parse(body).board;
}

// ── 創作工作區（第 6 階段） ──

export async function fetchChat(videoId: string): Promise<ChatMessage[]> {
  return chatListResponseSchema.parse(await request(`/api/videos/${videoId}/chat`)).messages;
}

/** 對 Agent 說一句話：回應以 SSE 串流，每收到一則事件就交給 onEvent */
export async function streamChat(videoId: string, content: string, onEvent: (event: ChatEvent) => void): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`/api/videos/${videoId}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify({ content }),
    });
  } catch {
    throw new ApiRequestError('連不上本機後端，請確認 pnpm dev 有在執行', 0);
  }
  await readChatStream(response, onEvent);
}

export async function fetchQuestionnaire(videoId: string): Promise<Questionnaire | null> {
  return questionnaireResponseSchema.parse(await request(`/api/videos/${videoId}/questionnaire`)).questionnaire;
}

export async function putQuestionnaire(videoId: string, answers: AnswerInput[]): Promise<{ questionnaire: Questionnaire; seriesDefaultsSaved: boolean }> {
  return submitQuestionnaireResponseSchema.parse(
    await request(`/api/videos/${videoId}/questionnaire`, { method: 'PUT', body: JSON.stringify({ answers }) }),
  );
}

export async function postAssist(input: AssistRequest): Promise<AssistLog> {
  return assistResponseSchema.parse(await request('/api/assist', { method: 'POST', body: JSON.stringify(input) })).log;
}

export async function adoptAssist(id: string): Promise<AssistLog> {
  return assistResponseSchema.parse(await request(`/api/assist/${id}/adopt`, { method: 'POST' })).log;
}

// ── 分鏡方案（第 7 階段） ──

export async function fetchPlan(videoId: string): Promise<PlanResponse> {
  return planResponseSchema.parse(await request(`/api/videos/${videoId}/plan`));
}

export async function fetchPlanVersion(videoId: string, version: number): Promise<Plan> {
  return planVersionResponseSchema.parse(await request(`/api/videos/${videoId}/plan/versions/${version}`)).plan;
}

export async function generatePlan(videoId: string): Promise<Plan> {
  return planVersionResponseSchema.parse(await request(`/api/videos/${videoId}/plan/generate`, { method: 'POST' })).plan;
}

export async function postPlanVersion(videoId: string, input: CreatePlanVersionInput): Promise<Plan> {
  return planVersionResponseSchema.parse(await request(`/api/videos/${videoId}/plan/versions`, { method: 'POST', body: JSON.stringify(input) })).plan;
}

// ── 角色定裝版、補充視角（第 8 階段） ──

/** 需要同意費用時後端回 409；呼叫端改走同意流程 */
async function postGenerate(path: string, body: Record<string, unknown>): Promise<void> {
  await request(path, { method: 'POST', body: JSON.stringify(body) });
}

export async function patchCharacter(characterId: string, input: UpdateCharacterInput): Promise<Character> {
  return characterResponseSchema.parse(await request(`/api/characters/${characterId}`, { method: 'PATCH', body: JSON.stringify(input) })).character;
}

export async function generateCharacter(characterId: string, videoId: string, consentToken: string | undefined): Promise<void> {
  await postGenerate(`/api/characters/${characterId}/generate`, { videoId, ...(consentToken ? { consentToken } : {}) });
}

export async function confirmCharacter(characterId: string): Promise<Character> {
  return characterResponseSchema.parse(await request(`/api/characters/${characterId}/confirm`, { method: 'POST' })).character;
}

export async function setSeriesCharacter(characterId: string): Promise<Character> {
  return characterResponseSchema.parse(await request(`/api/characters/${characterId}/series`, { method: 'POST' })).character;
}

export async function addSupplementalView(videoId: string, viewName: string, consentToken: string | undefined): Promise<void> {
  await postGenerate(`/api/videos/${videoId}/temple-board/supplemental-views`, { viewName, ...(consentToken ? { consentToken } : {}) });
}

export async function confirmSupplementalView(videoId: string, viewKey: string): Promise<void> {
  await request(`/api/videos/${videoId}/temple-board/supplemental-views/${encodeURIComponent(viewKey)}/confirm`, { method: 'POST' });
}

// ── 精緻圖（第 9 階段） ──

export async function fetchFrames(videoId: string): Promise<FramesResponse> {
  return framesResponseSchema.parse(await request(`/api/videos/${videoId}/frames`));
}

export async function generateFrames(videoId: string, consentToken: string | undefined): Promise<void> {
  await request(`/api/videos/${videoId}/generate/frames`, { method: 'POST', body: JSON.stringify(consentToken ? { consentToken } : {}) });
}

export async function regenerateFrame(videoId: string, shotKey: string, consentToken: string | undefined): Promise<void> {
  await request(`/api/videos/${videoId}/shots/${shotKey}/regenerate`, { method: 'POST', body: JSON.stringify({ kind: 'first', ...(consentToken ? { consentToken } : {}) }) });
}

export async function confirmFrame(videoId: string, shotKey: string): Promise<FramesResponse> {
  return framesResponseSchema.parse(await request(`/api/videos/${videoId}/shots/${shotKey}/frames/confirm`, { method: 'POST' }));
}
