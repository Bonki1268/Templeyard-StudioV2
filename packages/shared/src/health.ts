import { z } from 'zod';

// GET /api/health 的回應：確認本機後端有在跑。
export const healthResponseSchema = z.object({
  status: z.literal('ok'),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
