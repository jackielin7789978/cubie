import { describe, expect, it } from 'vitest';
import { applyMoves, createSolvedState, isSolved, layerCoords } from '../cubeState';
import { invertMove, parseNotation } from '../moves';
import { createSeededRng } from '../random';
import { generateScramble } from '../scramble';
import { AXES } from '../types';
import type { Move } from '../types';
import { reverseSolve, simplifyMoves } from './reverseSolver';

const [R, U] = parseNotation('R U');
const Ri = invertMove(R);
const Ui = invertMove(U);

/** 模擬玩家亂轉：可以轉任何一層（包含中間層），也可能連續轉同一層 */
function randomPlayerMoves(size: number, count: number, rng: () => number): Move[] {
  const layers = layerCoords(size);
  return Array.from({ length: count }, () => ({
    axis: AXES[Math.floor(rng() * 3)],
    layer: layers[Math.floor(rng() * layers.length)],
    dir: rng() < 0.5 ? 1 : -1,
  }));
}

describe('simplifyMoves', () => {
  it("R R' 抵銷", () => {
    expect(simplifyMoves([R, Ri])).toEqual([]);
  });

  it("R R R → R'", () => {
    expect(simplifyMoves([R, R, R])).toEqual([Ri]);
  });

  it('R R 保持兩步、R R R R 抵銷', () => {
    expect(simplifyMoves([R, R])).toEqual([R, R]);
    expect(simplifyMoves([R, R, R, R])).toEqual([]);
  });

  it("連鎖抵銷：R U U' R' → 空", () => {
    expect(simplifyMoves([R, U, Ui, Ri])).toEqual([]);
  });

  it("不同層不合併：R U R' 保持原樣", () => {
    expect(simplifyMoves([R, U, Ri])).toEqual([R, U, Ri]);
  });

  it('不修改輸入陣列', () => {
    const input = [R, R, R];
    simplifyMoves(input);
    expect(input).toEqual([R, R, R]);
  });

  it.each([2, 3, 4])('%i×%i 化簡前後效果相同', (size) => {
    const rng = createSeededRng(size);
    const moves = randomPlayerMoves(size, 200, rng);
    const solved = createSolvedState(size);
    const simplified = simplifyMoves(moves);
    expect(simplified.length).toBeLessThanOrEqual(moves.length);
    const key = (moves: Move[]) =>
      applyMoves(solved, moves)
        .stickers.map((s) => `${s.position.join()}|${s.normal.join()}|${s.color}`)
        .sort();
    expect(key(simplified)).toEqual(key(moves));
  });
});

describe.each([2, 3, 4])('%i×%i reverseSolve', (size) => {
  it('打亂＋玩家亂轉（含中間層、重複同層）後可以還原', () => {
    for (let seed = 0; seed < 10; seed++) {
      const rng = createSeededRng(seed * 31 + size);
      const history = [...generateScramble(size, undefined, rng), ...randomPlayerMoves(size, 150, rng)];
      const state = applyMoves(createSolvedState(size), history);
      expect(isSolved(applyMoves(state, reverseSolve(history)))).toBe(true);
    }
  });

  it('空歷史回傳空陣列', () => {
    expect(reverseSolve([])).toEqual([]);
  });
});
