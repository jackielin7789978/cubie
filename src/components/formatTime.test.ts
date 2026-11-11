import { describe, expect, it } from 'vitest';
import { formatTime } from './formatTime';

describe('formatTime', () => {
  it('格式是 m:ss.cc', () => {
    expect(formatTime(0)).toBe('0:00.00');
    expect(formatTime(12345)).toBe('0:12.34');
    expect(formatTime(59999)).toBe('0:59.99');
    expect(formatTime(60000)).toBe('1:00.00');
    expect(formatTime(754321)).toBe('12:34.32');
  });

  it('負數當成 0', () => {
    expect(formatTime(-5)).toBe('0:00.00');
  });
});
