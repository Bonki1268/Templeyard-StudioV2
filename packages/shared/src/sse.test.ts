import { describe, expect, it } from 'vitest';
import { createSseParser, formatSseEvent } from './sse.js';

describe('SSE 格式', () => {
  it('一則事件：event、data（JSON），以空行結束', () => {
    expect(formatSseEvent('text', { type: 'text', text: '好的' })).toBe('event: text\ndata: {"type":"text","text":"好的"}\n\n');
  });

  it('資料以 JSON 編碼，文字裡的換行不會打斷事件', () => {
    expect(formatSseEvent('text', '第一行\n第二行')).toBe('event: text\ndata: "第一行\\n第二行"\n\n');
  });
});

describe('SSE 解析', () => {
  it('一段文字裡有多則事件時依序取出', () => {
    const parser = createSseParser();
    expect(parser.push('event: a\ndata: 1\n\nevent: b\ndata: 2\n\n')).toEqual([
      { event: 'a', data: '1' },
      { event: 'b', data: '2' },
    ]);
  });

  it('事件被切在兩段之間時，等收齊才回傳', () => {
    const parser = createSseParser();
    expect(parser.push('event: text\nda')).toEqual([]);
    expect(parser.push('ta: {"x":1}\n')).toEqual([]);
    expect(parser.push('\n')).toEqual([{ event: 'text', data: '{"x":1}' }]);
  });

  it('多行 data 以換行接回；註解行略過；沒有 event 時是 message', () => {
    const parser = createSseParser();
    expect(parser.push(': keep-alive\ndata: 第一行\ndata: 第二行\n\n')).toEqual([{ event: 'message', data: '第一行\n第二行' }]);
  });

  it('接受 \\r\\n 換行', () => {
    const parser = createSseParser();
    expect(parser.push('event: done\r\ndata: {}\r\n\r\n')).toEqual([{ event: 'done', data: '{}' }]);
  });

  it('格式化後再解析，內容不變', () => {
    const parser = createSseParser();
    const data = { type: 'text', text: '多行\n內容' };
    const [message] = parser.push(formatSseEvent('text', data));
    expect(message?.event).toBe('text');
    expect(JSON.parse(message?.data ?? '')).toEqual(data);
  });
});
