import {
  apiErrorSchema,
  assetResponseSchema,
  assistResponseSchema,
  characterListResponseSchema,
  characterUsageResponseSchema,
  characterVersionsResponseSchema,
  libraryCharactersResponseSchema,
  questionnaireDefaultsViewSchema,
  settingsSchema,
  characterResponseSchema,
  chatListResponseSchema,
  clipsResponseSchema,
  seriesVideosResponseSchema,
  shotDetailSchema,
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
  type ClipsResponse,
  type SeriesVideosResponse,
  type ShotDetail,
  type ShotPatch,
  type Budget,
  type CostCheck,
  type CostItem,
  type GenerateTempleBoardInput,
  type RegenerateTempleViewInput,
  type TempleBoard,
  type UpdateTempleBoardInput,
  type CreatePhotoInput,
  type CharacterPart,
  type CharacterScope,
  type CharacterUsageItem,
  type CharacterVersion,
  type CreateSeriesCharacterInput,
  type DefaultsPatch,
  type LibraryCharacter,
  type QuestionnaireDefaultsView,
  type Settings,
  type VideoFilter,
  type VideoSort,
  type CreateSeriesInput,
  type ImageUpload,
  type Photo,
  type Series,
  type TempleSummary,
  type UpdateCharacterInput,
  type UpdateSeriesInput,
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

/** 修改系列設定（使用者 2026-11-05 提出） */
export async function patchSeries(seriesId: string, input: UpdateSeriesInput): Promise<Series> {
  const body = await request(`/api/series/${seriesId}`, { method: 'PATCH', body: JSON.stringify(input) });
  return seriesResponseSchema.parse(body).series;
}

/** 系列角色庫（使用者 2026-11-05 提出） */
export async function fetchSeriesCharacters(seriesId: string): Promise<Character[]> {
  return characterListResponseSchema.parse(await request(`/api/series/${seriesId}/characters`)).characters;
}

export async function postSeriesCharacter(seriesId: string, input: CreateSeriesCharacterInput): Promise<Character> {
  const body = await request(`/api/series/${seriesId}/characters`, { method: 'POST', body: JSON.stringify(input) });
  return characterResponseSchema.parse(body).character;
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

/** 費用的範圍：影片編號，或系列角色庫的系列（不屬於任何影片） */
export type CostScope = string | { seriesId: string };

function costPath(scope: CostScope): string {
  return typeof scope === 'string' ? `/api/videos/${scope}` : `/api/series/${scope.seriesId}`;
}

export async function postCostEstimate(scope: CostScope, items: CostItem[]): Promise<CostCheck> {
  const body = await request(`${costPath(scope)}/cost-estimate`, { method: 'POST', body: JSON.stringify({ items }) });
  return costCheckSchema.parse(body);
}

export async function postConsent(scope: CostScope, items: CostItem[]): Promise<string> {
  const body = await request(`${costPath(scope)}/consents`, { method: 'POST', body: JSON.stringify({ items }) });
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

/** 對話的網址：有 shotKey 時是細修頁這一格的對話 */
function chatPath(videoId: string, shotKey?: string) {
  return shotKey ? `/api/videos/${videoId}/shots/${shotKey}/chat` : `/api/videos/${videoId}/chat`;
}

export async function fetchChat(videoId: string, shotKey?: string): Promise<ChatMessage[]> {
  return chatListResponseSchema.parse(await request(chatPath(videoId, shotKey))).messages;
}

/** 對 Agent 說一句話：回應以 SSE 串流，每收到一則事件就交給 onEvent */
export async function streamChat(videoId: string, content: string, onEvent: (event: ChatEvent) => void, shotKey?: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch(chatPath(videoId, shotKey), {
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

/** videoId 為 null：系列角色庫，用系列的預設圖片模型；part：只重生三視圖或定裝圖（第 14 階段） */
export async function generateCharacter(characterId: string, videoId: string | null, consentToken: string | undefined, part?: CharacterPart): Promise<void> {
  await postGenerate(`/api/characters/${characterId}/generate`, { ...(videoId ? { videoId } : {}), ...(consentToken ? { consentToken } : {}), ...(part ? { part } : {}) });
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

// ── 分鏡細修（第 10 階段） ──

export async function fetchShotDetail(videoId: string, shotKey: string): Promise<ShotDetail> {
  return shotDetailSchema.parse(await request(`/api/videos/${videoId}/shots/${shotKey}`));
}

export async function patchShot(videoId: string, shotKey: string, patch: ShotPatch): Promise<void> {
  await request(`/api/videos/${videoId}/shots/${shotKey}`, { method: 'PATCH', body: JSON.stringify(patch) });
}

export async function uploadShotFrame(videoId: string, shotKey: string, input: { kind: 'first' | 'last'; mime: string; dataBase64: string }): Promise<void> {
  await request(`/api/videos/${videoId}/shots/${shotKey}/frames/upload`, { method: 'POST', body: JSON.stringify(input) });
}

export async function selectShotFrame(videoId: string, shotKey: string, frameId: string): Promise<void> {
  await request(`/api/videos/${videoId}/shots/${shotKey}/frames/${frameId}/select`, { method: 'POST' });
}

export async function editShotRegion(
  videoId: string,
  shotKey: string,
  frameId: string,
  input: { box: { x: number; y: number; width: number; height: number }; instruction: string; consentToken?: string },
): Promise<void> {
  await request(`/api/videos/${videoId}/shots/${shotKey}/frames/${frameId}/edit`, { method: 'POST', body: JSON.stringify(input) });
}

export async function generateShotKeyframes(videoId: string, shotKey: string, consentToken: string | undefined): Promise<void> {
  await request(`/api/videos/${videoId}/shots/${shotKey}/keyframes/generate`, { method: 'POST', body: JSON.stringify(consentToken ? { consentToken } : {}) });
}

// ── 分鏡影片與成品（第 11 階段） ──

export async function fetchClips(videoId: string): Promise<ClipsResponse> {
  return clipsResponseSchema.parse(await request(`/api/videos/${videoId}/clips`));
}

/** 生成影片：需要同意時回傳後端的預估項目（影片秒數、背景音樂），同意後再帶憑證送一次 */
export async function startClips(videoId: string, consentToken: string | undefined): Promise<{ status: 'started' } | { status: 'consent'; items: CostItem[] }> {
  let response: Response;
  try {
    response = await fetch(`/api/videos/${videoId}/generate/clips`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(consentToken ? { consentToken } : {}),
    });
  } catch {
    throw new ApiRequestError('連不上本機後端，請確認 pnpm dev 有在執行', 0);
  }
  const body = await readJson(response);
  if (response.ok) return { status: 'started' };
  const consent = consentRequiredResponseSchema.safeParse(body);
  if (response.status === 409 && consent.success) {
    return { status: 'consent', items: consent.data.check.estimate.lines.map((line) => ({ model: line.model, units: line.units })) };
  }
  const parsed = apiErrorSchema.safeParse(body);
  throw new ApiRequestError(parsed.success ? parsed.data.message : `後端回應錯誤（${response.status}）`, response.status);
}

// ── 成品的確認、下載與複製影片（第 12 階段） ──

export async function confirmFinal(videoId: string): Promise<void> {
  await request(`/api/videos/${videoId}/final/confirm`, { method: 'POST' });
}

export function finalDownloadUrl(videoId: string): string {
  return `/api/videos/${videoId}/final/download`;
}

export async function copyVideo(videoId: string): Promise<Video> {
  return videoResponseSchema.parse(await request(`/api/videos/${videoId}/copy`, { method: 'POST' })).video;
}

// ── 系列設定的影片列表（2026-11-04） ──

export async function fetchSeriesVideos(seriesId: string, options: { status?: VideoFilter; sort?: VideoSort } = {}): Promise<SeriesVideosResponse> {
  const query = new URLSearchParams();
  if (options.status) query.set('status', options.status);
  if (options.sort) query.set('sort', options.sort);
  const suffix = query.size > 0 ? `?${query.toString()}` : '';
  return seriesVideosResponseSchema.parse(await request(`/api/series/${seriesId}/videos${suffix}`));
}

// ── 系列頁（第 14 階段）：角色庫、角色詳情、問卷預設值、費用設定 ──

export async function fetchLibraryCharacters(seriesId: string, options: { scope?: CharacterScope; q?: string } = {}): Promise<LibraryCharacter[]> {
  const query = new URLSearchParams();
  if (options.scope) query.set('scope', options.scope);
  if (options.q) query.set('q', options.q);
  const suffix = query.size > 0 ? `?${query.toString()}` : '';
  return libraryCharactersResponseSchema.parse(await request(`/api/series/${seriesId}/characters${suffix}`)).characters;
}

export async function fetchCharacterVersions(characterId: string): Promise<CharacterVersion[]> {
  return characterVersionsResponseSchema.parse(await request(`/api/characters/${characterId}/versions`)).versions;
}

export async function fetchCharacterUsage(characterId: string): Promise<CharacterUsageItem[]> {
  return characterUsageResponseSchema.parse(await request(`/api/characters/${characterId}/usage`)).videos;
}

export async function fetchQuestionnaireDefaults(seriesId: string): Promise<QuestionnaireDefaultsView> {
  return questionnaireDefaultsViewSchema.parse(await request(`/api/series/${seriesId}/questionnaire-defaults`));
}

export async function patchQuestionnaireDefaults(seriesId: string, defaults: DefaultsPatch): Promise<QuestionnaireDefaultsView> {
  const body = await request(`/api/series/${seriesId}/questionnaire-defaults`, { method: 'PATCH', body: JSON.stringify({ defaults }) });
  return questionnaireDefaultsViewSchema.parse(body);
}

export async function fetchSettings(): Promise<Settings> {
  const body = (await request('/api/settings')) as { settings?: unknown };
  return settingsSchema.parse(body.settings);
}

export async function patchSettings(input: Partial<Settings>): Promise<Settings> {
  const body = (await request('/api/settings', { method: 'PATCH', body: JSON.stringify(input) })) as { settings?: unknown };
  return settingsSchema.parse(body.settings);
}
