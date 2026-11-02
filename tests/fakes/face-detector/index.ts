import type { Page } from '@playwright/test';

// 假的人臉偵測：情境測試不載入 MediaPipe 模型，改由這裡回傳固定的臉孔位置。
// 前端在開發模式下，如果 window.__templeyardFaceDetector 有值就用它（見 apps/web/src/features/deid/faceDetector.ts）。

/** 位置以照片寬高的比例表示（0～1），和真的偵測器輸出的格式相同 */
export type FakeFace = { x: number; y: number; width: number; height: number };

/** 「臉孔 1」「臉孔 2」的位置；兩個框不重疊，也不碰到手動框的預設位置 */
export const FAKE_FACES: readonly FakeFace[] = [
  { x: 0.1, y: 0.1, width: 0.2, height: 0.3 },
  { x: 0.6, y: 0.5, width: 0.25, height: 0.3 },
];

export type FakeDetectorMode = { faces: number } | 'unavailable';

/** 在頁面載入前安裝假的偵測器 */
export async function installFakeFaceDetector(page: Page, mode: FakeDetectorMode): Promise<void> {
  const payload = mode === 'unavailable' ? { unavailable: true, faces: [] } : { unavailable: false, faces: FAKE_FACES.slice(0, mode.faces) };
  await page.addInitScript((config: { unavailable: boolean; faces: FakeFace[] }) => {
    const target = window as unknown as { __templeyardFaceDetector?: unknown };
    target.__templeyardFaceDetector = {
      detect: async () => {
        if (config.unavailable) throw new Error('假的偵測器：模型載入失敗');
        return config.faces.map((face) => ({ ...face }));
      },
    };
  }, payload);
}
