import { describe, expect, it } from 'vitest';
import { createConsentStore } from './consents.js';

function store(start = Date.UTC(2026, 10, 3, 9, 0)) {
  let now = start;
  let n = 0;
  return {
    advance: (ms: number) => {
      now += ms;
    },
    consents: createConsentStore({ now: () => new Date(now), newToken: () => `token-${++n}`, ttlMs: 10 * 60 * 1000 }),
  };
}

const items = [{ model: 'gemini-omni-1.1-flash', units: 4 }];

describe('同意憑證', () => {
  it('發出憑證，10 分鐘後過期', () => {
    const { consents } = store();
    expect(consents.issue('v1', items)).toEqual({ token: 'token-1', expiresAt: '2026-11-03T09:10:00.000Z' });
  });

  it('同一支影片、同樣的項目可以使用一次', () => {
    const { consents } = store();
    const { token } = consents.issue('v1', items);

    expect(consents.consume(token, 'v1', items)).toBe(true);
    expect(consents.consume(token, 'v1', items)).toBe(false);
  });

  it('換了影片或項目就不能用', () => {
    const { consents } = store();
    const { token } = consents.issue('v1', items);

    expect(consents.consume(token, 'v2', items)).toBe(false);
    expect(consents.consume(token, 'v1', [{ model: 'gemini-omni-1.1-flash', units: 6 }])).toBe(false);
    expect(consents.consume(token, 'v1', items)).toBe(true);
  });

  it('過期後不能用', () => {
    const { consents, advance } = store();
    const { token } = consents.issue('v1', items);
    advance(10 * 60 * 1000 + 1);

    expect(consents.consume(token, 'v1', items)).toBe(false);
  });

  it('沒有憑證或不認得的憑證都不能用', () => {
    const { consents } = store();
    expect(consents.consume(undefined, 'v1', items)).toBe(false);
    expect(consents.consume('made-up', 'v1', items)).toBe(false);
  });
});

describe('先確認同意憑證但不作廢', () => {
  it('條件和使用時相同，可以確認好幾次，使用後就不再有效', () => {
    const { consents } = store();
    const { token } = consents.issue('v1', items);

    expect(consents.peek(token, 'v1', items)).toBe(true);
    expect(consents.peek(token, 'v1', items)).toBe(true);
    expect(consents.peek(token, 'v2', items)).toBe(false);
    expect(consents.peek(token, 'v1', [{ model: 'gemini-omni-1.1-flash', units: 5 }])).toBe(false);
    expect(consents.consume(token, 'v1', items)).toBe(true);
    expect(consents.peek(token, 'v1', items)).toBe(false);
  });

  it('過期或沒有憑證時不通過', () => {
    const { consents, advance } = store();
    const { token } = consents.issue('v1', items);
    advance(10 * 60 * 1000 + 1);

    expect(consents.peek(token, 'v1', items)).toBe(false);
    expect(consents.peek(null, 'v1', items)).toBe(false);
  });
});
