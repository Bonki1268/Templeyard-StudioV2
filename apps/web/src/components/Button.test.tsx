import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './Button';

describe('按鈕', () => {
  it('是真正的 button，可以用名稱找到並點擊', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>建立系列</Button>);

    await userEvent.click(screen.getByRole('button', { name: '建立系列' }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('沒有指定 type 時是 button，不會意外送出表單', () => {
    render(<Button>取消</Button>);
    expect(screen.getByRole('button', { name: '取消' })).toHaveAttribute('type', 'button');
  });

  it('不能按時不會觸發點擊', async () => {
    const onClick = vi.fn();
    render(
      <Button variant="primary" disabled onClick={onClick}>
        建立系列
      </Button>,
    );

    await userEvent.click(screen.getByRole('button', { name: '建立系列' }));

    expect(screen.getByRole('button', { name: '建立系列' })).toBeDisabled();
    expect(onClick).not.toHaveBeenCalled();
  });
});
