import { describe, expect, it } from 'vitest';
import { templeTags, videoEntryPath, videoStageLabel } from './seriesVideos.js';
import { VIDEO_STAGES } from './videos.js';

describe('影片階段的名稱', () => {
  it.each([
    ['creating', '建立中'],
    ['board_pending', '定裝版待確認'],
    ['chat', '創作對話'],
    ['questionnaire', '設定問卷'],
    ['plan', '分鏡方案'],
    ['frames_generating', '精緻圖生成中'],
    ['frames', '精緻圖'],
    ['video_generating', '影片生成中'],
    ['final', '成品'],
    ['done', '完成'],
  ] as const)('%s 是「%s」', (stage, label) => {
    expect(videoStageLabel(stage)).toBe(label);
  });

  it('每個階段都有名稱', () => {
    expect(VIDEO_STAGES.every((stage) => videoStageLabel(stage).length > 0)).toBe(true);
  });
});

describe('點影片時前往的頁面', () => {
  const video = (stage: (typeof VIDEO_STAGES)[number]) => ({ id: 'v1', seriesId: 's1', stage });

  it('還在建立：建立影片頁', () => {
    expect(videoEntryPath(video('creating'))).toBe('/series/s1/videos/new?video=v1');
  });

  it('定裝版待確認：寺廟定裝版頁', () => {
    expect(videoEntryPath(video('board_pending'))).toBe('/videos/v1/temple-board');
  });

  it.each(['chat', 'questionnaire', 'plan', 'frames_generating', 'frames', 'video_generating'] as const)('%s：創作工作區（依進度顯示面板）', (stage) => {
    expect(videoEntryPath(video(stage))).toBe('/videos/v1/studio');
  });

  it.each(['final', 'done'] as const)('%s：創作工作區的成品面板', (stage) => {
    expect(videoEntryPath(video(stage))).toBe('/videos/v1/studio?panel=final');
  });
});

describe('系列卡片上的寺廟標籤', () => {
  it('用過的寺廟不重複，依影片的順序', () => {
    expect(templeTags([{ templeName: '板橋慈惠宮' }, { templeName: '新莊地藏庵' }, { templeName: '板橋慈惠宮' }])).toEqual(['板橋慈惠宮', '新莊地藏庵']);
  });

  it('沒有影片：沒有標籤', () => {
    expect(templeTags([])).toEqual([]);
  });
});
