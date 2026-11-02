import { describe, expect, it } from 'vitest';
import { createLimiter } from './queue.js';

function deferred() {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('同時執行數', () => {
  it('超過上限的任務排隊，前面的完成後才開始', async () => {
    const limiter = createLimiter(1);
    const first = deferred();
    const started: string[] = [];

    const a = limiter.run(async () => {
      started.push('a');
      await first.promise;
      return 'A';
    });
    const b = limiter.run(async () => {
      started.push('b');
      return 'B';
    });
    await Promise.resolve();

    expect(started).toEqual(['a']);
    expect([limiter.active, limiter.waiting]).toEqual([1, 1]);
    first.resolve();
    expect(await Promise.all([a, b])).toEqual(['A', 'B']);
    expect(started).toEqual(['a', 'b']);
    expect([limiter.active, limiter.waiting]).toEqual([0, 0]);
  });

  it('上限 3 時同時跑 3 個', async () => {
    const limiter = createLimiter(3);
    const gate = deferred();
    let running = 0;
    let peak = 0;
    const tasks = Array.from({ length: 5 }, () =>
      limiter.run(async () => {
        running += 1;
        peak = Math.max(peak, running);
        await gate.promise;
        running -= 1;
      }),
    );
    await Promise.resolve();
    gate.resolve();
    await Promise.all(tasks);
    expect(peak).toBe(3);
  });

  it('任務失敗時也會放出名額', async () => {
    const limiter = createLimiter(1);
    await expect(limiter.run(async () => Promise.reject(new Error('壞了')))).rejects.toThrow('壞了');
    expect(await limiter.run(async () => 'ok')).toBe('ok');
  });

  it('上限至少 1', () => {
    expect(() => createLimiter(0)).toThrow('同時執行數至少 1');
  });
});
