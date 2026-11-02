import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { VideoDetail } from '@templeyard/shared';
import { useCallback } from 'react';
import { fetchVideoDetail } from '../../api/client';

export function videoDetailKey(videoId: string) {
  return ['video', videoId] as const;
}

/** 影片、寺廟資料卡與照片；還沒有影片時不查詢 */
export function useVideoDetail(videoId: string | null) {
  return useQuery({
    queryKey: videoDetailKey(videoId ?? ''),
    queryFn: () => fetchVideoDetail(videoId ?? ''),
    enabled: Boolean(videoId),
  });
}

/** 依後端回應直接更新快取，不必重新查詢 */
export function useUpdateVideoDetail(videoId: string) {
  const queryClient = useQueryClient();
  return useCallback(
    (update: (detail: VideoDetail) => VideoDetail) => {
      queryClient.setQueryData<VideoDetail>(videoDetailKey(videoId), (old) => (old ? update(old) : old));
    },
    [queryClient, videoId],
  );
}
