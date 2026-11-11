import { describe, expect, it } from 'vitest';
import { generateScramble, invertMoves, reverseSolve, toNotation } from '../core';
import type { Move } from '../core/types';
import { countSteps } from './gameRules';

const R: Move = { axis: 'x', layer: 1, dir: -1 };
const Ri: Move = { axis: 'x', layer: 1, dir: 1 };
const U: Move = { axis: 'y', layer: 1, dir: -1 };

describe('countSteps：用標準記號算步數', () => {
  it('空序列是 0 步', () => {
    expect(countSteps([])).toBe(0);
  });

  it('同一層連續兩次相同的 90° 算一步（R2）', () => {
    expect(countSteps([R, R])).toBe(1);
    expect(countSteps([R, R, U])).toBe(2);
  });

  it('三次相同兩兩合併：R2 R 算兩步', () => {
    expect(countSteps([R, R, R])).toBe(2);
    expect(countSteps([R, R, R, R])).toBe(2);
  });

  it('方向相反不合併', () => {
    expect(countSteps([R, Ri])).toBe(2);
  });

  it('4×4 的內層轉動也能算', () => {
    const inner: Move = { axis: 'x', layer: 0.5, dir: -1 };
    const outer: Move = { axis: 'x', layer: 1.5, dir: -1 };
    expect(countSteps([inner, inner, outer])).toBe(2);
    expect(countSteps([inner, outer])).toBe(2);
  });

  it('3×3 時和 toNotation 切出來的數量一樣', () => {
    const samples: Move[][] = [[R, R, U, U, U, Ri], invertMoves([R, U, R, R]), reverseSolve(generateScramble(3))];
    for (const moves of samples) {
      expect(countSteps(moves)).toBe(toNotation(moves, 3).split(' ').filter(Boolean).length);
    }
  });
});
