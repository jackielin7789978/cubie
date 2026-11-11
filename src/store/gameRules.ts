// 遊戲規則的純函式：輸入目前狀態，回傳要更新的欄位。store 的 action 只負責把它們組起來。
import { applyMove, applyMoves, createSolvedState, isSameMove, isSolved } from '../core';
import type { CubeSize, Move } from '../core/types';
import type { BestRecord, GameState } from './types';

/** 一局遊戲相關的欄位（尺寸、主題、最佳紀錄以外的全部） */
export type RoundState = Omit<GameState, 'size' | 'themeId' | 'bestRecords'>;

/** 完成狀態、還沒打亂的新一局 */
export function freshRound(size: CubeSize): RoundState {
  return {
    status: 'idle',
    cube: createSolvedState(size),
    scrambleMoves: [],
    history: [],
    moveCount: 0,
    startedAt: null,
    finalTimeMs: null,
    autoSolving: false,
    kociembaSteps: null,
    isNewBest: false,
  };
}

/** 打亂動畫或 Kociemba 還原動畫播放中：這段期間不接受玩家操作 */
export function isLocked(state: GameState): boolean {
  return state.status === 'scrambling' || state.autoSolving;
}

/** 一局進行中（打亂中、等第一步、計時中）：不能換尺寸、不能重新開始 */
export function isInGame(state: Pick<GameState, 'status'>): boolean {
  return state.status === 'scrambling' || state.status === 'ready' || state.status === 'solving';
}

/** 可以放棄的時候：打亂完、還沒在播還原動畫 */
export function canGiveUp(state: GameState): boolean {
  return (state.status === 'ready' || state.status === 'solving') && !state.autoSolving;
}

/** 時間比較快就算比較好；時間一樣就比步數 */
export function isBetterRecord(record: BestRecord, previous: BestRecord | null): boolean {
  if (!previous) return true;
  if (record.timeMs !== previous.timeMs) return record.timeMs < previous.timeMs;
  return record.moves < previous.moves;
}

/** 經過時間；還沒開始計時是 null */
function elapsedSince(state: GameState, now: number): number | null {
  return state.startedAt === null ? null : now - state.startedAt;
}

/** 完成時：停表、變成 solved，比較快就刷新最佳紀錄 */
export function completionPatch(state: GameState, now: number): Partial<GameState> {
  const finalTimeMs = elapsedSince(state, now);
  const record = finalTimeMs === null ? null : { timeMs: finalTimeMs, moves: state.moveCount };
  const isNewBest = record !== null && isBetterRecord(record, state.bestRecords[state.size]);
  return {
    status: 'solved',
    finalTimeMs,
    isNewBest,
    bestRecords: isNewBest ? { ...state.bestRecords, [state.size]: record } : state.bestRecords,
  };
}

/**
 * 關掉完成畫面後回到 idle。玩家自己解完：成績數字留著顯示，打亂和歷史清空；
 * Kociemba 解完的那一局：整個歸零（時間、步數都不是玩家的成績）。
 */
export function dismissPatch(state: GameState): Partial<GameState> {
  // 方塊保留 Kociemba 解完的樣子（可能整顆轉了方向），邏輯才會和畫面一致
  if (state.kociembaSteps !== null) return { ...freshRound(state.size), cube: state.cube };
  return { status: 'idle', scrambleMoves: [], history: [], isNewBest: false };
}

/** idle 時的自由轉動：不計時、不計步，也不留歷史（待機時沒有「上一步」） */
export function freePlayMove(state: GameState, move: Move): Partial<GameState> {
  return { status: 'idle', cube: applyMove(state.cube, move) };
}

/** 解法能不能把目前的方塊解完 */
export function solvesCube(state: GameState, solution: readonly Move[]): boolean {
  return solution.length > 0 && isSolved(applyMoves(state.cube, solution));
}

/**
 * 3×3 放棄、開始播 Kociemba 的解：方塊的邏輯狀態直接變成解完、清掉歷史，
 * 並把時間停在放棄的那一刻（startedAt 設成 null 讓計時器停下，顯示 finalTimeMs）。
 */
export function kociembaSolvePatch(state: GameState, solution: readonly Move[], now: number): Partial<GameState> {
  return {
    autoSolving: true,
    kociembaSteps: countSteps(solution),
    cube: applyMoves(state.cube, solution),
    history: [],
    ...stopClockPatch(state, now),
  };
}

/**
 * 停表：時間停在這一刻（startedAt 設成 null 讓計時器停下，顯示 finalTimeMs）。
 * 已經停過就保留原本的時間（放棄確認時先停表，等 Kociemba 算完再開始播動畫）。
 */
export function stopClockPatch(state: GameState, now: number): Pick<GameState, 'startedAt' | 'finalTimeMs'> {
  if (state.startedAt === null) return { startedAt: null, finalTimeMs: state.finalTimeMs };
  return { startedAt: null, finalTimeMs: elapsedSince(state, now) };
}

/** Kociemba 還原動畫播完：變成 solved（跳完成畫面），不列入最佳紀錄 */
export const KOCIEMBA_DONE_PATCH: Partial<GameState> = { status: 'solved', autoSolving: false, isNewBest: false };

/**
 * 用標準記號算步數：同一層連續兩次相同的 90°（也就是 180°，例如 R2）算一步。
 * 和 core 的 toNotation 合併方式一樣（兩兩合併），但不需要知道尺寸，2×2、4×4 的內層也能算。
 */
export function countSteps(moves: readonly Move[]): number {
  let steps = 0;
  for (let i = 0; i < moves.length; i++) {
    if (i + 1 < moves.length && isSameMove(moves[i], moves[i + 1])) i++;
    steps++;
  }
  return steps;
}

/** ready / solving 時的轉動：第一步開始計時，每一步都算步數，轉完檢查是否完成 */
export function timedMove(state: GameState, move: Move, now: number): Partial<GameState> {
  const next: GameState = {
    ...state,
    status: 'solving',
    cube: applyMove(state.cube, move),
    history: [...state.history, move],
    moveCount: state.moveCount + 1,
    startedAt: state.startedAt ?? now,
  };
  return withCompletion(next, now);
}

/** 如果方塊已經完成，就再加上完成的欄位 */
export function withCompletion(next: GameState, now: number): Partial<GameState> {
  return isSolved(next.cube) ? { ...next, ...completionPatch(next, now) } : next;
}
