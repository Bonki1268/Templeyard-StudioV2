// 時間軸條：依秒數比例分格，顯示每格時間區間與「總長度／目標長度」；拖曳（或用方向鍵移動）格與格的邊界調整秒數

export type TimelineProps = {
  shots: readonly { shotKey: string; seq: number; startSec: number; durationSec: number }[];
  totalSec: number;
  targetSec: number;
  /** 邊界移動後每一格的秒數 */
  onChange: (durations: number[]) => void;
  disabled?: boolean;
};

/** 尚未實作 */
export function Timeline(_props: TimelineProps) {
  return null;
}
