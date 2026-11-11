import type { CubeState, Move } from '../core/types';

/** 3×3 Kociemba 解法器的對外介面。實際運算在 Web Worker 裡，不會卡住畫面。 */
export interface KociembaClient {
  /** 在背景建表（約數秒）。可以重複呼叫，只會初始化一次。 */
  init(): Promise<void>;
  isReady(): boolean;
  /** 解任意 3×3 狀態，回傳把它還原的轉動序列（每個 Move 是 90°，180° 會拆成兩步） */
  solve(state: CubeState): Promise<Move[]>;
  dispose(): void;
}
