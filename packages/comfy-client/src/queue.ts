// 同時執行數（02：依方案限制，Standard 1、Creator 3；超出時排隊）

export type Limiter = {
  run<T>(task: () => Promise<T>): Promise<T>;
  /** 正在執行的數量 */
  readonly active: number;
  /** 排隊中的數量 */
  readonly waiting: number;
};

export function createLimiter(max: number): Limiter {
  if (!Number.isInteger(max) || max < 1) throw new Error('同時執行數至少 1');
  let active = 0;
  const queue: (() => void)[] = [];

  function next() {
    if (active >= max) return;
    const start = queue.shift();
    if (start) start();
  }

  return {
    run<T>(task: () => Promise<T>): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        queue.push(() => {
          active += 1;
          task()
            .then(resolve, reject)
            .finally(() => {
              active -= 1;
              next();
            });
        });
        next();
      });
    },
    get active() {
      return active;
    },
    get waiting() {
      return queue.length;
    },
  };
}
