// 連續性鎖：一條固定短語，要逐字出現在最終指令裡（02「生成指令組裝」）

/** 變數名稱以 locks 結尾（不分大小寫）的是連續性鎖，例如 temple.appearanceLocks、character.locks */
export function isLockVariable(_name: string): boolean {
  throw new Error('尚未實作');
}

/** 把鎖的值拆成一條一條：字串以分號或換行分隔，陣列逐項；去掉空白與空項 */
export function splitLocks(_value: unknown): string[] {
  throw new Error('尚未實作');
}

/**
 * 找出沒有逐字出現在指令裡的鎖：不分大小寫；
 * 只出現在「no」「not」「without」「不要」「不」「沒有」「避免」之後（同一句裡）的不算出現。
 */
export function findMissingLocks(_prompt: string, _locks: readonly string[]): string[] {
  throw new Error('尚未實作');
}
