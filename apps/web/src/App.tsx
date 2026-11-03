import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { Route, Routes } from 'react-router';
import { CreateVideoPage } from './pages/CreateVideoPage';
import { SeriesHomePage } from './pages/SeriesHomePage';
import { ShotDetailPage } from './pages/ShotDetailPage';
import { StudioPage } from './pages/StudioPage';
import { TempleBoardPage } from './pages/TempleBoardPage';

// 路由依 docs/03-App-Flow.md「路由表」
export function App() {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <Routes>
        <Route path="/" element={<SeriesHomePage />} />
        <Route path="/series/:sid/videos/new" element={<CreateVideoPage />} />
        <Route path="/videos/:vid/temple-board" element={<TempleBoardPage />} />
        <Route path="/videos/:vid/studio" element={<StudioPage />} />
        <Route path="/videos/:vid/shots/:shotKey" element={<ShotDetailPage />} />
      </Routes>
    </QueryClientProvider>
  );
}
