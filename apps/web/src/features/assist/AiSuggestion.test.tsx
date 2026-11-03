import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AiSuggestion } from './AiSuggestion';

function setup(overrides: Partial<Parameters<typeof AiSuggestion>[0]> = {}) {
  const props = {
    field: '你想創作什麼',
    suggestion: '我想講板橋慈惠宮媽祖救漁民的故事',
    busy: false,
    error: null,
    onAdopt: vi.fn(),
    onRetry: vi.fn(),
    onDismiss: vi.fn(),
    ...overrides,
  };
  render(<AiSuggestion {...props} />);
  return props;
}

describe('AI 建議區塊', () => {
  it('以「AI 建議：欄位」標示區塊，標題「AI 建議」，顯示建議內容', () => {
    setup();
    const region = screen.getByRole('region', { name: 'AI 建議：你想創作什麼' });
    expect(region).toBeVisible();
    expect(screen.getByRole('heading', { name: 'AI 建議' })).toBeVisible();
    expect(screen.getByText('我想講板橋慈惠宮媽祖救漁民的故事')).toBeVisible();
  });

  it('「採用」「再寫一版」「略過」各自呼叫', async () => {
    const props = setup();
    await userEvent.click(screen.getByRole('button', { name: '採用' }));
    await userEvent.click(screen.getByRole('button', { name: '再寫一版' }));
    await userEvent.click(screen.getByRole('button', { name: '略過' }));
    expect(props.onAdopt).toHaveBeenCalledTimes(1);
    expect(props.onRetry).toHaveBeenCalledTimes(1);
    expect(props.onDismiss).toHaveBeenCalledTimes(1);
  });

  it('寫建議的時候說明正在寫，不能採用', () => {
    setup({ suggestion: null, busy: true });
    expect(screen.getByRole('status')).toHaveTextContent('AI 正在寫建議…');
    expect(screen.getByRole('button', { name: '採用' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '再寫一版' })).toBeDisabled();
  });

  it('失敗時說明原因，可以再寫一版，不能採用', () => {
    setup({ suggestion: null, error: 'AI 建議的格式不正確，請再試一次' });
    expect(screen.getByRole('alert')).toHaveTextContent('AI 建議的格式不正確，請再試一次');
    expect(screen.getByRole('button', { name: '採用' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '再寫一版' })).toBeEnabled();
  });
});
