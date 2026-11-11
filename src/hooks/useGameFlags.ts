import { canGiveUp, isInGame, isLocked } from '../store/gameRules';
import { useGameStore } from '../store/useGameStore';
import { useUiStore } from '../store/useUiStore';

/** 工具列要顯示哪些按鈕、能不能按 */
export interface GameFlags {
  /** 一局進行中（打亂中、等第一步、計時中）：顯示「上一步」「放棄」，尺寸切換鎖住 */
  inGame: boolean;
  /** 打亂動畫、放棄的還原動畫播放中，或正在算解法：所有遊戲按鈕停用 */
  busy: boolean;
  canStart: boolean;
  canUndo: boolean;
  canGiveUp: boolean;
  /** 尺寸切換鎖住（一局進行中或忙碌中） */
  sizeLocked: boolean;
}

export function useGameFlags(): GameFlags {
  const inGame = useGameStore(isInGame);
  const locked = useGameStore(isLocked);
  const giveUpAllowed = useGameStore(canGiveUp);
  const computing = useUiStore((s) => s.computingSolution);
  const hasHistory = useGameStore((s) => s.status === 'solving' && s.history.length > 0);
  const busy = locked || computing;
  return {
    inGame,
    busy,
    canStart: !inGame && !busy,
    canUndo: !busy && hasHistory,
    canGiveUp: !busy && giveUpAllowed,
    sizeLocked: inGame || busy,
  };
}
