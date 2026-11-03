// 創作工作區（對話、問卷、AI 輔助撰寫）的錯誤：路由依 status 回應，訊息直接給使用者看

export class StudioError extends Error {
  override name = 'StudioError';
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export const VIDEO_NOT_FOUND = '找不到這支影片';
export const BOARD_NOT_CONFIRMED = '寺廟定裝版還沒確認，還不能開始創作';
export const QUESTIONNAIRE_NOT_OPENED = 'Agent 還沒開啟問卷';
export const QUESTIONNAIRE_ALREADY_SUBMITTED = '問卷已送出，不能重新產生';
