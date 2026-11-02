import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Tag } from './Tag';

describe('狀態標籤', () => {
  it('一定顯示文字', () => {
    render(<Tag tone="success">已去識別</Tag>);
    expect(screen.getByText('已去識別')).toBeInTheDocument();
  });

  it.each(['warning', 'error'] as const)('%s 標籤另外有圖示（不只靠顏色）', (tone) => {
    const { container } = render(<Tag tone={tone}>需重新確認</Tag>);
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('一般標籤只有文字、沒有圖示', () => {
    const { container } = render(<Tag>系列預設</Tag>);
    expect(screen.getByText('系列預設')).toBeInTheDocument();
    expect(container.querySelector('svg')).toBeNull();
  });
});
