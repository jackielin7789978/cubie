// 遊戲規則的純函式：輸入目前狀態，回傳要更新的欄位。store 的 action 只負責把它們組起來。
import { applyMove, applyMoves, createSolvedState, isSolved, reverseSolve } from '../core';
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
    usedAutoSolve: false,
    isNewBest: false,
  };
}

/** 打亂動畫或自動還原動畫播放中：這段期間不接受玩家操作 */
export function isLocked(state: GameState): boolean {
  return state.status === 'scrambling' || state.autoSolving;
}

/** 時間比較快就算比較好；時間一樣就比步數 */
export function isBetterRecord(record: BestRecord, previous: BestRecord | null): boolean {
  if (!previous) return true;
  if (record.timeMs !== previous.timeMs) return record.timeMs < previous.timeMs;
  return record.moves < previous.moves;
}

/** 完成時：停表、變成 solved，沒用過自動還原又比較快就刷新最佳紀錄 */
export function completionPatch(state: GameState, now: number): Partial<GameState> {
  const finalTimeMs = state.startedAt === null ? null : now - state.startedAt;
  const record = finalTimeMs === null || state.usedAutoSolve ? null : { timeMs: finalTimeMs, moves: state.moveCount };
  const isNewBest = record !== null && isBetterRecord(record, state.bestRecords[state.size]);
  return {
    status: 'solved',
    finalTimeMs,
    isNewBest,
    bestRecords: isNewBest ? { ...state.bestRecords, [state.size]: record } : state.bestRecords,
  };
}

/** 關掉完成畫面後回到自由轉動；成績數字留著顯示，打亂和歷史清空 */
export const DISMISS_PATCH: Partial<GameState> = { status: 'idle', scrambleMoves: [], history: [], isNewBest: false };

/** idle（或剛完成）時的自由轉動：不計時、不計步，但可以用「上一步」撤銷 */
export function freePlayMove(state: GameState, move: Move): Partial<GameState> {
  return { status: 'idle', cube: applyMove(state.cube, move), history: [...state.history, move] };
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

/** 決定自動還原要播的序列：外部解法能把方塊解完就用它，否則反轉歷史 */
export function chooseSolution(state: GameState, solution?: readonly Move[]): Move[] {
  if (solution && isSolved(applyMoves(state.cube, solution))) return [...solution];
  return reverseSolve([...state.scrambleMoves, ...state.history]);
}
