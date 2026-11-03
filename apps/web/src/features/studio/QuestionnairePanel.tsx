import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ANSWER_SOURCE_LABELS,
  findQuestion,
  viewName,
  type AnswerSource,
  type Photo,
  type Question,
  type Questionnaire,
  type QuestionnaireAnswer,
} from '@templeyard/shared';
import { useId, useState } from 'react';
import { putQuestionnaire } from '../../api/client';
import { Button } from '../../components/Button';
import { OptionGroup } from '../../components/OptionGroup';
import { Tag, type TagTone } from '../../components/Tag';
import { TextField } from '../../components/TextField';
import { useAiAssist } from '../assist/useAiAssist';
import { chooseOption, draftFrom, draftSource, toAnswerInput, togglePhoto, typeCustom, type DraftAnswer } from './questionnaireForm';
import styles from './StudioPanels.module.css';
import { chatKey, questionnaireKey } from './useStudioChat';

const SOURCE_TONES: Record<AnswerSource, TagTone> = { user: 'info', series_default: 'neutral', system: 'warning' };

function SourceTag({ source }: { source: AnswerSource }) {
  return <Tag tone={SOURCE_TONES[source]}>{ANSWER_SOURCE_LABELS[source]}</Tag>;
}

type QuestionProps = {
  videoId: string;
  question: Question;
  original: QuestionnaireAnswer;
  draft: DraftAnswer;
  photos: Photo[];
  onChange: (draft: DraftAnswer) => void;
};

/** 文字題（想講的故事、一定要說到的事）：輸入框＋AI 幫我寫 */
function TextQuestion({ videoId, question, original, draft, onChange }: QuestionProps) {
  const assist = useAiAssist({
    field: question.id === 'story' ? 'questionnaire.story' : 'questionnaire.mustSay',
    fieldLabel: question.title,
    videoId,
    target: { questionId: question.id },
    userInput: () => draft.custom,
    onAdopt: (text) => onChange(typeCustom(draft, text)),
  });
  return (
    <>
      <TextField
        label={question.title}
        value={draft.custom}
        onChange={(text) => onChange(typeCustom(draft, text))}
        multiline
        maxLength={500}
        labelAccessory={
          <span className={styles.accessory}>
            <SourceTag source={draftSource(original, draft)} />
            {assist.button}
          </span>
        }
      />
      {assist.panel}
    </>
  );
}

/** 選項題：點選項或自己寫，二擇一；再按一次選取的選項取消 */
function ChoiceQuestion({ videoId, question, original, draft, onChange }: QuestionProps) {
  const assist = useAiAssist({
    field: 'questionnaire.custom',
    fieldLabel: `${question.title}（或自己寫）`,
    videoId,
    target: { questionId: question.id },
    userInput: () => draft.custom,
    onAdopt: (text) => onChange(typeCustom(draft, text)),
  });
  return (
    <>
      <OptionGroup
        legend={question.title}
        legendAccessory={<SourceTag source={draftSource(original, draft)} />}
        options={question.options.map((option) => ({ value: option, label: option }))}
        value={draft.choice}
        onChange={(option) => onChange(chooseOption(draft, option))}
        other={{ value: draft.custom, onChange: (text) => onChange(typeCustom(draft, text)), accessory: assist.button }}
      />
      {assist.panel}
    </>
  );
}

/** 一定要出現的照片：勾選這支影片上傳的照片 */
function PhotoQuestion({ question, original, draft, photos, onChange }: QuestionProps) {
  return (
    <fieldset className={styles.photoGroup}>
      <legend className={styles.legend}>{question.title}</legend>
      <div className={styles.accessory}>
        <SourceTag source={draftSource(original, draft)} />
      </div>
      {photos.length === 0 && <p className={styles.muted}>這支影片還沒有照片。</p>}
      {photos.map((photo, index) => (
        <label key={photo.id} className={styles.checkbox}>
          <input type="checkbox" checked={draft.photoIds.includes(photo.id)} onChange={() => onChange(togglePhoto(draft, photo.id))} />
          照片 {index + 1}（{photo.viewKey ? viewName(photo.viewKey) : '沒有指定視角'}）
        </label>
      ))}
    </fieldset>
  );
}

type QuestionnairePanelProps = { videoId: string; questionnaire: Questionnaire; photos: Photo[] };

/** 設定問卷：每題點選項或自己寫，留白由系統決定；按「建立分鏡方案」送出 */
export function QuestionnairePanel({ videoId, questionnaire, photos }: QuestionnairePanelProps) {
  const titleId = useId();
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, DraftAnswer>>(() =>
    Object.fromEntries(questionnaire.answers.map((answer) => [answer.questionId, draftFrom(answer)])),
  );
  const submit = useMutation({
    mutationFn: () =>
      putQuestionnaire(
        videoId,
        questionnaire.answers.map((answer) => toAnswerInput(answer.questionId, drafts[answer.questionId] ?? draftFrom(answer))),
      ),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: chatKey(videoId) }),
        queryClient.invalidateQueries({ queryKey: questionnaireKey(videoId) }),
      ]);
    },
  });

  return (
    <section className={styles.panel} aria-labelledby={titleId}>
      <h2 id={titleId} className={styles.panelTitle}>
        設定問卷
      </h2>
      <p className={styles.muted}>每題點選項或自己寫；不確定的題目留白，由系統決定。</p>
      {questionnaire.answers.map((answer) => {
        const question = findQuestion(answer.questionId);
        if (!question) return null;
        const props: QuestionProps = {
          videoId,
          question,
          original: answer,
          draft: drafts[answer.questionId] ?? draftFrom(answer),
          photos,
          onChange: (draft) => setDrafts((old) => ({ ...old, [answer.questionId]: draft })),
        };
        return (
          <section key={question.id} className={styles.question} aria-label={`問卷題目：${question.title}`}>
            {question.kind === 'choice' && <ChoiceQuestion {...props} />}
            {question.kind === 'text' && <TextQuestion {...props} />}
            {question.kind === 'photos' && <PhotoQuestion {...props} />}
          </section>
        );
      })}
      {submit.isError && (
        <p className={styles.error} role="alert">
          送出問卷失敗：{submit.error.message}
        </p>
      )}
      {(submit.isSuccess || (questionnaire.submittedAt && !submit.isPending)) && (
        <p className={styles.notice} role="status">
          已送出問卷。分鏡方案將在之後的版本開放。
        </p>
      )}
      <div className={styles.actions}>
        <Button variant="primary" disabled={submit.isPending} onClick={() => submit.mutate()}>
          建立分鏡方案
        </Button>
      </div>
    </section>
  );
}
