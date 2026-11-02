import { describe, expect, it } from 'vitest';
import { sniffImageMime } from './sniff.js';

const bytes = (...values: number[]) => new Uint8Array(values);
const ascii = (text: string) => [...text].map((ch) => ch.charCodeAt(0));

describe('依檔頭判斷圖片格式', () => {
  it.each([
    ['PNG', bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0), 'image/png'],
    ['JPEG', bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1), 'image/jpeg'],
    ['WebP', bytes(...ascii('RIFF'), 0x24, 0, 0, 0, ...ascii('WEBP')), 'image/webp'],
  ])('%s', (_name, input, expected) => {
    expect(sniffImageMime(input)).toBe(expected);
  });

  it.each([
    ['GIF', bytes(...ascii('GIF89a'), 0, 0, 0, 0, 0, 0)],
    ['RIFF 但不是 WebP（WAV）', bytes(...ascii('RIFF'), 0x24, 0, 0, 0, ...ascii('WAVE'))],
    ['太短', bytes(0x89, 0x50)],
    ['空的', bytes()],
  ])('%s 回傳 null', (_name, input) => {
    expect(sniffImageMime(input)).toBeNull();
  });
});
