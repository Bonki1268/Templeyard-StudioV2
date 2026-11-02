import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';

describe('首頁', () => {
  beforeEach(() => {
    // 首頁會讀取系列列表；這裡只看標題，回應空列表
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ series: [] }), { headers: { 'Content-Type': 'application/json' } })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('打開首頁時顯示產品名稱「廟埕影室」作為主標題', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { level: 1, name: '廟埕影室' })).toBeInTheDocument();
  });
});
