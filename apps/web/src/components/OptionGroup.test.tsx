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

  it('「或自己寫」旁可以放附加元件（例如 AI 幫我寫）', () => {
    render(
      <OptionGroup
        legend="語氣"
        options={[{ value: '溫暖', label: '溫暖' }]}
        value={null}
        onChange={() => undefined}
        other={{ value: '', onChange: () => undefined, accessory: <button type="button">AI 幫我寫：語氣（或自己寫）</button> }}
      />,
    );

    const group = screen.getByRole('group', { name: '語氣' });
    expect(within(group).getByRole('button', { name: 'AI 幫我寫：語氣（或自己寫）' })).toBeVisible();
  });

  it('群組標題旁可以放標籤，不會改變群組的名稱', () => {
    render(
      <OptionGroup legend="語氣" legendAccessory={<span>系列預設</span>} options={[{ value: '溫暖', label: '溫暖' }]} value={null} onChange={() => undefined} />,
    );

    const group = screen.getByRole('group', { name: '語氣' });
    expect(within(group).getByText('系列預設')).toBeVisible();
  });
});
