import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AIAssistButton } from './AIAssistButton';

describe('AI 幫我寫按鈕', () => {
  it('名稱是「AI 幫我寫」，點擊會呼叫 onClick', async () => {
    const onClick = vi.fn();
    render(<AIAssistButton onClick={onClick} />);

    await userEvent.click(screen.getByRole('button', { name: 'AI 幫我寫' }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('有圖示（星芒）', () => {
    const { container } = render(<AIAssistButton onClick={() => undefined} />);
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('不能按時旁邊顯示原因，並以 aria-describedby 關聯', () => {
    render(<AIAssistButton disabledReason="AI 輔助撰寫將在之後的版本開放" />);

    const button = screen.getByRole('button', { name: 'AI 幫我寫' });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription('AI 輔助撰寫將在之後的版本開放');
    expect(screen.getByText('AI 輔助撰寫將在之後的版本開放')).toBeVisible();
  });
});
