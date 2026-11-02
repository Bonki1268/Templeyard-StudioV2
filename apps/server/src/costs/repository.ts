import type { Settings } from '@templeyard/shared';
import type { AppDatabase } from '../db/client.js';

/** 這支影片已用（成功的實際費用）與預留（還沒結束的生成） */
export function videoSpending(_db: AppDatabase, _videoId: string): { spent: number; reserved: number } {
  throw new Error('尚未實作');
}

export function getSettings(_db: AppDatabase): Settings {
  throw new Error('尚未實作');
}

export function updateSettings(_db: AppDatabase, _input: Partial<Settings>): Settings {
  throw new Error('尚未實作');
}
