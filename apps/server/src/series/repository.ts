import type { CreateSeriesInput, Series, UpdateSeriesInput } from '@templeyard/shared';
import type { AppDatabase } from '../db/client.js';

/** 新資料需要的時間與 ID；測試可注入固定值 */
export type Clock = { now: () => Date; newId: () => string };

/** 系列列表：新建立的在前面 */
export function listSeries(_db: AppDatabase): Series[] {
  throw new Error('尚未實作');
}

export function createSeries(_db: AppDatabase, _input: CreateSeriesInput, _clock: Clock): Series {
  throw new Error('尚未實作');
}

/** 找不到時回傳 null */
export function updateSeries(
  _db: AppDatabase,
  _id: string,
  _input: UpdateSeriesInput,
  _clock: Clock,
): Series | null {
  throw new Error('尚未實作');
}
