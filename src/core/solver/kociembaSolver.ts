import { isSolved } from '../cubeState';
import { toFaceletString } from '../facelets';
import { parseNotation } from '../moves';
import type { CubeState, Move } from '../types';

/**
 * 真正的解法器（例如 cubejs）：收到 54 字元 facelet 字串，回傳解法記號（例如 "R U2 F'"）。
 * core 不直接依賴任何解法器套件，由呼叫端（Web Worker 或測試）傳進來。
 */
export type FaceletSolver = (facelets: string) => string | Promise<string>;

/** 把解法器回傳的記號轉成 Move 陣列（180° 會拆成兩步） */
export function solutionToMoves(solution: string): Move[] {
  return parseNotation(solution, 3);
}

/** 用傳入的解法器解一個 3×3 狀態；已經是完成狀態就直接回傳空陣列 */
export async function solveWithFaceletSolver(state: CubeState, solver: FaceletSolver): Promise<Move[]> {
  if (isSolved(state)) return [];
  const solution = await solver(toFaceletString(state));
  return solutionToMoves(solution);
}
