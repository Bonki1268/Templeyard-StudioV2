import type { Plan, PlanDiff, PlanSource, PlanVersionSummary, Shot } from '@templeyard/shared';
import { asc, desc, eq, and } from 'drizzle-orm';
import type { AppDatabase } from '../db/client.js';
import { plans, shots, type PlanRow, type ShotRow } from '../db/schema.js';

// 分鏡方案與卡片的資料存取（05 plans、shots）

function toShot(row: ShotRow): Shot {
  return {
    shotKey: row.shotKey,
    seq: row.seq,
    startSec: row.startSec,
    durationSec: row.durationSec,
    shotSize: row.shotSize,
    cameraMove: row.cameraMove,
    cameraSpeed: row.cameraSpeed,
    cameraAngle: row.cameraAngle,
    description: row.description,
    actionStart: row.actionStart,
    actionEnd: row.actionEnd,
    viewKey: row.viewKey,
    lighting: row.lighting,
    characters: row.characterIds,
    dialogue: row.dialogue,
    speaker: row.speaker,
    subtitle: row.subtitle,
    photoId: row.photoId,
    keyframesEnabled: row.keyframesEnabled,
    keyframeTimes: row.keyframeTimes,
    customPrompt: row.customPrompt,
    factSources: row.factSources,
    dialogueEstimateSec: row.dialogueEstimateSec,
    // 生成設定只有設定過才帶出來
    ...(row.nativeVoice === null ? {} : { nativeVoice: row.nativeVoice }),
    ...(row.candidateCount === null ? {} : { candidateCount: row.candidateCount }),
  };
}

function toPlan(db: AppDatabase, row: PlanRow): Plan {
  const rows = db.select().from(shots).where(eq(shots.planId, row.id)).orderBy(asc(shots.seq)).all();
  return { id: row.id, videoId: row.videoId, version: row.version, styleNote: row.styleNote, source: row.source, diff: row.diff, createdAt: row.createdAt, shots: rows.map(toShot) };
}

/** 現行方案（最新版）；還沒有時為 null */
export function findCurrentPlan(db: AppDatabase, videoId: string): Plan | null {
  const row = db.select().from(plans).where(eq(plans.videoId, videoId)).orderBy(desc(plans.version)).get();
  return row ? toPlan(db, row) : null;
}

export function findPlanVersion(db: AppDatabase, videoId: string, version: number): Plan | null {
  const row = db.select().from(plans).where(and(eq(plans.videoId, videoId), eq(plans.version, version))).get();
  return row ? toPlan(db, row) : null;
}

export function listPlanVersions(db: AppDatabase, videoId: string): PlanVersionSummary[] {
  return db
    .select()
    .from(plans)
    .where(eq(plans.videoId, videoId))
    .orderBy(asc(plans.version))
    .all()
    .map((row) => ({ version: row.version, source: row.source, diff: row.diff, createdAt: row.createdAt }));
}

/** 這支影片所有版本用過的 shotKey */
export function knownShotKeys(db: AppDatabase, videoId: string): Set<string> {
  const rows = db.select({ shotKey: shots.shotKey }).from(shots).innerJoin(plans, eq(shots.planId, plans.id)).where(eq(plans.videoId, videoId)).all();
  return new Set(rows.map((row) => row.shotKey));
}

export function insertPlan(
  db: AppDatabase,
  plan: { id: string; videoId: string; version: number; styleNote: string; source: PlanSource; diff: PlanDiff; createdAt: string },
  rows: (Shot & { id: string })[],
): void {
  db.insert(plans).values(plan).run();
  if (rows.length === 0) return;
  db.insert(shots)
    .values(
      rows.map(({ id, characters, nativeVoice, candidateCount, ...shot }) => ({
        id,
        planId: plan.id,
        ...shot,
        characterIds: characters,
        nativeVoice: nativeVoice ?? null,
        candidateCount: candidateCount ?? null,
      })),
    )
    .run();
}
