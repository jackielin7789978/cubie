import type { CubeSize, CubeState, Move } from '../core/types';
import type { ThemeId } from '../themes/types';

/**
 * idle → scrambling → ready → solving → solved
 * idle：待機（方塊是完成狀態，可以自由轉著玩、可以換尺寸）。
 * scrambling／ready／solving：一局進行中（不能換尺寸、不能重新打亂，只能「上一步」或「放棄」）。
 * solved：方塊解完，顯示完成畫面（玩家自己解完，或 3×3 放棄後 Kociemba 還原播完；後者不列入紀錄）。
 */
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
  /** 正在播放 3×3 放棄後的 Kociemba 還原動畫 */
  autoSolving: boolean;
  /**
   * 3×3 放棄後 Kociemba 用了幾步（標準記號，180° 算一步）；完成畫面用它顯示文案，也代表這局不列入紀錄。
   * 玩家自己解完或還沒放棄是 null。
   */
  kociembaSteps: number | null;
  /** 這一局是否刷新了最佳紀錄 */
  isNewBest: boolean;
  bestRecords: Record<CubeSize, BestRecord | null>;
}

/**
 * store 的 action 只處理遊戲邏輯，不碰 engine。
 * 需要播動畫的 action 會回傳要播的 Move，由呼叫的人交給 engine。
 */
export interface GameActions {
  /** 換尺寸並重設成完成狀態。一局進行中（scrambling／ready／solving）會被拒絕。 */
  setSize(size: CubeSize): void;
  /** 換主題，隨時都可以 */
  setTheme(themeId: ThemeId): void;
  /**
   * 開始遊戲：重設方塊、產生打亂序列並套用，狀態變成 scrambling。回傳要播放的打亂序列。
   * 只有 idle 或 solved 時可以開始；一局進行中回傳空陣列。
   */
  startGame(): Move[];
  /** 打亂動畫播完：scrambling → ready（第一次轉動才開始計時） */
  finishScramble(): void;
  /**
   * 玩家轉了一步。ready 時會開始計時；轉完如果完成就停止計時並變成 solved。
   * idle 時是自由轉動：不計時、不計步。
   */
  applyUserMove(move: Move, now?: number): void;
  /** 上一步（只有計時中可以用）：回傳要播放的反向轉動；沒有可以復原的就回傳 null */
  undo(now?: number): Move | null;
  /**
   * 放棄並直接重設（2×2、4×4，或 3×3 解法器失敗時）：方塊變回完成狀態、回到 idle，
   * 時間、步數歸零，不列入紀錄。只有 ready／solving 時有效。
   */
  abandonGame(): void;
  /**
   * 3×3 放棄、交給 Kociemba：解法真的能把方塊解完才接受，停表並回傳要播放的序列；
   * 不能放棄或解法不對時回傳空陣列（呼叫的人改用 abandonGame）。
   */
  beginKociembaSolve(solution: readonly Move[], now?: number): Move[];
  /** Kociemba 還原動畫播完：變成 solved（顯示完成畫面），但不列入最佳紀錄 */
  finishKociembaSolve(): void;
  /**
   * 關掉完成畫面，回到 idle（方塊維持完成狀態）。
   * 玩家自己解完時成績數字留著顯示；Kociemba 解完的那一局時間、步數歸零。
   */
  dismissSolved(): void;
}

export type GameStore = GameState & GameActions;

export const STORAGE_KEYS = { theme: 'cubie:theme', size: 'cubie:size', best: 'cubie:best' } as const;
