import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DEFAULT_IMAGE_MODEL,
  DEFAULT_VIDEO_MODEL,
  IMAGE_MODELS,
  QUESTIONNAIRE_QUESTIONS,
  SERIES_DIRECTIONS,
  VIDEO_MODELS,
  applyDefaultsPatch,
  needsLipSyncNote,
  type ImageModelKey,
  type QuestionnaireDefaults,
  type QuestionnaireDefaultsView,
  type Series,
  type Settings,
  type VideoModelKey,
} from '@templeyard/shared';
import { Info, TriangleAlert } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { Link } from 'react-router';
import {
  ApiRequestError,
  fetchQuestionnaireDefaults,
  fetchSettings,
  patchQuestionnaireDefaults,
  patchSeries,
  patchSettings,
} from '../../api/client';
import { Button } from '../../components/Button';
import { OptionGroup } from '../../components/OptionGroup';
import { Tag } from '../../components/Tag';
import { TextField } from '../../components/TextField';
import { useAiAssist } from '../../features/assist/useAiAssist';
import { useLeaveGuard } from '../../features/series/LeaveGuard';
import { seriesFormFrom, toUpdateSeriesInput } from '../../features/series/seriesForm';
import {
  barMessage,
  blockingItems,
  changedItems,
  parseCreditsField,
  type SettingsFormState,
} from '../../features/series/settingsForm';
import { SERIES_LIST_KEY } from '../../features/series/useSeriesList';
import { ModelPicker } from '../../features/videos/ModelSection';
import { useSeriesPage } from './SeriesShell';
import styles from './SeriesSettingsTab.module.css';

// 系列設定分頁（docs/03-App-Flow.md「系列設定分頁」、設計稿 Main）：基本資料、視覺風格、預設生成模型、問卷預設值、費用；
// 底部操作列列出未儲存的變更，離開前先提醒

const DEFAULTS_KEY = (seriesId: string) => ['questionnaire-defaults', seriesId] as const;
const SETTINGS_KEY = ['settings'] as const;

function creditsToText(value: number | null): string {
  return value === null ? '' : String(value);
}

function savedStateOf(series: Series, settings: Settings): SettingsFormState {
  return {
    series: seriesFormFrom(series),
    defaultsPatch: {},
    cost: { videoLimit: creditsToText(settings.defaultVideoCostLimitCredits), threshold: creditsToText(settings.consentThresholdCredits) },
  };
}

function defaultsOf(view: QuestionnaireDefaultsView): QuestionnaireDefaults {
  const result: QuestionnaireDefaults = {};
  for (const row of view.rows) {
    const question = QUESTIONNAIRE_QUESTIONS.find((q) => q.id === row.questionId);
    result[row.questionId] = (question?.options as readonly string[] | undefined)?.includes(row.value) ? { choice: row.value } : { custom: row.value };
  }
  return result;
}

/** 問卷預設值的一題：目前的答案（含還沒儲存的修改）、來源標籤、修改與清除 */
function DefaultsList({
  view,
  patch,
  onPatch,
}: {
  view: QuestionnaireDefaultsView;
  patch: SettingsFormState['defaultsPatch'];
  onPatch: (questionId: string, answer: { choice?: string; custom?: string } | null) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const otherId = useId();
  const rows = view.rows.filter((row) => patch[row.questionId] !== null);
  return (
    <ul className={styles.defaults}>
      {rows.map((row) => {
        const question = QUESTIONNAIRE_QUESTIONS.find((q) => q.id === row.questionId);
        const pending = patch[row.questionId];
        const value = pending ? (pending.choice ?? pending.custom ?? row.value) : row.value;
        const edited = row.edited || Boolean(pending);
        const isEditing = editing === row.questionId;
        return (
          <li key={row.questionId} className={styles.defaultRow}>
            <span className={styles.question}>{row.title}</span>
            <span className={styles.answer}>{value}</span>
            <Tag tone={edited ? 'info' : 'neutral'}>{edited ? '自己寫' : '系列預設'}</Tag>
            <Button aria-label={`修改「${row.title}」`} onClick={() => setEditing(isEditing ? null : row.questionId)}>
              修改
            </Button>
            <Button aria-label={`清除「${row.title}」`} onClick={() => onPatch(row.questionId, null)}>
              清除
            </Button>
            {isEditing && question && (
              <div className={styles.editor}>
                <div className={styles.options} role="group" aria-label={`${row.title}的選項`}>
                  {question.options.map((option) => (
                    <button
                      key={option}
                      type="button"
                      className={styles.option}
                      aria-pressed={value === option}
                      onClick={() => {
                        onPatch(row.questionId, { choice: option });
                        setEditing(null);
                      }}
                    >
                      {option}
                    </button>
                  ))}
                </div>
                <label htmlFor={`${otherId}-${row.questionId}`} className={styles.otherLabel}>
                  {`${row.title}：或自己寫`}
                </label>
                <input
                  id={`${otherId}-${row.questionId}`}
                  className={styles.otherInput}
                  value={question.options.includes(value as never) ? '' : value}
                  onChange={(event) => onPatch(row.questionId, event.target.value.trim() ? { custom: event.target.value } : { choice: question.options[0] ?? '' })}
                />
                <Button onClick={() => setEditing(null)}>完成</Button>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function SettingsForm({
  series,
  saved,
  defaultsView,
  onSaved,
}: {
  series: Series;
  saved: SettingsFormState;
  defaultsView: QuestionnaireDefaultsView;
  onSaved: () => void;
}) {
  const guard = useLeaveGuard();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<SettingsFormState>(saved);
  const basicId = useId();
  const styleId = useId();
  const modelId = useId();
  const questionnaireId = useId();
  const costId = useId();
  const savedDefaults = defaultsOf(defaultsView);
  const changed = changedItems(saved, form, savedDefaults);
  const blocking = blockingItems(form);
  const message = barMessage(blocking, changed);

  useEffect(() => {
    guard.setDirty(changed.length > 0);
    return () => guard.setDirty(false);
  }, [guard, changed.length]);

  const update = (patch: Partial<SettingsFormState['series']>) => setForm((current) => ({ ...current, series: { ...current.series, ...patch } }));
  const styleAssist = useAiAssist({
    field: 'series.visualStyle',
    fieldLabel: '整體視覺風格',
    seriesId: series.id,
    userInput: () => form.series.visualStyle,
    onAdopt: (visualStyle) => update({ visualStyle }),
  });

  const effectiveDefaults = applyDefaultsPatch(savedDefaults, form.defaultsPatch);
  const lipSync = needsLipSyncNote(effectiveDefaults, form.series.defaultVideoModel);
  const wanLabel = VIDEO_MODELS.find((m) => m.key === form.series.defaultVideoModel)?.label ?? '';

  const save = useMutation({
    mutationFn: async () => {
      const seriesChanged = changed.some((item) => ['系列名稱', '影片方向', '整體視覺風格', '預設圖片模型', '預設影片模型'].includes(item));
      if (seriesChanged) await patchSeries(series.id, toUpdateSeriesInput(form.series));
      if (Object.keys(form.defaultsPatch).length > 0 && changed.some((item) => item.startsWith('問卷預設值'))) {
        await patchQuestionnaireDefaults(series.id, form.defaultsPatch);
      }
      const costPatch: Partial<Settings> = {};
      if (changed.includes('每支影片的費用上限')) {
        const parsed = parseCreditsField(form.cost.videoLimit, '每支影片的費用上限');
        if (parsed.ok) costPatch.defaultVideoCostLimitCredits = parsed.value;
      }
      if (changed.includes('單筆同意門檻')) {
        const parsed = parseCreditsField(form.cost.threshold, '單筆同意門檻');
        if (parsed.ok) costPatch.consentThresholdCredits = parsed.value;
      }
      if (Object.keys(costPatch).length > 0) await patchSettings(costPatch);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: SERIES_LIST_KEY }),
        queryClient.invalidateQueries({ queryKey: DEFAULTS_KEY(series.id) }),
        queryClient.invalidateQueries({ queryKey: SETTINGS_KEY }),
      ]);
      onSaved();
    },
  });

  const saveError = save.isError ? (save.error instanceof ApiRequestError ? save.error.message : '儲存失敗，請再試一次') : null;
  const canSave = blocking.length === 0 && changed.length > 0 && !save.isPending;

  return (
    <>
      <div className={styles.layout}>
        <div className={styles.column}>
          <section className={styles.card} aria-labelledby={basicId}>
            <h2 id={basicId} className={styles.cardTitle}>
              基本資料
            </h2>
            <TextField label="系列名稱" value={form.series.name} maxLength={40} onChange={(name) => update({ name })} />
            <OptionGroup
              legend="影片方向"
              options={SERIES_DIRECTIONS.map((value) => ({ value, label: value }))}
              value={form.series.directionOption}
              onChange={(directionOption) => update({ directionOption, directionOther: '' })}
              other={{
                value: form.series.directionOther,
                onChange: (directionOther) => update({ directionOther, directionOption: directionOther.trim() ? null : form.series.directionOption }),
              }}
            />
          </section>

          <section className={styles.card} aria-labelledby={styleId}>
            <h2 id={styleId} className={styles.cardTitle}>
              視覺風格
            </h2>
            <p className={styles.help}>這段描述會帶進每一支新影片的分鏡方案與生成指令。</p>
            <TextField
              label="整體視覺風格"
              multiline
              value={form.series.visualStyle}
              maxLength={500}
              placeholder="例如：寫實電影感、清晨暖光、淺景深"
              onChange={(visualStyle) => update({ visualStyle })}
              labelAccessory={styleAssist.button}
            />
            {styleAssist.panel}
          </section>

          <section className={styles.card} aria-labelledby={modelId}>
            <div>
              <h2 id={modelId} className={styles.cardTitle}>
                預設生成模型
              </h2>
              <p className={styles.help}>新增影片時會先選好這兩個模型，仍可在建立影片頁更改；產生寺廟定裝版後，那支影片的模型就會鎖定。</p>
            </div>
            <ModelPicker<ImageModelKey>
              legend="圖片模型"
              models={IMAGE_MODELS}
              value={form.series.defaultImageModel}
              seriesDefault={DEFAULT_IMAGE_MODEL}
              defaultLabel="系統預設"
              disabled={false}
              onChange={(defaultImageModel) => update({ defaultImageModel })}
            />
            <p className={styles.help}>構圖草圖用同系列的 Nano Banana 2 Lite；其他圖片模型尚未開放。</p>
            <ModelPicker<VideoModelKey>
              legend="影片模型"
              models={VIDEO_MODELS}
              value={form.series.defaultVideoModel}
              seriesDefault={DEFAULT_VIDEO_MODEL}
              defaultLabel="系統預設"
              disabled={false}
              onChange={(defaultVideoModel) => update({ defaultVideoModel })}
            />
            {lipSync && (
              <p role="status" className={styles.warning}>
                <TriangleAlert size={18} strokeWidth={1.8} aria-hidden="true" />
                {`${wanLabel} 沒有原生語音，需另外處理對口型：這個系列的問卷預設是「角色對鏡說話」，有台詞的格子要另外對口型。`}
              </p>
            )}
          </section>

          <section className={styles.card} aria-labelledby={questionnaireId}>
            <div>
              <h2 id={questionnaireId} className={styles.cardTitle}>
                問卷預設值
              </h2>
              <p className={styles.help}>
                {defaultsView.sourceVideo ? (
                  <>
                    {`來自系列第一支影片〈${defaultsView.sourceVideo.title}〉的問卷。`}
                    新影片的問卷會先帶入這些答案，標示「系列預設」。「想講的故事」每支影片各自填寫，不列為預設。
                  </>
                ) : (
                  '還沒有問卷預設值：系列第一支影片送出問卷後，答案會存成這個系列的預設。「想講的故事」每支影片各自填寫，不列為預設。'
                )}
              </p>
            </div>
            <DefaultsList
              view={defaultsView}
              patch={form.defaultsPatch}
              onPatch={(questionId, answer) => setForm((current) => ({ ...current, defaultsPatch: { ...current.defaultsPatch, [questionId]: answer } }))}
            />
          </section>

          <section className={styles.card} aria-labelledby={costId}>
            <div>
              <h2 id={costId} className={styles.cardTitle}>
                費用
              </h2>
              <p className={styles.help}>超過上限或單筆門檻的生成，會先請你同意才送出。這兩個數字適用所有系列。</p>
            </div>
            <div className={styles.costGrid}>
              <TextField
                label="每支影片的費用上限"
                value={form.cost.videoLimit}
                placeholder="[金額]"
                onChange={(videoLimit) => setForm((current) => ({ ...current, cost: { ...current.cost, videoLimit } }))}
              />
              <TextField
                label="單筆同意門檻"
                value={form.cost.threshold}
                placeholder="[金額]"
                onChange={(threshold) => setForm((current) => ({ ...current, cost: { ...current.cost, threshold } }))}
              />
            </div>
          </section>
        </div>

        <aside className={styles.aside} aria-label="修改的影響範圍">
          <div className={styles.infoCard}>
            <p className={styles.infoTitle}>
              <Info size={18} strokeWidth={1.8} aria-hidden="true" />
              只影響之後新增的影片
            </p>
            <p className={styles.infoText}>已建立的影片維持原本的設定、問卷與模型，不會因為這裡的修改而改變。</p>
          </div>
          <div className={styles.sideCard}>
            <h2 className={styles.sideTitle}>新影片會怎麼使用這些設定</h2>
            <ul className={styles.sideList}>
              <li>建立影片頁先選好預設的圖片與影片模型。</li>
              <li>問卷先帶入預設答案，可以逐題改。</li>
              <li>分鏡方案與生成指令套用視覺風格。</li>
              <li>
                <Link to={`/series/${series.id}/characters`}>角色庫</Link>中的系列角色可以直接沿用。
              </li>
            </ul>
          </div>
        </aside>
      </div>

      <section className={styles.bar} aria-label="操作列">
        <div className={styles.barInner}>
          <div>
            <p className={styles.barMessage}>{message}</p>
            {saveError && (
              <p className={styles.barError} role="alert">
                {saveError}
              </p>
            )}
          </div>
          <div className={styles.barActions}>
            <Button disabled={changed.length === 0 || save.isPending} onClick={() => setForm(saved)}>
              取消
            </Button>
            <Button variant="primary" disabled={!canSave} aria-busy={save.isPending || undefined} onClick={() => save.mutate()}>
              儲存變更
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}

export function SeriesSettingsTab() {
  const { series } = useSeriesPage();
  const settings = useQuery({ queryKey: SETTINGS_KEY, queryFn: fetchSettings });
  const defaults = useQuery({ queryKey: DEFAULTS_KEY(series.id), queryFn: () => fetchQuestionnaireDefaults(series.id) });
  // 儲存完成後，用重新讀到的內容重建表單
  const [formKey, setFormKey] = useState(0);
  const failed = settings.isError ? settings.error : defaults.isError ? defaults.error : null;

  return (
    <>
      {failed && (
        <p className={styles.error} role="alert">
          讀不到設定：{failed.message}
        </p>
      )}
      {!failed && (!settings.data || !defaults.data) && (
        <p className={styles.help} role="status">
          正在讀取設定…
        </p>
      )}
      {settings.data && defaults.data && (
        <SettingsForm
          key={`${formKey}-${series.updatedAt}-${JSON.stringify(settings.data)}-${JSON.stringify(defaults.data)}`}
          series={series}
          saved={savedStateOf(series, settings.data)}
          defaultsView={defaults.data}
          onSaved={() => setFormKey((value) => value + 1)}
        />
      )}
    </>
  );
}
