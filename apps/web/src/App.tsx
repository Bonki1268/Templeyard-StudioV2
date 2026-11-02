import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { Route, Routes } from 'react-router';
import { SeriesHomePage } from './pages/SeriesHomePage';

// 路由依 docs/03-App-Flow.md「路由表」
export function App() {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <Routes>
        <Route path="/" element={<SeriesHomePage />} />
      </Routes>
    </QueryClientProvider>
  );
}
