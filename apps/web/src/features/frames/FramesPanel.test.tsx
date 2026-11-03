import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GeneratingPanel } from './FramesPanel';

// 第 9 階段稽核：「生成中」以 role="status" 宣告，不搶焦點（04）

describe('生成中面板', () => {
  it('以狀態訊息宣告「生成中」與內容類型', () => {
    render(<GeneratingPanel label="精緻圖・4 格" />);
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('生成中');
    expect(status).toHaveTextContent('精緻圖・4 格');
    expect(status).toHaveAttribute('aria-live', 'polite');
  });

  it('有圓形指示，對輔助科技隱藏', () => {
    render(<GeneratingPanel label="精緻圖・4 格" />);
    expect(screen.getByTestId('generating-indicator')).toHaveAttribute('aria-hidden', 'true');
  });
});
