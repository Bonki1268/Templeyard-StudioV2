import { describe, expect, it } from 'vitest';
import { referencePriceText } from './models.js';

describe('參考單價的顯示文字', () => {
  it('還沒實測時以方括號占位，不寫假數字', () => {
    expect(referencePriceText(null)).toBe('參考單價 [待實測]');
  });

  it('有單價時顯示約略點數', () => {
    expect(referencePriceText(31)).toBe('參考單價 約 31 點');
  });
});
