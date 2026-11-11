import { describe, expect, it } from 'vitest';
import { applyMoves, createSolvedState, isSolved, layerCoords } from './cubeState';
import { isSameLayer } from './moves';
import { createSeededRng } from './random';
import { defaultScrambleLength, generateScramble, scrambleLayers } from './scramble';

describe.each([2, 3, 4])('%i×%i 打亂', (size) => {
  it('長度符合預設值，也可以自訂長度', () => {
    expect(generateScramble(size)).toHaveLength(defaultScrambleLength(size));
    expect(generateScramble(size, 7)).toHaveLength(7);
    expect(generateScramble(size, 0)).toEqual([]);
  });

  it('不會連續轉同一層', () => {
    for (let seed = 0; seed < 20; seed++) {
      const moves = generateScramble(size, 100, createSeededRng(seed));
      moves.slice(1).forEach((move, i) => expect(isSameLayer(moves[i], move)).toBe(false));
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

  it('打亂後不是完成狀態', () => {
    for (let seed = 0; seed < 20; seed++) {
      const scrambled = applyMoves(createSolvedState(size), generateScramble(size, undefined, createSeededRng(seed)));
      expect(isSolved(scrambled)).toBe(false);
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
