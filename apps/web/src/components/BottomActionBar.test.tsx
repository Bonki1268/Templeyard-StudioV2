import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BottomActionBar } from './BottomActionBar';

describe('底部操作列', () => {
  it('左側顯示說明、右側放主要按鈕，按鈕可以用 aria-describedby 指向說明', () => {
    render(
      <BottomActionBar note="還有 1 項待處理：系列名稱" noteId="create-note">
        <button type="button" disabled aria-describedby="create-note">
          建立系列
        </button>
      </BottomActionBar>,
    );

    expect(screen.getByRole('button', { name: '建立系列' })).toHaveAccessibleDescription('還有 1 項待處理：系列名稱');
  });

  it('沒有說明時只顯示按鈕', () => {
    render(
      <BottomActionBar>
        <button type="button">建立系列</button>
      </BottomActionBar>,
    );
    expect(screen.getByRole('button', { name: '建立系列' })).toBeInTheDocument();
  });
});
