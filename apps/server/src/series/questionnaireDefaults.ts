import {
  applyDefaultsPatch,
  defaultRows,
  questionnaireDefaultsSchema,
  validateDefaultsPatch,
  videoTitle,
  type QuestionnaireDefaultsView,
  type DefaultsPatch,
  type QuestionnaireDefaults,
} from '@templeyard/shared';
import { eq } from 'drizzle-orm';
import type { AppDatabase } from '../db/client.js';
import { series, temples, videos } from '../db/schema.js';
import { firstSubmittedVideoId } from './videos.js';
import type { Clock } from './repository.js';

// 系列設定的問卷預設值（第 14 階段）：逐題列出、修改或清除，標明來源影片

export type PatchResult = { ok: true; view: QuestionnaireDefaultsView } | { ok: false; message: string };

function currentDefaults(value: unknown): QuestionnaireDefaults | null {
  const parsed = questionnaireDefaultsSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** 系列問卷預設值的畫面資料；系列不存在時回傳 null */
export function readQuestionnaireDefaults(db: AppDatabase, seriesId: string): QuestionnaireDefaultsView | null {
  const row = db.select().from(series).where(eq(series.id, seriesId)).get();
  if (!row) return null;
  const sourceId = firstSubmittedVideoId(db, seriesId);
  const source = sourceId
    ? db
        .select({ id: videos.id, creativeInput: videos.creativeInput, templeName: temples.name })
        .from(videos)
        .innerJoin(temples, eq(videos.templeId, temples.id))
        .where(eq(videos.id, sourceId))
        .get()
    : null;
  return {
    rows: defaultRows(currentDefaults(row.questionnaireDefaults), row.questionnaireDefaultEdits ?? []),
    sourceVideo: source ? { id: source.id, title: videoTitle(source.templeName, source.creativeInput) } : null,
  };
}

/** 修改或清除幾題的預設值；已建立的影片不受影響（問卷預設值在建立影片時保存）。系列不存在回傳 null */
export function patchQuestionnaireDefaults(db: AppDatabase, seriesId: string, patch: DefaultsPatch, clock: Clock): PatchResult | null {
  const row = db.select().from(series).where(eq(series.id, seriesId)).get();
  if (!row) return null;
  if (Object.keys(patch).length === 0) return { ok: false, message: '沒有要修改的題目' };
  const checked = validateDefaultsPatch(patch);
  if (!checked.ok) return checked;
  const next = applyDefaultsPatch(currentDefaults(row.questionnaireDefaults), patch);
  const edits = new Set(row.questionnaireDefaultEdits ?? []);
  for (const [questionId, answer] of Object.entries(patch)) {
    if (answer === null) edits.delete(questionId);
    else edits.add(questionId);
  }
  db.update(series)
    .set({ questionnaireDefaults: next, questionnaireDefaultEdits: [...edits], updatedAt: clock.now().toISOString() })
    .where(eq(series.id, seriesId))
    .run();
  const view = readQuestionnaireDefaults(db, seriesId);
  return view ? { ok: true, view } : null;
}
