import { isSolved } from '../core';
import { isLocked } from '../store/gameRules';
import { useGameStore } from '../store/useGameStore';
import { useUiStore } from '../store/useUiStore';

/** 按鈕能不能按 */
export interface GameFlags {
  /** 打亂、自動還原動畫中，或正在算解法 */
  busy: boolean;
  canUndo: boolean;
  canAutoSolve: boolean;
}

export function useGameFlags(): GameFlags {
  const locked = useGameStore(isLocked);
  const computing = useUiStore((s) => s.computingSolution);
  const hasHistory = useGameStore((s) => s.history.length > 0 && s.status !== 'solved');
  const solved = useGameStore((s) => isSolved(s.cube));
  const busy = locked || computing;
  return { busy, canUndo: !busy && hasHistory, canAutoSolve: !busy && !solved };
}
