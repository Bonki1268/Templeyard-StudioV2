import { QUESTIONNAIRE_QUESTIONS } from '@templeyard/shared';

// 創作 Agent 的系統指令：角色、這支影片的資料、問卷題庫、不能做的事。

export const AGENT_ROLE = '你是廟埕影室的創作 Agent';

export type AgentContext = {
  temple: { name: string; district: string; deity: string; builtYear: number | null };
  /** 使用者貼上的寺廟歷史與簡介（可能是空的） */
  userTempleNotes: string;
  series: { name: string; visualStyle: string; direction: string };
  models: { image: string; video: string };
  /** 問卷是否已送出（送出後不能重新產生） */
  questionnaireSubmitted: boolean;
  /** 已經有成品（第 12 階段）：使用者可以用對話修改成品 */
  hasFinal?: boolean;
  /** 細修頁的對話只針對這一格（第 10 階段） */
  focusShot?: { seq: number } | null;
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
 * - 細修頁（focusShot）：說明「這次只針對分鏡第 N 格」，只能用 revise_shot 修改這一格，不改其他格
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
  if (context.plan) {
    lines.push(
      '',
      `## 目前的分鏡方案（第 ${context.plan.version} 版）`,
      ...context.plan.shots.map(
        (shot) =>
          `- 第 ${shot.seq} 格（${shot.durationSec} 秒，${shot.shotSize}，視角 ${shot.viewKey}）：${shot.description}${shot.dialogue ? `；台詞「${shot.dialogue}」` : ''}`,
      ),
      '使用者要修改方案時，呼叫 revise_plan，依序號（seq）只改要改的欄位；修改後簡短說明改了哪幾格。每次修改都會產生新的方案版本，使用者可以回到前一版。',
    );
  }
  if (context.hasFinal && !context.focusShot) {
    lines.push(
      '',
      '## 成品',
      '這支影片已經合成成品。使用者對成品提出修改時，呼叫 schedule_regeneration，列出要重生的格子序號與調整指令；',
      '工具不會直接重生，使用者在右邊看到費用並確認後才會重生並重新合成。安排好後簡短說明要重生哪幾格。',
    );
  }
  if (context.focusShot) {
    lines.push(
      '',
      `## 這次只針對分鏡第 ${context.focusShot.seq} 格`,
      `使用者在這一格的細修頁說話：只能用 revise_shot 修改第 ${context.focusShot.seq} 格，只寫要改的欄位，不改其他格；修改後簡短說明改了什麼。`,
    );
  }
  return lines.join('\n');
}
