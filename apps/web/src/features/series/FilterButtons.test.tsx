import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FilterButtons } from './FilterButtons';

const options = [
  { value: 'all', label: '全部', count: 5 },
  { value: 'wip', label: '製作中', count: 3 },
  { value: 'done', label: '完成', count: 2 },
] as const;

describe('篩選按鈕', () => {
  it('是有名稱的一組按鈕，名稱含數量', () => {
    render(<FilterButtons label="依狀態篩選" options={options} value="all" onChange={() => undefined} />);
    const group = screen.getByRole('group', { name: '依狀態篩選' });
    expect(Array.from(group.querySelectorAll('button')).map((b) => b.textContent)).toEqual(['全部 5', '製作中 3', '完成 2']);
  });

  it('目前選取的按鈕 aria-pressed 為 true，其他為 false', () => {
    render(<FilterButtons label="依狀態篩選" options={options} value="wip" onChange={() => undefined} />);
    expect(screen.getByRole('button', { name: '製作中 3' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '全部 5' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: '完成 2' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('按下按鈕時回報選到的值', async () => {
    const onChange = vi.fn();
    render(<FilterButtons label="依狀態篩選" options={options} value="all" onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: '完成 2' }));
    expect(onChange).toHaveBeenCalledWith('done');
  });
});
