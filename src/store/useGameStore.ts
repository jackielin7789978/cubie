import { create } from 'zustand';
import type { StateCreator } from 'zustand';
import { createStore } from 'zustand/vanilla';
import { applyMove, applyMoves, createSolvedState, generateScramble, invertMove } from '../core';
import type { Move } from '../core/types';
import {
  canGiveUp,
  dismissPatch,
  freePlayMove,
  freshRound,
  isInGame,
  isLocked,
  KOCIEMBA_DONE_PATCH,
  kociembaSolvePatch,
  solvesCube,
  timedMove,
  withCompletion,
} from './gameRules';
import { getBrowserStorage, loadPreferences, writeJson } from './persistence';
import type { KeyValueStorage } from './persistence';
import { STORAGE_KEYS } from './types';
import type { GameState, GameStore } from './types';

/** store 需要的外部依賴。測試時可以換成假的 storage、時間和打亂序列。 */
export interface GameStoreDeps {
  storage: KeyValueStorage | null;
  now: () => number;
  scramble: (size: number) => Move[];
}

const defaultDeps = (): GameStoreDeps => ({
  storage: getBrowserStorage(),
  now: () => performance.now(),
  scramble: (size) => generateScramble(size),
});

/**
 * 建立 store 的內容（狀態＋action）。
 * Zustand 的 store 就是「一份狀態＋改狀態的函式」：set() 更新狀態，get() 讀目前的狀態；
 * 有元件讀到的欄位變了，那個元件才會重新畫。
 */
export function gameStoreCreator(deps: GameStoreDeps = defaultDeps()): StateCreator<GameStore> {
  return (set, get) => {
    const prefs = loadPreferences(deps.storage);
    const saveBestIfNew = (state: GameState) => {
      if (state.isNewBest) writeJson(deps.storage, STORAGE_KEYS.best, state.bestRecords);
    };

    return {
      ...prefs,
      ...freshRound(prefs.size),

      setSize(size) {
        if (isInGame(get())) return;
        set({ size, ...freshRound(size) });
        writeJson(deps.storage, STORAGE_KEYS.size, size);
      },

      setTheme(themeId) {
        set({ themeId });
        writeJson(deps.storage, STORAGE_KEYS.theme, themeId);
      },

      startGame() {
        const state = get();
        if (isInGame(state) || isLocked(state)) return [];
        const moves = deps.scramble(state.size);
        const cube = applyMoves(createSolvedState(state.size), moves);
        set({ ...freshRound(state.size), status: 'scrambling', cube, scrambleMoves: moves });
        return moves;
      },

      finishScramble() {
        if (get().status === 'scrambling') set({ status: 'ready' });
      },

      applyUserMove(move, now = deps.now()) {
        const current = get();
        if (isLocked(current)) return;
        const state = current.status === 'solved' ? { ...current, ...dismissPatch(current) } : current;
        const timed = state.status === 'ready' || state.status === 'solving';
        set(timed ? timedMove(state, move, now) : freePlayMove(state, move));
        saveBestIfNew(get());
      },

      undo(now = deps.now()) {
        const state = get();
        const last = state.history[state.history.length - 1];
        if (isLocked(state) || state.status !== 'solving' || !last) return null;
        const move = invertMove(last);
        const next = { ...state, cube: applyMove(state.cube, move), history: state.history.slice(0, -1) };
        // SPEC：計時中按「上一步」也算一步，避免靠上一步刷成績
        set(withCompletion({ ...next, moveCount: state.moveCount + 1 }, now));
        saveBestIfNew(get());
        return move;
      },

      abandonGame() {
        const state = get();
        if (canGiveUp(state)) set(freshRound(state.size));
      },

      beginKociembaSolve(solution, now = deps.now()) {
        const state = get();
        if (!canGiveUp(state) || !solvesCube(state, solution)) return [];
        set(kociembaSolvePatch(state, solution, now));
        return [...solution];
      },

      finishKociembaSolve() {
        if (get().autoSolving) set(KOCIEMBA_DONE_PATCH);
      },

      dismissSolved() {
        const state = get();
        if (state.status === 'solved') set(dismissPatch(state));
      },
    };
  };
}

/** 不經過 React 的獨立 store，給測試或其他非 React 程式用 */
export function createGameStore(deps?: Partial<GameStoreDeps>) {
  return createStore<GameStore>()(gameStoreCreator({ ...defaultDeps(), ...deps }));
}

/**
 * 整個 App 共用的遊戲 store。元件裡用 `useGameStore((s) => s.moveCount)` 這種寫法（selector）
 * 只訂閱自己需要的欄位，其他欄位變動時不會重新畫，比較省效能。
 * 在 React 外面也可以用 `useGameStore.getState()` 直接讀寫。
 */
export const useGameStore = create<GameStore>()(gameStoreCreator());
