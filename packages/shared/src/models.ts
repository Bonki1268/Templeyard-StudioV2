// 生成模型清單（介面顯示與系列預設用）。
// 呼叫 Comfy Cloud MCP 的模型代號、範本名稱放在 workflows/，不放這裡。

/**
 * 每個模型的主要特性與參考單價（規格書「生成模型」、設計稿「建立影片」）。
 * referencePrice 為 null 表示還沒實測（介面顯示「[待實測]」，不寫假數字）。
 */
export type ModelInfo = {
  key: string;
  label: string;
  features: string;
  referencePrice: number | null;
};

export const IMAGE_MODELS = [
  {
    key: 'nano-banana-pro',
    label: 'Nano Banana Pro',
    features: '構圖草圖使用同系列的輕量版 Nano Banana 2 Lite',
    referencePrice: null,
  },
] as const satisfies readonly ModelInfo[];

export const VIDEO_MODELS = [
  {
    key: 'gemini-omni-1.1-flash',
    label: 'Gemini Omni 1.1 Flash',
    features: '原生語音・可用對話修改單段・中間關鍵畫格為軟性控制・每段 3–10 秒',
    referencePrice: null,
    nativeAudio: true,
  },
  {
    key: 'seedance-2.0',
    label: 'Seedance 2.0',
    features: '原生語音與多語對口型・參考圖最多 9 張・中間關鍵畫格為軟性控制・每段 4–15 秒',
    referencePrice: null,
    nativeAudio: true,
  },
  {
    key: 'wan-2.2',
    label: 'Wan 2.2',
    features: '中間關鍵畫格可精準指定時間點・沒有原生語音，有台詞需另外對口型',
    referencePrice: null,
    nativeAudio: false,
  },
] as const satisfies readonly (ModelInfo & { nativeAudio: boolean })[];

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

/** 參考單價的顯示文字；還沒實測時以方括號占位（04 文案規則） */
export function referencePriceText(_price: number | null): string {
  throw new Error('尚未實作');
}
