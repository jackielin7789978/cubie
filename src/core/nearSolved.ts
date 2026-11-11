import { applyMove, isSolved } from './cubeState';
import { faceMove, invertMove } from './moves';
import type { FaceLetter } from './moves';
import type { CubeState, Move } from './types';

/**
 * 搜尋用的一步（半圈計數法：90°、180°、-90° 都算一步）。
 * 只用 R、U、F 三面就夠了：isSolved 不管整顆方塊的方向，
 * 對 2×2 來說 L 等於 R' 再整顆轉向，所以不用另外搜。
 */
function searchSteps(size: number): Move[][] {
  const faces: FaceLetter[] = ['R', 'U', 'F'];
  return faces.flatMap((face) => {
    const clockwise = faceMove(face, size);
    return [[clockwise], [clockwise, clockwise], [invertMove(clockwise)]];
  });
}

function search(state: CubeState, depth: number, steps: Move[][], lastAxis: string | null): boolean {
  if (isSolved(state)) return true;
  if (depth === 0) return false;
  return steps.some((step) => {
    if (step[0].axis === lastAxis) return false;
    const next = step.reduce(applyMove, state);
    return search(next, depth - 1, steps, step[0].axis);
  });
}

/**
 * 2×2 專用：方塊能不能在 maxDepth 步以內解完（深度優先搜尋，不連續轉同一軸）。
 * 深度 3 只有幾百個節點，可以在產生打亂時直接用。
 */
export function isWithinMovesOfSolved(state: CubeState, maxDepth: number): boolean {
  return search(state, maxDepth, searchSteps(state.size), null);
}
