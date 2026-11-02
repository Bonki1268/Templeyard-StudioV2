import { describe, expect, it } from 'vitest';
import { STANDARD_VIEWS, viewCoverage, viewName } from './views.js';

describe('視角對照', () => {
  it('沒有照片時，每個標準視角都是「缺少照片」，順序同標準清單', () => {
    const coverage = viewCoverage([]);
    expect(coverage.map((row) => row.key)).toEqual(STANDARD_VIEWS.map((view) => view.key));
    expect(coverage.every((row) => row.status === 'missing' && row.photoIds.length === 0)).toBe(true);
  });

  it('照片指定了視角，該視角變成「已有照片」並列出照片', () => {
    const coverage = viewCoverage([{ id: 'p1', viewKey: 'courtyard' }]);
    expect(coverage.find((row) => row.key === 'courtyard')).toEqual({
      key: 'courtyard',
      name: '廟埕',
      status: 'has_photo',
      photoIds: ['p1'],
    });
    expect(coverage.find((row) => row.key === 'front_overview')?.status).toBe('missing');
  });

  it('同一個視角有多張照片時全部列出', () => {
    const coverage = viewCoverage([
      { id: 'p1', viewKey: 'main_hall' },
      { id: 'p2', viewKey: 'main_hall' },
    ]);
    expect(coverage.find((row) => row.key === 'main_hall')?.photoIds).toEqual(['p1', 'p2']);
  });

  it('還沒指定視角、或視角不在清單裡的照片不計入', () => {
    const coverage = viewCoverage([
      { id: 'p1', viewKey: null },
      { id: 'p2', viewKey: 'custom_gate' },
    ]);
    expect(coverage.every((row) => row.status === 'missing')).toBe(true);
  });
});

describe('視角名稱', () => {
  it('標準視角回傳中文名稱', () => {
    expect(viewName('sanchuan_hall')).toBe('三川殿（山門）');
  });

  it('不在清單裡時回傳原本的 key', () => {
    expect(viewName('custom_gate')).toBe('custom_gate');
  });
});
