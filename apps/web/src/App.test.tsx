import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('首頁', () => {
  it('打開首頁時顯示產品名稱「廟埕影室」作為主標題', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { level: 1, name: '廟埕影室' })).toBeInTheDocument();
  });
});
