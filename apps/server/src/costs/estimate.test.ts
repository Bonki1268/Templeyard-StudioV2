import { loadWorkflowConfig, workflowsFile } from '@templeyard/prompts';
import type { Budget, WorkflowConfig } from '@templeyard/shared';
import { describe, expect, it } from 'vitest';
import { UnknownModelError, checkConsent, estimateCost } from './estimate.js';

let loaded: WorkflowConfig | undefined;

/** 用到時才讀設定檔：讀取失敗時，每個測試各自失敗 */
function config(): WorkflowConfig {
  loaded ??= loadWorkflowConfig(workflowsFile);
  return loaded;
}
const budget = (patch: Partial<Budget> = {}): Budget => ({ spent: 0, reserved: 0, limit: null, threshold: 200, ...patch });

describe('依參考單價預估費用', () => {
  it('Gemini Omni 每秒約 31 點：4 秒 124 點', () => {
    expect(estimateCost([{ model: 'gemini-omni-1.1-flash', units: 4 }], config())).toEqual({
      credits: 124,
      lines: [{ model: 'gemini-omni-1.1-flash', units: 4, unitCredits: 31, credits: 124 }],
    });
  });

  it('多項加總', () => {
    expect(
      estimateCost(
        [
          { model: 'gemini-omni-1.1-flash', units: 4 },
          { model: 'gemini-omni-1.1-flash', units: 6 },
        ],
        config(),
      ).credits,
    ).toBe(310);
  });

  it('不是整數點時四捨五入', () => {
    expect(estimateCost([{ model: 'gemini-omni-1.1-flash', units: 2.5 }], config()).credits).toBe(78);
  });

  it('有一項單價待實測時總額是 null，那一項也是 null', () => {
    const estimate = estimateCost(
      [
        { model: 'gemini-omni-1.1-flash', units: 4 },
        { model: 'nano-banana-pro', units: 1 },
      ],
      config(),
    );
    expect(estimate.credits).toBeNull();
    expect(estimate.lines[1]).toEqual({ model: 'nano-banana-pro', units: 1, unitCredits: null, credits: null });
  });

  it('模型不在設定檔時丟出 UnknownModelError，指出是第幾項', () => {
    const error = (() => {
      try {
        estimateCost([{ model: 'gemini-omni-1.1-flash', units: 1 }, { model: 'no-such', units: 1 }], config());
      } catch (e: unknown) {
        return e;
      }
      return null;
    })();
    expect(error).toBeInstanceOf(UnknownModelError);
    expect(error).toMatchObject({ index: 1, model: 'no-such' });
  });
});

describe('要不要再次同意', () => {
  const gemini4 = () => estimateCost([{ model: 'gemini-omni-1.1-flash', units: 4 }], config());

  it.each([
    ['門檻內、沒有上限', budget(), false, []],
    ['剛好等於門檻', budget({ threshold: 124 }), false, []],
    ['超過單筆門檻', budget({ threshold: 100 }), true, ['這次預估 124 點，超過單筆同意門檻 100 點']],
    ['已用＋預留＋這次超過上限', budget({ spent: 900, reserved: 50, limit: 1000 }), true, ['加上這次預估 124 點，會超過這支影片的上限 1000 點']],
    ['剛好用到上限', budget({ spent: 876, limit: 1000 }), false, []],
    ['還沒設定門檻', budget({ threshold: null }), true, ['還沒設定單筆同意門檻，每次付費生成都要同意']],
    [
      '同時超過門檻與上限',
      budget({ threshold: 100, limit: 100 }),
      true,
      ['這次預估 124 點，超過單筆同意門檻 100 點', '加上這次預估 124 點，會超過這支影片的上限 100 點'],
    ],
  ])('%s', (_name, b, required, messages) => {
    const result = checkConsent(gemini4(), b, config());
    expect(result.required).toBe(required);
    expect(result.reasons.map((r) => r.message)).toEqual(messages);
  });

  it('單價待實測時一定要同意，並指出是哪個模型', () => {
    const result = checkConsent(estimateCost([{ model: 'seedance-2.0', units: 5 }], config()), budget({ threshold: 5000 }), config());
    expect(result).toEqual({
      required: true,
      reasons: [{ code: 'price_unknown', message: 'Seedance 2.0 的參考單價還沒實測，無法預估' }],
    });
  });

  it('原因附上代號', () => {
    expect(checkConsent(gemini4(), budget({ threshold: 100 }), config()).reasons[0]?.code).toBe('over_threshold');
  });
});
