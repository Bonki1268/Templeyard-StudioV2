// 生成模型清單（介面顯示與系列預設用）。
// 呼叫 Comfy Cloud MCP 的模型代號、範本名稱放在 workflows/，不放這裡。

export const IMAGE_MODELS = [{ key: 'nano-banana-pro', label: 'Nano Banana Pro' }] as const;

export const VIDEO_MODELS = [
  { key: 'gemini-omni-1.1-flash', label: 'Gemini Omni 1.1 Flash' },
  { key: 'seedance-2.0', label: 'Seedance 2.0' },
  { key: 'wan-2.2', label: 'Wan 2.2' },
] as const;

export type ImageModelKey = (typeof IMAGE_MODELS)[number]['key'];
export type VideoModelKey = (typeof VIDEO_MODELS)[number]['key'];

export const IMAGE_MODEL_KEYS = IMAGE_MODELS.map((m) => m.key) as [ImageModelKey, ...ImageModelKey[]];
export const VIDEO_MODEL_KEYS = VIDEO_MODELS.map((m) => m.key) as [VideoModelKey, ...VideoModelKey[]];

// 規格書：預設圖片模型 Nano Banana Pro、預設影片模型 Gemini Omni 1.1 Flash（中國的模型不作為預設）
export const DEFAULT_IMAGE_MODEL: ImageModelKey = 'nano-banana-pro';
export const DEFAULT_VIDEO_MODEL: VideoModelKey = 'gemini-omni-1.1-flash';

export function imageModelLabel(key: string): string {
  return IMAGE_MODELS.find((m) => m.key === key)?.label ?? key;
}

export function videoModelLabel(key: string): string {
  return VIDEO_MODELS.find((m) => m.key === key)?.label ?? key;
}
