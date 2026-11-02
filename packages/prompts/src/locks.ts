// 連續性鎖：一條固定短語，要逐字出現在最終指令裡（02「生成指令組裝」）

/** 變數名稱以 locks 結尾（不分大小寫）的是連續性鎖，例如 temple.appearanceLocks、character.locks */
export function isLockVariable(name: string): boolean {
  const last = name.split('.').at(-1) ?? '';
  return /locks$/i.test(last) && (last.length === 5 || /[a-z]Locks$/.test(last));
}

/** 把鎖的值拆成一條一條：字串以分號或換行分隔，陣列逐項；去掉空白與空項 */
export function splitLocks(value: unknown): string[] {
  const parts = Array.isArray(value) ? value.map(String) : typeof value === 'string' ? value.split(/[;；\n]/) : [];
  return parts.map((part) => part.trim()).filter(Boolean);
}

/** 句子的界線：句號、問號、驚嘆號、分號、換行 */
const SENTENCE = /[.!?。！？;；\n]+/;
/** 否定詞：英文要是完整的字；中文直接比對 */
const NEGATION = /\b(?:no|not|without|never|avoid)\b|不要|沒有|避免|不/i;

/** 這一次出現有沒有被同一句前面的否定詞否定 */
function negated(sentence: string, index: number): boolean {
  return NEGATION.test(sentence.slice(0, index));
}

/**
 * 找出沒有逐字出現在指令裡的鎖：不分大小寫；
 * 只出現在「no」「not」「without」「不要」「不」「沒有」「避免」之後（同一句裡）的不算出現。
 */
export function findMissingLocks(prompt: string, locks: readonly string[]): string[] {
  const sentences = prompt.toLowerCase().split(SENTENCE);
  return locks.filter((lock) => {
    const needle = lock.toLowerCase();
    return !sentences.some((sentence) => {
      for (let index = sentence.indexOf(needle); index >= 0; index = sentence.indexOf(needle, index + 1)) {
        if (!negated(sentence, index)) return true;
      }
      return false;
    });
  });
}
