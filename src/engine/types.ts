import type { CubeState, Move } from '../core/types';
import type { Theme } from '../themes/types';

/** 各種情境下每一步（90°）的動畫時間，單位毫秒 */
export const MOVE_DURATION = { user: 180, scramble: 70, solve: 150, undo: 150 } as const;

export interface CubeEngineOptions {
  /** engine 會把 canvas 放進這個元素，並用 ResizeObserver 跟著它的大小 */
  container: HTMLElement;
  size: number;
  theme: Theme;
  /**
   * 玩家用拖曳或鍵盤轉動一層時呼叫。在轉動「確定」的當下呼叫一次（動畫剛開始），
   * engine 會自己播放動畫，外部只需要更新遊戲邏輯。
   */
  onUserMove?: (move: Move) => void;
}

export interface EnqueueOptions {
  /** 每一步的動畫時間（毫秒） */
  durationMs: number;
}

/** engine 對外的介面。React 那一層只透過這個介面操作 3D 方塊。 */
export interface CubeEngine {
  /** 換尺寸：重建方塊並回到完成狀態，同時清空動畫佇列 */
  setSize(size: number): void;
  /** 不播動畫，直接把畫面設成指定狀態（清空動畫佇列） */
  setState(state: CubeState): void;
  /** 換主題：只換材質、燈光、背景，不重建幾何 */
  setTheme(theme: Theme): void;
  /** 把轉動排進動畫佇列。這批轉動全部播完時 resolve；佇列被清空時也會 resolve。 */
  enqueueMoves(moves: readonly Move[], options: EnqueueOptions): Promise<void>;
  /** 佇列裡所有動畫都播完時 resolve（沒有動畫時立刻 resolve） */
  whenIdle(): Promise<void>;
  /** 是否正在播動畫或佇列裡還有轉動 */
  isBusy(): boolean;
  /** 開關玩家輸入（拖曳轉層、鍵盤）。關掉時仍然可以旋轉視角。 */
  setInputEnabled(enabled: boolean): void;
  /** 把視角轉回預設角度 */
  resetView(): void;
  /** 釋放 WebGL 資源、移除事件監聽和 canvas */
  dispose(): void;
}

export type CreateCubeEngine = (options: CubeEngineOptions) => CubeEngine;
