import { describe, expect, it } from 'vitest';
import { creditsText } from './costs.js';

describe('點數的顯示文字', () => {
  it('有數字時顯示「N 點」', () => {
    expect(creditsText(124)).toBe('124 點');
  });

  it('大數字加上千分位', () => {
    expect(creditsText(12400)).toBe('12,400 點');
  });

  it('無法預估時以方括號占位', () => {
    expect(creditsText(null)).toBe('[待實測]');
  });
});
