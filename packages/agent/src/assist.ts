import { assistOutputSchema, characterDesignOutputSchema, copyPolishOutputSchema, type AssistField } from '@templeyard/shared';

// AI 輔助撰寫（規格書「AI 輔助撰寫」）：先建議、後採用；內容只用提供的資料，不新增沒有來源的寺廟事實。

export type AssistOutputKind = 'generic' | 'copy-polish' | 'character-description' | 'character-locks';

export const ASSIST_ROLE = '你是廟埕影室的 AI 輔助撰寫';

export type AssistContext = {
  field: AssistField;
  userInput: string;
  temple: { name: string; district: string; deity: string; builtYear: number | null } | null;
  userTempleNotes: string;
  series: { visualStyle: string; direction: string } | null;
  creativeInput: string | null;
  /** 定裝版視角圖的名稱（templeView.instruction） */
  viewName: string | null;
  /** 問卷題目（questionnaire.custom） */
  questionTitle: string | null;
  /** 角色名稱（character.*） */
  characterName?: string | null;
  /** 系列名稱（character-design 節點） */
  seriesName?: string | null;
};

const FORMAT_ERROR = 'AI 建議的格式不正確，請再試一次';

const ASSIST_SYSTEM = [
  `${ASSIST_ROLE}：使用者在廟埕影室（新北市寺廟觀光短影音）填寫欄位時按下「AI 幫我寫」，請依提供的資料寫出完整的內容，供使用者採用。`,
  '寫法：',
  '1. 保留使用者輸入的原意；使用者沒有輸入時，依資料寫一版。',
  '2. 只寫這個欄位需要的內容，簡潔、具體、能拍成畫面；用繁體中文（台灣用語）。',
  '內容與宗教規則：只使用下方提供的寺廟資料與使用者輸入，不可新增沒有來源的寺廟事實（歷史年代、人物或傳說）；不得對神明不敬，不得出現不敬的動作、台詞或畫面；畫面中不可出現可辨識的真實民眾。',
  '輸出格式：只回一個 JSON 物件 {"suggestion": "建議的內容"}，不要其他文字。',
].join('\n');

/**
 * 通用的輔助撰寫請求：
 * - system：角色（ASSIST_ROLE）、內容與宗教規則、輸出格式 {"suggestion": "..."}
 * - user：要寫的欄位、使用者的輸入（留白時說明「使用者沒有輸入，請依資料寫一版」）、寺廟、使用者提供的歷史、
 *   系列設定、創作輸入、視角或題目；沒有的資料不列出
 */
export function buildAssistRequest(context: AssistContext): { system: string; user: string } {
  const lines = [`要寫的欄位：${context.field.label}`];
  if (context.viewName) lines.push(`視角：${context.viewName}`);
  if (context.questionTitle) lines.push(`問卷題目：${context.questionTitle}`);
  const { temple, series } = context;
  if (temple) {
    lines.push(
      `寺廟：${temple.name}（${temple.district}，主祀${temple.deity}${temple.builtYear === null ? '' : `，創建於 ${temple.builtYear} 年`}；來源：寺廟資料庫）`,
    );
  }
  if (context.userTempleNotes.trim()) lines.push(`使用者提供的寺廟歷史與簡介：${context.userTempleNotes.trim()}`);
  if (series) lines.push(`系列設定：整體視覺風格「${series.visualStyle}」、影片方向「${series.direction}」`);
  if (context.creativeInput?.trim()) lines.push(`創作輸入：${context.creativeInput.trim()}`);
  const input = context.userInput.trim();
  lines.push('', input ? `使用者的輸入：\n${input}` : '使用者沒有輸入，請依資料寫一版。');
  return { system: ASSIST_SYSTEM, user: lines.join('\n') };
}

/** copy-polish 節點（想講的故事）的變數：prompt-studio/prompts/copy-polish.json 的變數清單 */
export function copyPolishVariables(context: AssistContext): Record<string, unknown> {
  const temple = context.temple;
  return {
    temple: {
      name: temple?.name ?? '',
      district: temple?.district ?? '',
      deity: temple?.deity ?? '',
      builtYear: temple?.builtYear === null || temple?.builtYear === undefined ? '' : String(temple.builtYear),
      history: context.userTempleNotes.trim(),
    },
    series: { style: context.series?.visualStyle ?? '', direction: context.series?.direction ?? '' },
    maxChars: '200',
    instruction: '',
    story: context.userInput,
  };
}

/** character-design 節點（角色的外觀描述與連續性鎖）的變數：使用者的輸入當作角色構想 */
export function characterDesignVariables(context: AssistContext): Record<string, unknown> {
  return {
    character: { name: context.characterName ?? '' },
    idea: context.userInput,
    series: { name: context.seriesName ?? '', style: context.series?.visualStyle ?? '', direction: context.series?.direction ?? '' },
    instruction: '',
  };
}

export class AssistOutputError extends Error {
  override name = 'AssistOutputError';
}

/**
 * 解析 Claude 回的建議：允許前後空白、```json 程式碼區塊與前後的說明文字；
 * generic 取 suggestion，copy-polish 取 polished；character-description 取 description，
 * character-locks 取 continuityLocks（一行一條）；格式不正確丟出 AssistOutputError「AI 建議的格式不正確，請再試一次」
 */
/** 找出文字裡的 JSON：整段、```json 程式碼區塊，或前後有說明文字時第一個 { 到最後一個 }（2026-11-05 實際使用） */
function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)\s*```/.exec(trimmed)?.[1];
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  const braces = start >= 0 && end > start ? trimmed.slice(start, end + 1) : undefined;
  for (const candidate of [trimmed, fenced, braces]) {
    if (candidate === undefined) continue;
    try {
      return JSON.parse(candidate);
    } catch {
      // 試下一種
    }
  }
  throw new AssistOutputError(FORMAT_ERROR);
}

export function parseAssistOutput(text: string, kind: AssistOutputKind): string {
  const parsed = extractJson(text);
  if (kind === 'character-description' || kind === 'character-locks') {
    const result = characterDesignOutputSchema.safeParse(parsed);
    if (!result.success) throw new AssistOutputError(FORMAT_ERROR);
    if (kind === 'character-description') return result.data.description;
    const locks = result.data.continuityLocks.map((lock) => lock.trim()).filter(Boolean);
    if (locks.length === 0) throw new AssistOutputError(FORMAT_ERROR);
    return locks.join('\n');
  }
  if (kind === 'copy-polish') {
    const result = copyPolishOutputSchema.safeParse(parsed);
    if (!result.success) throw new AssistOutputError(FORMAT_ERROR);
    return result.data.polished;
  }
  const result = assistOutputSchema.safeParse(parsed);
  if (!result.success) throw new AssistOutputError(FORMAT_ERROR);
  return result.data.suggestion;
}
