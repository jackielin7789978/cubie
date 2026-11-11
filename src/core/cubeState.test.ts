import { describe, expect, it } from 'vitest';
import { applyMoves, createSolvedState, isSolved } from './cubeState';
import { generateScramble } from './scramble';
import { reverseSolve } from './solver/reverseSolver';

// 基本健全性檢查；完整測試由 core 工作線補上
describe.each([2, 3, 4])('%i×%i 方塊', (size) => {
  it('貼紙數量正確，初始為完成狀態', () => {
    const state = createSolvedState(size);
    expect(state.stickers).toHaveLength(6 * size * size);
    expect(isSolved(state)).toBe(true);
  });

  it('打亂後不是完成狀態，反轉歷史可以還原', () => {
    const scramble = generateScramble(size);
    const scrambled = applyMoves(createSolvedState(size), scramble);
    expect(isSolved(scrambled)).toBe(false);
    expect(isSolved(applyMoves(scrambled, reverseSolve(scramble)))).toBe(true);
  });
});
