import { create } from 'zustand';
import type { StateCreator } from 'zustand';
import { createStore } from 'zustand/vanilla';

/** 只跟畫面有關、不屬於遊戲規則的狀態 */
export interface UiStore {
  /** 完成畫面是否打開（玩家轉完後要等動畫播完才打開，所以和 status 分開） */
  solvedModalOpen: boolean;
  /** 正在等外部解法器（例如 Kociemba）算解法 */
  computingSolution: boolean;
  openSolvedModal(): void;
  closeSolvedModal(): void;
  setComputingSolution(value: boolean): void;
}

const uiStoreCreator: StateCreator<UiStore> = (set) => ({
  solvedModalOpen: false,
  computingSolution: false,
  openSolvedModal: () => set({ solvedModalOpen: true }),
  closeSolvedModal: () => set({ solvedModalOpen: false }),
  setComputingSolution: (value) => set({ computingSolution: value }),
});

/** 不經過 React 的獨立 store，給測試用 */
export const createUiStore = () => createStore<UiStore>()(uiStoreCreator);

export const useUiStore = create<UiStore>()(uiStoreCreator);
