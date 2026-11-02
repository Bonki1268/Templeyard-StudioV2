import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { OptionGroup } from './OptionGroup';

const options = [
  { value: 15, label: '15 秒' },
  { value: 30, label: '30 秒' },
] as const;

describe('選項按鈕群組', () => {
  it('以群組名稱標示，選取的選項 aria-pressed 為 true', () => {
    render(<OptionGroup legend="影片秒數" options={options} value={30} onChange={() => undefined} />);

    const group = screen.getByRole('group', { name: '影片秒數' });
    expect(within(group).getByRole('button', { name: '30 秒' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(group).getByRole('button', { name: '15 秒' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('點選項時回傳該選項的值', async () => {
    const onChange = vi.fn();
    render(<OptionGroup legend="影片秒數" options={options} value={30} onChange={onChange} />);

    await userEvent.click(screen.getByRole('button', { name: '15 秒' }));

    expect(onChange).toHaveBeenCalledWith(15);
  });

  it('有「或自己寫」時顯示輸入框，輸入內容回傳給上層', async () => {
    const onOther = vi.fn();
    render(
      <OptionGroup
        legend="影片方向"
        options={[{ value: '歷史故事', label: '歷史故事' }]}
        value={null}
        onChange={() => undefined}
        other={{ value: '', onChange: onOther }}
      />,
    );

    const group = screen.getByRole('group', { name: '影片方向' });
    await userEvent.type(within(group).getByLabelText('或自己寫'), '美');

    expect(onOther).toHaveBeenCalledWith('美');
  });

  it('沒有選取任何選項時，全部 aria-pressed 為 false', () => {
    render(<OptionGroup legend="影片秒數" options={options} value={null} onChange={() => undefined} />);
    for (const button of screen.getAllByRole('button')) {
      expect(button).toHaveAttribute('aria-pressed', 'false');
    }
  });
});
