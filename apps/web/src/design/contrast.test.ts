import { beforeAll, describe, expect, it } from 'vitest';
import tokensCss from '../tokens.css?raw';
import { contrastRatio, parseCssTokens } from './contrast';

describe('對比值計算', () => {
  it('黑底白字是 21', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
  });

  it('同色是 1', () => {
    expect(contrastRatio('#b3261e', '#B3261E')).toBeCloseTo(1, 5);
  });

  it('前後景交換結果相同', () => {
    expect(contrastRatio('#1f1a17', '#f7f5f0')).toBeCloseTo(contrastRatio('#f7f5f0', '#1f1a17'), 10);
  });

  it('讀出 CSS 的 token', () => {
    expect(parseCssTokens(':root {\n  --color-bg: #F7F5F0;\n  --space-1: 4px;\n}')).toEqual({
      '--color-bg': '#F7F5F0',
      '--space-1': '4px',
    });
  });
});

describe('設計 token 的文字對比至少 4.5:1（04 互動與無障礙）', () => {
  let tokens: Record<string, string> = {};
  beforeAll(() => {
    tokens = parseCssTokens(tokensCss);
  });
  const color = (name: string) => {
    const value = tokens[name];
    if (!value) throw new Error(`tokens.css 沒有 ${name}`);
    return value;
  };

  it.each([
    ['--color-text', '--color-bg'],
    ['--color-text', '--color-surface'],
    ['--color-text-secondary', '--color-bg'],
    ['--color-text-muted', '--color-bg'],
    ['--color-text-muted', '--color-surface'],
    ['--color-text', '--color-surface-muted'],
    ['--color-surface', '--color-primary'],
    ['--color-surface', '--color-text'],
    ['--color-ai-text', '--color-surface'],
    ['--color-ai-text', '--color-ai-surface'],
    ['--color-text', '--color-warning-surface'],
    ['--color-success', '--color-success-surface'],
    ['--color-error', '--color-error-surface'],
    ['--color-error', '--color-surface'],
    ['--color-info', '--color-info-surface'],
  ])('%s 在 %s 上', (foreground, background) => {
    expect(contrastRatio(color(foreground), color(background))).toBeGreaterThanOrEqual(4.5);
  });
});
