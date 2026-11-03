// 創作 Agent 的系統指令：角色、這支影片的資料、問卷題庫、不能做的事。

export const AGENT_ROLE = '你是廟埕影室的創作 Agent';

export type AgentContext = {
  temple: { name: string; district: string; deity: string; builtYear: number | null };
  /** 使用者貼上的寺廟歷史與簡介（可能是空的） */
  userTempleNotes: string;
  series: { name: string; visualStyle: string; durationSec: number; direction: string };
  models: { image: string; video: string };
  /** 問卷是否已送出（送出後不能重新產生） */
  questionnaireSubmitted: boolean;
};

/**
 * 系統指令包含：
 * - 角色（AGENT_ROLE）與回覆方式：先用一兩句說明接下來要做什麼，再呼叫 generate_questionnaire 開啟問卷
 * - 寺廟資料（標示來源：寺廟資料庫）與使用者提供的歷史（標示來源：使用者提供）；空的就寫「沒有」
 * - 系列設定與這支影片的模型
 * - 問卷題庫：每題的代號、題目、選項；每支影片不同的題目
 * - 規則：寺廟事實只引用上面的資料；不能更改模型；不能自行觸發付費生成；用繁體中文（台灣用語）
 * - 問卷已送出時：說明不能重新產生問卷
 */
export function buildAgentSystem(_context: AgentContext): string {
  throw new Error('尚未實作');
}
