import type { ChatMessage, Questionnaire, QuestionnaireAnswer, ToolCallSummary } from '@templeyard/shared';
import { asc, eq, sql } from 'drizzle-orm';
import type { AppDatabase } from '../db/client.js';
import { chatMessages, questionnaires, type ChatMessageRow, type QuestionnaireRow } from '../db/schema.js';

// 對話紀錄與問卷的資料存取（05 chat_messages、questionnaires）

function toChatMessage(row: ChatMessageRow): ChatMessage {
  return { id: row.id, videoId: row.videoId, role: row.role, content: row.content, toolCalls: row.toolCalls, createdAt: row.createdAt };
}

/** 這支影片的對話（scope 為 video），依時間與寫入順序 */
export function listChatMessages(db: AppDatabase, videoId: string): ChatMessage[] {
  return db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.videoId, videoId))
    .orderBy(asc(chatMessages.createdAt), asc(sql`rowid`))
    .all()
    .map(toChatMessage);
}

export function insertChatMessage(
  db: AppDatabase,
  row: { id: string; videoId: string; role: 'user' | 'agent'; content: string; toolCalls: ToolCallSummary[]; createdAt: string },
): ChatMessage {
  return toChatMessage(db.insert(chatMessages).values({ ...row, scope: 'video', shotKey: null }).returning().get());
}

function toQuestionnaire(row: QuestionnaireRow): Questionnaire {
  return { id: row.id, videoId: row.videoId, answers: row.answers, submittedAt: row.submittedAt };
}

export function findQuestionnaire(db: AppDatabase, videoId: string): Questionnaire | null {
  const row = db.select().from(questionnaires).where(eq(questionnaires.videoId, videoId)).get();
  return row ? toQuestionnaire(row) : null;
}

export function insertQuestionnaire(db: AppDatabase, row: { id: string; videoId: string; answers: QuestionnaireAnswer[] }): Questionnaire {
  return toQuestionnaire(db.insert(questionnaires).values({ ...row, submittedAt: null }).returning().get());
}

export function updateQuestionnaire(
  db: AppDatabase,
  id: string,
  patch: { answers: QuestionnaireAnswer[]; submittedAt?: string | null },
): Questionnaire {
  return toQuestionnaire(db.update(questionnaires).set(patch).where(eq(questionnaires.id, id)).returning().get() as QuestionnaireRow);
}
