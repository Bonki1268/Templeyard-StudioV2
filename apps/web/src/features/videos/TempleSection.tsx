import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MAX_TEMPLE_NOTES_LENGTH, type TempleSummary, type VideoDetail } from '@templeyard/shared';
import { useId, useState } from 'react';
import { patchVideo, postVideo, searchTemples } from '../../api/client';
import { Button } from '../../components/Button';
import { Tag } from '../../components/Tag';
import { TextField } from '../../components/TextField';
import { useAiAssist } from '../assist/useAiAssist';
import styles from './TempleSection.module.css';
import { useDebouncedValue } from './useDebouncedValue';
import { useUpdateVideoDetail, videoDetailKey } from './useVideoDetail';

type TempleSectionProps = {
  seriesId: string;
  /** 已選定寺廟時才有 */
  detail: VideoDetail | null;
  /** 第一次選定寺廟、建立影片草稿之後 */
  onVideoCreated: (videoId: string) => void;
};

/** 1 選擇寺廟：搜尋 → 選定 → 寺廟資料卡＋使用者貼上的歷史與簡介 */
export function TempleSection({ seriesId, detail, onVideoCreated }: TempleSectionProps) {
  const titleId = useId();
  const [reselecting, setReselecting] = useState(false);
  const searching = !detail || reselecting;

  return (
    <section className={styles.section} aria-labelledby={titleId}>
      <h2 id={titleId} className={styles.title}>
        <span className={styles.number} aria-hidden="true">
          1
        </span>
        選擇寺廟
      </h2>
      {searching ? (
        <TempleSearch
          seriesId={seriesId}
          detail={detail}
          onSelected={(videoId) => {
            setReselecting(false);
            if (!detail) onVideoCreated(videoId);
          }}
          onCancel={detail ? () => setReselecting(false) : undefined}
        />
      ) : (
        <>
          <TempleCard temple={detail.temple} onReselect={() => setReselecting(true)} />
          <TempleNotes key={detail.video.id} detail={detail} />
        </>
      )}
    </section>
  );
}

function TempleSearch({
  seriesId,
  detail,
  onSelected,
  onCancel,
}: {
  seriesId: string;
  detail: VideoDetail | null;
  onSelected: (videoId: string) => void;
  onCancel: (() => void) | undefined;
}) {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');
  const debounced = useDebouncedValue(query.trim(), 250);
  const results = useQuery({
    queryKey: ['temples', debounced],
    queryFn: ({ signal }) => searchTemples(debounced, signal),
    enabled: debounced.length > 0,
  });

  const select = useMutation({
    mutationFn: async (templeId: string) =>
      detail ? patchVideo(detail.video.id, { templeId }) : postVideo({ seriesId, templeId }),
    onSuccess: async (video) => {
      // 重新選寺廟後，寺廟資料卡與照片都要換成新的廟
      if (detail) await queryClient.invalidateQueries({ queryKey: videoDetailKey(video.id) });
      onSelected(video.id);
    },
  });

  return (
    <div className={styles.search}>
      <TextField label="搜尋寺廟" value={query} onChange={setQuery} placeholder="以廟名、行政區或主祀神明搜尋" />
      {results.isFetching && <p className={styles.muted}>正在搜尋…</p>}
      {results.isError && (
        <p className={styles.error} role="alert">
          搜尋失敗：{results.error.message}
        </p>
      )}
      {results.isSuccess && debounced.length > 0 && results.data.length === 0 && (
        <p className={styles.muted}>找不到符合「{debounced}」的寺廟，換個廟名、行政區或主祀神明試試。</p>
      )}
      {results.isSuccess && results.data.length > 0 && (
        <ul className={styles.results} aria-label="搜尋結果">
          {results.data.map((temple) => (
            <li key={temple.id}>
              <ResultButton temple={temple} disabled={select.isPending} onSelect={() => select.mutate(temple.id)} />
            </li>
          ))}
        </ul>
      )}
      {select.isError && (
        <p className={styles.error} role="alert">
          選擇寺廟失敗：{select.error.message}
        </p>
      )}
      {onCancel && (
        <Button className={styles.cancel} onClick={onCancel}>
          不換了，保留原本的寺廟
        </Button>
      )}
    </div>
  );
}

function ResultButton({ temple, disabled, onSelect }: { temple: TempleSummary; disabled: boolean; onSelect: () => void }) {
  const metaId = useId();
  return (
    <button
      type="button"
      className={styles.result}
      aria-label={temple.name}
      aria-describedby={metaId}
      disabled={disabled}
      onClick={onSelect}
    >
      <span className={styles.resultName}>{temple.name}</span>
      <span id={metaId} className={styles.resultMeta}>
        {temple.district} · 主祀 {temple.deity} · {temple.religion}
      </span>
    </button>
  );
}

function TempleCard({ temple, onReselect }: { temple: TempleSummary; onReselect: () => void }) {
  const ids = { address: useId(), deity: useId(), religion: useId(), founded: useId() };
  const rows = [
    { id: ids.address, label: '地址', value: temple.address },
    { id: ids.deity, label: '主祀神明', value: temple.deity },
    { id: ids.religion, label: '教別', value: temple.religion },
    { id: ids.founded, label: '創建年', value: temple.foundedYear === null ? '資料庫未記載' : `${temple.foundedYear} 年` },
  ];
  return (
    <section className={styles.card} aria-label="寺廟資料卡">
      <div className={styles.cardHead}>
        <Tag tone="success">已選定</Tag>
        <h3 className={styles.cardName}>{temple.name}</h3>
        <p className={styles.muted}>
          {temple.district} · 主祀 {temple.deity} · {temple.religion}
        </p>
      </div>
      <dl className={styles.facts}>
        {rows.map((row) => (
          <div key={row.label} className={styles.fact}>
            <dt id={row.id}>{row.label}</dt>
            <dd aria-labelledby={row.id}>{row.value}</dd>
          </div>
        ))}
      </dl>
      <p className={styles.source}>以上資料來源：寺廟資料庫</p>
      <Button onClick={onReselect}>重新選擇寺廟</Button>
    </section>
  );
}

/** 使用者貼上的寺廟歷史與簡介：離開欄位時自動儲存；Agent 引用時標示「使用者提供」 */
function TempleNotes({ detail }: { detail: VideoDetail }) {
  const updateDetail = useUpdateVideoDetail(detail.video.id);
  const [notes, setNotes] = useState(detail.video.userTempleNotes);
  const [saved, setSaved] = useState(false);
  const save = useMutation({
    mutationFn: (userTempleNotes: string) => patchVideo(detail.video.id, { userTempleNotes }),
    onSuccess: (video) => {
      updateDetail((old) => ({ ...old, video }));
      setSaved(true);
    },
  });
  // AI 整理成條列：採用後填入並儲存（只是存下欄位內容，不會送出其他東西）
  const notesAssist = useAiAssist({
    field: 'video.templeNotes',
    label: 'AI 整理成條列',
    videoId: detail.video.id,
    userInput: () => notes,
    onAdopt: (text) => {
      setNotes(text);
      setSaved(false);
      save.mutate(text);
    },
  });

  return (
    <div className={styles.notes}>
      <TextField
        label="寺廟歷史與簡介（選填）"
        value={notes}
        multiline
        maxLength={MAX_TEMPLE_NOTES_LENGTH}
        placeholder="貼上你知道的寺廟歷史、傳說或簡介；AI 只會整理你提供的內容"
        onChange={(value) => {
          setNotes(value);
          setSaved(false);
        }}
        onBlur={() => {
          if (notes !== detail.video.userTempleNotes) save.mutate(notes);
        }}
        labelAccessory={
          <span className={styles.notesAccessory}>
            {notes.trim() && <Tag tone="info">使用者提供</Tag>}
            {notesAssist.button}
          </span>
        }
      />
      {notesAssist.panel}
      <p className={styles.saved} role="status">
        {saved ? '已儲存寺廟歷史與簡介' : ''}
      </p>
      {save.isError && (
        <p className={styles.error} role="alert">
          儲存失敗：{save.error.message}
        </p>
      )}
    </div>
  );
}
