import { z } from 'zod';

// 寺廟定裝版的標準視角清單。
// 01 PRD 把「標準視角清單」列為待決定；這裡先用 05 的 view_key 範例與設計稿「建立影片」的 5 個視角，
// 之後決定了只改這份清單。
export const STANDARD_VIEWS = [
  { key: 'front_overview', name: '廟前全景' },
  { key: 'sanchuan_hall', name: '三川殿（山門）' },
  { key: 'main_hall', name: '正殿內部' },
  { key: 'courtyard', name: '廟埕' },
  { key: 'detail_roof', name: '細部特寫' },
] as const;

export type StandardViewKey = (typeof STANDARD_VIEWS)[number]['key'];

export const STANDARD_VIEW_KEYS = STANDARD_VIEWS.map((v) => v.key) as [StandardViewKey, ...StandardViewKey[]];

export const viewKeySchema = z.enum(STANDARD_VIEW_KEYS, { error: '請從清單選擇視角' });

export type ViewCoverageStatus = 'has_photo' | 'missing';

/** 視角對照的一列：這個視角有沒有照片、是哪幾張 */
export type ViewCoverage = {
  key: StandardViewKey;
  name: string;
  status: ViewCoverageStatus;
  photoIds: string[];
};

/** 依照片手動指定的視角，列出每個標準視角「已有照片」或「缺少照片」；順序同標準清單 */
export function viewCoverage(photos: readonly { id: string; viewKey: string | null }[]): ViewCoverage[] {
  return STANDARD_VIEWS.map((view) => {
    const photoIds = photos.filter((photo) => photo.viewKey === view.key).map((photo) => photo.id);
    return { key: view.key, name: view.name, status: photoIds.length > 0 ? 'has_photo' : 'missing', photoIds };
  });
}

/** 視角名稱；不在清單裡時回傳原本的 key */
export function viewName(key: string): string {
  return STANDARD_VIEWS.find((view) => view.key === key)?.name ?? key;
}
