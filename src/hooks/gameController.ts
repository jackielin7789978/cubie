// 把遊戲 store 和 3D engine 接起來的控制器。這個檔案是一般的 TypeScript class，不依賴 React，
// React 元件透過 useGameController() 取得同一個實例。
import type { StoreApi } from 'zustand';
import { createSolvedState } from '../core';
import type { CubeSize, CubeState, Move } from '../core/types';
import { MOVE_DURATION } from '../engine/types';
import type { CubeEngine } from '../engine/types';
import { canGiveUp, isInGame, isLocked } from '../store/gameRules';
import type { GameStore } from '../store/types';
import type { UiStore } from '../store/useUiStore';
import { THEMES } from '../themes';
import type { ThemeId } from '../themes/types';

/**
 * 外部解法器（3×3 Kociemba）。回傳 null 代表「這個狀態我不處理」（例如 2×2、4×4），
 * 這時放棄就直接重設方塊。
 */
export type SolutionProvider = (state: CubeState) => Promise<Move[]> | null;

declare global {
  interface Window {
    /** 給 e2e 測試和除錯用 */
    __cubie?: { store: StoreApi<GameStore>; ui: StoreApi<UiStore>; engine: CubeEngine | null; controller: GameController };
  }
}

export class GameController {
  private engine: CubeEngine | null = null;
  private unsubscribers: Array<() => void> = [];
  /** 每次開始遊戲、換尺寸、放棄都 +1；非同步流程結束時比對，過期的就不再改狀態 */
  private round = 0;
  private solutionProvider: SolutionProvider | null = null;
  private readonly game: StoreApi<GameStore>;
  private readonly ui: StoreApi<UiStore>;

  constructor(game: StoreApi<GameStore>, ui: StoreApi<UiStore>) {
    this.game = game;
    this.ui = ui;
  }

  setSolutionProvider(provider: SolutionProvider | null): void {
    this.solutionProvider = provider;
  }

  /** engine 建好後呼叫：同步畫面、開始監聽 store */
  attachEngine(engine: CubeEngine): void {
    this.detachEngine();
    this.engine = engine;
    engine.setState(this.game.getState().cube);
    this.syncInput();
    this.unsubscribers = [
      this.game.subscribe((state, prev) => this.syncEngine(state, prev)),
      this.ui.subscribe(() => this.syncInput()),
    ];
    this.expose();
  }

  /** engine 要被釋放前呼叫 */
  detachEngine(engine?: CubeEngine): void {
    if (engine && engine !== this.engine) return;
    this.unsubscribers.forEach((unsubscribe) => unsubscribe());
    this.unsubscribers = [];
    this.engine = null;
    this.expose();
  }

  /** engine 的 onUserMove：玩家拖曳或鍵盤轉了一層 */
  readonly handleUserMove = (move: Move): void => {
    this.game.getState().applyUserMove(move);
    void this.openModalWhenSolved();
  };

  /** 開始遊戲：重設方塊、播打亂動畫，播完進入 ready */
  async startGame(): Promise<void> {
    const moves = this.game.getState().startGame();
    if (moves.length === 0) return;
    const round = ++this.round;
    this.ui.getState().closeSolvedModal();
    if (this.engine) {
      this.engine.setState(createSolvedState(this.game.getState().size));
      await this.engine.enqueueMoves(moves, { durationMs: MOVE_DURATION.scramble });
    }
    if (round === this.round) this.game.getState().finishScramble();
  }

  undo(): void {
    const move = this.game.getState().undo();
    if (!move) return;
    void this.engine?.enqueueMoves([move], { durationMs: MOVE_DURATION.undo });
    void this.openModalWhenSolved();
  }

  /**
   * 放棄這一局。3×3：請 Kociemba 解法器算解、播還原動畫，播完打開完成畫面（不列入紀錄）。
   * 2×2、4×4（沒有解法器），或解法器失敗、逾時：直接把方塊重設成完成狀態、回到待機。
   */
  async giveUp(): Promise<void> {
    if (this.ui.getState().computingSolution || !canGiveUp(this.game.getState())) return;
    const round = ++this.round;
    this.game.getState().stopClock();
    const solution = await this.computeSolution(this.game.getState().cube);
    if (round !== this.round) return;
    const moves = solution ? this.game.getState().beginKociembaSolve(solution) : [];
    if (moves.length === 0) return this.abandon();
    await this.engine?.enqueueMoves(moves, { durationMs: MOVE_DURATION.solve });
    this.game.getState().finishKociembaSolve();
    if (round === this.round && this.game.getState().status === 'solved') this.ui.getState().openSolvedModal();
  }

  /** 換尺寸：一局進行中不能換（要先放棄） */
  setSize(size: CubeSize): void {
    if (isInGame(this.game.getState()) || isLocked(this.game.getState())) return;
    this.round++;
    this.ui.getState().closeSolvedModal();
    this.game.getState().setSize(size);
  }

  setTheme(themeId: ThemeId): void {
    this.game.getState().setTheme(themeId);
  }

  closeSolvedModal(): void {
    this.ui.getState().closeSolvedModal();
    this.game.getState().dismissSolved();
    // 保險：關掉後畫面一律對齊邏輯狀態（例如 Kociemba 解完整顆轉了方向）
    this.engine?.setState(this.game.getState().cube);
  }

  /** 完成畫面的「再玩一次」：直接開始下一局 */
  playAgain(): void {
    this.closeSolvedModal();
    void this.startGame();
  }

  /** 直接放棄：邏輯和畫面一起重設成完成狀態（沒有動畫） */
  private abandon(): void {
    this.game.getState().abandonGame();
    this.engine?.setState(this.game.getState().cube);
  }

  /** 玩家轉完剛好完成：等最後一步的動畫播完再打開完成畫面 */
  private async openModalWhenSolved(): Promise<void> {
    if (this.game.getState().status !== 'solved') return;
    const round = this.round;
    await this.engine?.whenIdle();
    if (round === this.round && this.game.getState().status === 'solved') this.ui.getState().openSolvedModal();
  }

  /** 問外部解法器要解法；沒有解法器、不處理這個狀態、出錯或逾時都回傳 null */
  private async computeSolution(cube: CubeState): Promise<Move[] | null> {
    if (!this.solutionProvider) return null;
    this.ui.getState().setComputingSolution(true);
    try {
      return (await this.solutionProvider(cube)) ?? null;
    } catch (error) {
      console.warn('外部解法器失敗，改成直接重設', error);
      return null;
    } finally {
      this.ui.getState().setComputingSolution(false);
    }
  }

  private syncEngine(state: GameStore, prev: GameStore): void {
    if (!this.engine) return;
    if (state.size !== prev.size) this.engine.setSize(state.size);
    if (state.themeId !== prev.themeId) this.engine.setTheme(THEMES[state.themeId]);
    if (isLocked(state) !== isLocked(prev) || state.status !== prev.status) this.syncInput();
  }

  /**
   * 打亂、Kociemba 還原動畫、等解法、解完到完成畫面關掉之前都關掉玩家輸入（仍然可以旋轉視角）。
   * store 的 subscribe 是同步的：玩家轉完最後一步的當下（engine 還在 onUserMove 裡）就會關掉，
   * 後面再按的鍵或拖曳不會讓畫面多轉一步。
   */
  private syncInput(): void {
    const ui = this.ui.getState();
    const game = this.game.getState();
    const busy = isLocked(game) || game.status === 'solved' || ui.computingSolution || ui.solvedModalOpen;
    this.engine?.setInputEnabled(!busy);
  }

  private expose(): void {
    if (typeof window === 'undefined') return;
    window.__cubie = { store: this.game, ui: this.ui, engine: this.engine, controller: this };
  }
}
