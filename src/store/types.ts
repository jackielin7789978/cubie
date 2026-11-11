import type { CubeSize, CubeState, Move } from '../core/types';
import type { ThemeId } from '../themes/types';

/** idle → scrambling → ready → solving → solved */
export type GameStatus = 'idle' | 'scrambling' | 'ready' | 'solving' | 'solved';

export interface BestRecord {
  timeMs: number;
  moves: number;
}

export interface GameState {
  size: CubeSize;
  themeId: ThemeId;
  status: GameStatus;
  /** 方塊的邏輯狀態（畫面由 engine 另外負責，兩邊靠同一串 Move 保持一致） */
  cube: CubeState;
  /** 這一局的打亂序列（不能被「上一步」撤銷） */
  scrambleMoves: readonly Move[];
  /** 玩家目前還留在方塊上的轉動（「上一步」會 pop） */
  history: readonly Move[];
  /** 步數。「上一步」也算一步。 */
  moveCount: number;
  /** 開始計時的時間（performance.now()）；還沒開始是 null */
  startedAt: number | null;
  /** 完成時的總時間；還沒完成是 null */
  finalTimeMs: number | null;
  /** 正在播放自動還原動畫 */
  autoSolving: boolean;
  /** 這一局是否用了自動還原（用了就不列入最佳紀錄） */
  usedAutoSolve: boolean;
  /** 這一局是否刷新了最佳紀錄 */
  isNewBest: boolean;
  bestRecords: Record<CubeSize, BestRecord | null>;
}

/**
 * store 的 action 只處理遊戲邏輯，不碰 engine。
 * 需要播動畫的 action 會回傳要播的 Move，由呼叫的人交給 engine。
 */
export interface GameActions {
  /** 換尺寸並重設成完成狀態 */
  setSize(size: CubeSize): void;
  setTheme(themeId: ThemeId): void;
  /** 開始打亂：重設方塊、產生打亂序列並套用，狀態變成 scrambling。回傳要播放的序列。 */
  beginScramble(): Move[];
  /** 打亂動畫播完：scrambling → ready */
  finishScramble(): void;
  /** 玩家轉了一步。ready 時會開始計時；轉完如果完成就停止計時並變成 solved。 */
  applyUserMove(move: Move, now?: number): void;
  /** 上一步：回傳要播放的反向轉動；沒有可以復原的就回傳 null */
  undo(now?: number): Move | null;
  /** 開始自動還原：回傳要播放的還原序列（可以傳入外部解法器算好的解） */
  beginAutoSolve(solution?: readonly Move[]): Move[];
  /** 自動還原動畫播完 */
  finishAutoSolve(now?: number): void;
  /** 關掉完成畫面，回到 idle（方塊維持完成狀態） */
  dismissSolved(): void;
}

export type GameStore = GameState & GameActions;

export const STORAGE_KEYS = { theme: 'cubie:theme', size: 'cubie:size', best: 'cubie:best' } as const;
