import { QUESTIONNAIRE_QUESTIONS } from '@templeyard/shared';

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
  /** 目前的分鏡方案（建立後才有）：每格一行摘要 */
  plan?: { version: number; shots: readonly { seq: number; durationSec: number; shotSize: string; viewKey: string; description: string; dialogue: string }[] } | null;
};

function orNone(value: string | number | null): string {
  return value === null || String(value).trim() === '' ? '沒有' : String(value);
}

/**
 * 系統指令包含：
 * - 角色（AGENT_ROLE）與回覆方式：先用一兩句說明接下來要做什麼，再呼叫 generate_questionnaire 開啟問卷
 * - 寺廟資料（標示來源：寺廟資料庫）與使用者提供的歷史（標示來源：使用者提供）；空的就寫「沒有」
 * - 系列設定與這支影片的模型
 * - 問卷題庫：每題的代號、題目、選項；每支影片不同的題目
 * - 規則：寺廟事實只引用上面的資料；不能更改模型；不能自行觸發付費生成；用繁體中文（台灣用語）
 * - 問卷已送出時：說明不能重新產生問卷
 * - 有分鏡方案時：列出目前的方案（第幾版、每格的秒數、景別、視角、畫面內容、台詞），
 *   說明要修改時呼叫 revise_plan 依序號修改，修改後列出改了哪幾格
 */
export function buildAgentSystem(context: AgentContext): string {
  const { temple, series, models } = context;
  const questions = QUESTIONNAIRE_QUESTIONS.map((q) => {
    const options = q.options.length > 0 ? `選項：${q.options.join('、')}（也可以自己寫）` : q.kind === 'photos' ? '勾選已上傳的照片' : '自行填寫';
    return `- ${q.id}：${q.title}；${options}${q.perVideo ? '；每支影片不同，不使用系列問卷預設值' : ''}`;
  });
  const lines = [
    `${AGENT_ROLE}，協助使用者為新北市的寺廟製作 30 秒以內的觀光短影音。`,
    '',
    '## 回覆方式',
    '- 使用者說出想做什麼之後，先用一兩句說明接下來要做什麼，再呼叫 generate_questionnaire 開啟問卷。',
    '- generate_questionnaire 從下方題庫挑出要問的題目（questionIds），並依使用者這次說的話預填答案（prefill）；只預填使用者明確說到的內容，其他留白由系統決定。',
    '- 回覆簡短、口語，用繁體中文（台灣用語）。',
    '',
    '## 這支影片的寺廟（來源：寺廟資料庫）',
    `- 廟名：${temple.name}`,
    `- 行政區：${temple.district}`,
    `- 主祀神明：${temple.deity}`,
    `- 創建年：${orNone(temple.builtYear)}`,
    `使用者提供的寺廟歷史與簡介：${orNone(context.userTempleNotes)}${context.userTempleNotes.trim() ? '（來源：使用者提供）' : ''}`,
    '',
    '## 系列設定',
    `- 系列名稱：${series.name}`,
    `- 整體視覺風格：${series.visualStyle}`,
    `- 影片秒數：${series.durationSec} 秒`,
    `- 影片方向：${series.direction}`,
    `- 這支影片的模型：圖片 ${models.image}、影片 ${models.video}`,
    '',
    '## 問卷題庫（代號：題目）',
    ...questions,
    '',
    '## 規則',
    '- 寺廟事實只能引用上面的資料，不可自行補寫歷史年代、人物或傳說；引用時說明來源。',
    '- 不得對神明不敬；畫面中不可出現可辨識的真實民眾。',
    '- 不能更改這支影片的圖片與影片模型。',
    '- 不能自行觸發付費生成：任何會花錢的生成，都要使用者在畫面上看過費用並同意。',
  ];
  if (context.questionnaireSubmitted) lines.push('- 問卷已送出，不能重新產生問卷；使用者想改答案時，請他在問卷面板修改後再送出。');
  return lines.join('\n');
}
