import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { Route, Routes } from 'react-router';
import { CreateVideoPage } from './pages/CreateVideoPage';
import { SeriesHomePage } from './pages/SeriesHomePage';
import { CharacterDetailPage } from './pages/series/CharacterDetailPage';
import { SeriesCharactersTab } from './pages/series/SeriesCharactersTab';
import { SeriesSettingsTab } from './pages/series/SeriesSettingsTab';
import { SeriesShell, SeriesTabsLayout } from './pages/series/SeriesShell';
import { SeriesVideosTab } from './pages/series/SeriesVideosTab';
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
        <Route path="/series/:sid" element={<SeriesShell />}>
          <Route element={<SeriesTabsLayout />}>
            <Route path="settings" element={<SeriesSettingsTab />} />
            <Route path="characters" element={<SeriesCharactersTab />} />
            <Route path="videos" element={<SeriesVideosTab />} />
          </Route>
          <Route path="characters/:cid" element={<CharacterDetailPage />} />
        </Route>
        <Route path="/series/:sid/videos/new" element={<CreateVideoPage />} />
        <Route path="/videos/:vid/temple-board" element={<TempleBoardPage />} />
        <Route path="/videos/:vid/studio" element={<StudioPage />} />
        <Route path="/videos/:vid/shots/:shotKey" element={<ShotDetailPage />} />
      </Routes>
    </QueryClientProvider>
  );
}
