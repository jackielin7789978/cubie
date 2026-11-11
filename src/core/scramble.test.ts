import { describe, expect, it } from 'vitest';
import { applyMoves, createSolvedState, isSolved, layerCoords } from './cubeState';
import { faceMove, invertMove } from './moves';
import { isWithinMovesOfSolved } from './nearSolved';
import { createSeededRng } from './random';
import {
  defaultScrambleLength,
  generateScramble,
  isAcceptableScramble,
  scrambleLayers,
  scrambleLayersForAxis,
} from './scramble';
import type { CubeState, Move } from './types';

describe.each([2, 3, 4])('尺寸 %i 的打亂', (size) => {
  it('長度符合預設值，也可以自訂長度', () => {
    expect(generateScramble(size)).toHaveLength(defaultScrambleLength(size));
    expect(generateScramble(size, 7)).toHaveLength(7);
    expect(generateScramble(size, 0)).toEqual([]);
  });

  it('不會連續轉同一軸', () => {
    for (let seed = 0; seed < 20; seed++) {
      const moves = generateScramble(size, 100, createSeededRng(seed));
      moves.slice(1).forEach((move, i) => expect(moves[i].axis).not.toBe(move.axis));
    }
  });

  it('只轉合法的層，奇數尺寸不轉正中間那層', () => {
    const valid = layerCoords(size);
    const moves = generateScramble(size, 300, createSeededRng(42));
    for (const move of moves) {
      expect(valid).toContain(move.layer);
      expect(move.layer).not.toBe(0);
    }
  });

  it('注入相同 rng 得到相同結果；不同 seed 結果不同', () => {
    const a = generateScramble(size, 30, createSeededRng(123));
    const b = generateScramble(size, 30, createSeededRng(123));
    const c = generateScramble(size, 30, createSeededRng(124));
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it('取樣數千次，沒有任何一次打亂完是完成狀態', () => {
    const solved = createSolvedState(size);
    const samples = size === 4 ? 1000 : 3000;
    for (let seed = 0; seed < samples; seed++) {
      const scrambled = applyMoves(solved, generateScramble(size, undefined, createSeededRng(seed)));
      expect(isSolved(scrambled)).toBe(false);
    }
  });
});

/** 測試用的獨立 BFS：從打亂的狀態往外走，看 maxDepth 步（半圈計數）以內能不能解完 */
function bfsSolvableWithin(start: CubeState, maxDepth: number): boolean {
  const faces = ['R', 'L', 'U', 'D', 'F', 'B'] as const;
  const steps: Move[][] = faces.flatMap((face) => {
    const m = faceMove(face, start.size);
    return [[m], [m, m], [invertMove(m)]];
  });
  let frontier: CubeState[] = [start];
  for (let depth = 0; depth <= maxDepth; depth++) {
    if (frontier.some(isSolved)) return true;
    if (depth === maxDepth) break;
    frontier = frontier.flatMap((state) => steps.map((step) => applyMoves(state, step)));
  }
  return false;
}

function randomOuterMove(rng: () => number): Move {
  const faces = ['R', 'L', 'U', 'D', 'F', 'B'] as const;
  const move = faceMove(faces[Math.floor(rng() * faces.length)], 2);
  return rng() < 0.5 ? move : invertMove(move);
}

describe('2×2 打亂品質', () => {
  it('只轉每個軸正向那一層（R、U、F）', () => {
    expect(scrambleLayersForAxis(2)).toEqual([0.5]);
    for (const move of generateScramble(2, 200, createSeededRng(9))) expect(move.layer).toBe(0.5);
  });

  it('取樣 2000 次，沒有 3 步以內可解的打亂（其中 100 次用獨立 BFS 再確認）', () => {
    const solved = createSolvedState(2);
    for (let seed = 0; seed < 2000; seed++) {
      const scrambled = applyMoves(solved, generateScramble(2, undefined, createSeededRng(seed)));
      expect(isWithinMovesOfSolved(scrambled, 3)).toBe(false);
      if (seed < 100) expect(bfsSolvableWithin(scrambled, 3)).toBe(false);
    }
  });

  it('BFS 抽查：產生器的近距離檢查和獨立 BFS 結果一致', () => {
    const solved = createSolvedState(2);
    for (let seed = 0; seed < 60; seed++) {
      // 直接亂轉 1–5 步（不經過產生器的篩選），才會同時出現「近」和「遠」的狀態
      const rng = createSeededRng(seed);
      const length = 1 + Math.floor(rng() * 5);
      const moves = Array.from({ length }, () => randomOuterMove(rng));
      const scrambled = applyMoves(solved, moves);
      expect(isWithinMovesOfSolved(scrambled, 3)).toBe(bfsSolvableWithin(scrambled, 3));
    }
  });

  it('太接近完成的打亂不被接受', () => {
    const solved = createSolvedState(2);
    const r = faceMove('R', 2);
    expect(isAcceptableScramble(2, solved)).toBe(false);
    expect(isAcceptableScramble(2, applyMoves(solved, [r, faceMove('U', 2)]))).toBe(false);
    // 兩層同方向各轉一次 = 整顆轉向，等於沒打亂
    expect(isAcceptableScramble(2, applyMoves(solved, [r, { ...r, layer: -0.5 }]))).toBe(false);
  });

  it('短打亂也不會產生 3 步內可解的結果', () => {
    const solved = createSolvedState(2);
    for (let seed = 0; seed < 200; seed++) {
      const scrambled = applyMoves(solved, generateScramble(2, 6, createSeededRng(seed)));
      expect(isWithinMovesOfSolved(scrambled, 3)).toBe(false);
    }
  });
});

describe('scrambleLayers', () => {
  it('3×3 只有兩個外層，4×4 有四層', () => {
    expect(scrambleLayers(3)).toEqual([-1, 1]);
    expect(scrambleLayers(4)).toEqual([-1.5, -0.5, 0.5, 1.5]);
    expect(scrambleLayers(5)).toEqual([-2, -1, 1, 2]);
  });

  it('沒有可轉的層時丟出錯誤，不會無窮迴圈', () => {
    expect(() => generateScramble(1, 5)).toThrow();
  });
});

describe('createSeededRng', () => {
  it('產生 [0, 1) 的數字', () => {
    const rng = createSeededRng(7);
    for (let i = 0; i < 1000; i++) {
      const value = rng();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});
