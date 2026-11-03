import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Timeline } from './Timeline';

const shots = [
  { shotKey: 'a', seq: 1, startSec: 0, durationSec: 6 },
  { shotKey: 'b', seq: 2, startSec: 6, durationSec: 8 },
  { shotKey: 'c', seq: 3, startSec: 14, durationSec: 2 },
];

describe('時間軸', () => {
  it('以「時間軸」標示，每格一段，顯示總長度與目標長度', () => {
    render(<Timeline shots={shots} totalSec={16} targetSec={30} onChange={() => undefined} />);
    const region = screen.getByRole('region', { name: '時間軸' });
    expect(within(region).getAllByRole('listitem')).toHaveLength(3);
    expect(within(region).getByText('總長度 16 秒／目標長度 30 秒')).toBeVisible();
  });

  it('格與格之間的邊界是滑桿，值是邊界的秒數', () => {
    render(<Timeline shots={shots} totalSec={16} targetSec={30} onChange={() => undefined} />);
    const boundary = screen.getByRole('slider', { name: '第 1、2 格的邊界' });
    expect(boundary).toHaveAttribute('aria-valuenow', '6');
    expect(screen.getAllByRole('slider')).toHaveLength(2);
  });

  it('用方向鍵移動邊界：右鍵往後 1 秒、左鍵往前 1 秒', async () => {
    const onChange = vi.fn();
    render(<Timeline shots={shots} totalSec={16} targetSec={30} onChange={onChange} />);
    const boundary = screen.getByRole('slider', { name: '第 1、2 格的邊界' });

    boundary.focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(onChange).toHaveBeenLastCalledWith([7, 7, 2]);

    await userEvent.keyboard('{ArrowLeft}');
    expect(onChange).toHaveBeenLastCalledWith([5, 9, 2]);
  });

  it('總長度超過目標長度時提醒', () => {
    render(<Timeline shots={shots} totalSec={36} targetSec={30} onChange={() => undefined} />);
    expect(screen.getByText('總長度 36 秒／目標長度 30 秒')).toBeVisible();
    expect(screen.getByText('超過目標長度')).toBeVisible();
  });
});
