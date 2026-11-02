// 同時執行數（02：依方案限制，Standard 1、Creator 3；超出時排隊）

export type Limiter = {
  run<T>(task: () => Promise<T>): Promise<T>;
  /** 正在執行的數量 */
  readonly active: number;
  /** 排隊中的數量 */
  readonly waiting: number;
};

export function createLimiter(_max: number): Limiter {
  throw new Error('尚未實作');
}
