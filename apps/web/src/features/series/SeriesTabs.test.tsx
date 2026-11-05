import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { SeriesTabs } from './SeriesTabs';

function renderAt(path: string, props: { characterCount: number | null; videoCount: number | null } = { characterCount: 3, videoCount: 5 }) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SeriesTabs seriesId="s1" {...props} />
    </MemoryRouter>,
  );
}

describe('系列頁分頁', () => {
  it('三個分頁依序是系列設定、角色庫、過去的影片，連到各自的網址', () => {
    renderAt('/series/s1/settings');
    const links = screen.getAllByRole('link');
    expect(links.map((link) => link.getAttribute('href'))).toEqual(['/series/s1/settings', '/series/s1/characters', '/series/s1/videos']);
    expect(screen.getByRole('navigation', { name: '系列頁面' })).toBeInTheDocument();
  });

  it.each([
    ['/series/s1/settings', '系列設定'],
    ['/series/s1/characters', '角色庫'],
    ['/series/s1/characters/c1', '角色庫'],
    ['/series/s1/videos', '過去的影片'],
  ])('在 %s 時，只有「%s」標示為目前頁面', (path, current) => {
    renderAt(path);
    const marked = screen.getAllByRole('link').filter((link) => link.getAttribute('aria-current') === 'page');
    expect(marked).toHaveLength(1);
    expect(marked[0]?.textContent).toContain(current);
  });

  it('角色庫與過去的影片旁邊顯示數量', () => {
    renderAt('/series/s1/settings');
    expect(screen.getByRole('link', { name: '角色庫 3' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '過去的影片 5' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '系列設定' })).toBeInTheDocument();
  });

  it('數量還沒讀到時不顯示數量', () => {
    renderAt('/series/s1/settings', { characterCount: null, videoCount: null });
    expect(screen.getByRole('link', { name: '角色庫' })).toBeInTheDocument();
  });
});
