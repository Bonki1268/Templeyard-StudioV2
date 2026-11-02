import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TextField } from './TextField';

describe('輸入框', () => {
  it('標籤和輸入框綁在一起，可以用標籤找到', () => {
    render(<TextField label="系列名稱" value="" onChange={() => undefined} />);
    expect(screen.getByLabelText('系列名稱')).toBeInstanceOf(HTMLInputElement);
  });

  it('多行時是 textarea', () => {
    render(<TextField label="整體視覺風格" value="" onChange={() => undefined} multiline />);
    expect(screen.getByLabelText('整體視覺風格')).toBeInstanceOf(HTMLTextAreaElement);
  });

  it('輸入時回傳新的值', async () => {
    const onChange = vi.fn();
    render(<TextField label="系列名稱" value="" onChange={onChange} />);

    await userEvent.type(screen.getByLabelText('系列名稱'), '新');

    expect(onChange).toHaveBeenCalledWith('新');
  });

  it('有錯誤時顯示在欄位下方，並標示 aria-invalid 與說明關聯', () => {
    render(<TextField label="系列名稱" value="" onChange={() => undefined} error="請填寫系列名稱" />);

    const input = screen.getByLabelText('系列名稱');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('請填寫系列名稱');
  });

  it('沒有錯誤時不標示 aria-invalid', () => {
    render(<TextField label="系列名稱" value="廟宇" onChange={() => undefined} />);
    expect(screen.getByLabelText('系列名稱')).not.toHaveAttribute('aria-invalid', 'true');
  });

  it('標籤旁可以放附加元件', () => {
    render(
      <TextField
        label="整體視覺風格"
        value=""
        onChange={() => undefined}
        labelAccessory={<button type="button">AI 幫我寫</button>}
      />,
    );
    expect(screen.getByRole('button', { name: 'AI 幫我寫' })).toBeInTheDocument();
  });
});
