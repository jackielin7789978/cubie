import { Vector3 } from 'three';
import type { CubeState, Move } from '../core/types';
import type { Theme } from '../themes/types';
import type { ScreenPoint } from './gesture';
import { CubeRenderer } from './CubeRenderer';
import { InputController } from './InputController';
import { MoveAnimator } from './MoveAnimator';
import { ThemeApplier } from './ThemeApplier';
import { MOVE_DURATION } from './types';
import type { CreateCubeEngine, CubeEngine, CubeEngineOptions, EnqueueOptions } from './types';

export * from './types';

/** 拖曳空白處時，每像素轉多少弧度 */
const ORBIT_SPEED = 0.008;
/** 兩幀間隔超過這個值（例如分頁切到背景再回來）就不拿來判斷效能 */
const MAX_MEASURED_FRAME_MS = 1000;

/** 除錯用：不在 CubeEngine 介面裡，只給 dev 頁面和 e2e 測試用 */
export interface CubeEngineDebug {
  /** 從畫面上的小方塊反推目前狀態 */
  readVisualState(): CubeState;
  isBloomActive(): boolean;
  /** 方塊座標 → 螢幕座標（clientX/Y），讓測試知道某張貼紙畫在哪裡 */
  projectToScreen(x: number, y: number, z: number): ScreenPoint;
}

class Engine implements CubeEngine, CubeEngineDebug {
  private readonly renderer: CubeRenderer;
  private readonly animator: MoveAnimator;
  private readonly themes: ThemeApplier;
  private readonly input: InputController;
  private lastFrameTime: number | null = null;
  private disposed = false;

  constructor(private readonly options: CubeEngineOptions) {
    this.renderer = new CubeRenderer(options.container, options.size);
    this.animator = new MoveAnimator(this.renderer.model);
    this.themes = new ThemeApplier(this.renderer, options.container);
    this.themes.apply(options.theme);
    this.renderer.setFrameHandler(this.onFrame);
    this.input = new InputController({
      canvas: this.renderer.canvas,
      pickFace: (x, y) => this.renderer.pickFace(x, y),
      project: this.renderer.projectToScreen,
      cubeSize: () => this.renderer.model.size,
      onLayerMove: (move) => this.playUserMove(move),
      onOrbit: (dx, dy) => this.orbit(dx, dy),
    });
    this.renderer.requestRender();
  }

  setSize(size: number): void {
    this.animator.clear();
    this.renderer.model.rebuild(size);
    this.renderer.refit();
    this.renderer.requestRender();
  }

  setState(state: CubeState): void {
    this.animator.clear();
    const sizeChanged = state.size !== this.renderer.model.size;
    this.renderer.model.setState(state);
    if (sizeChanged) this.renderer.refit();
    this.renderer.requestRender();
  }

  setTheme(theme: Theme): void {
    this.themes.apply(theme);
  }

  enqueueMoves(moves: readonly Move[], options: EnqueueOptions): Promise<void> {
    if (this.disposed) return Promise.resolve();
    const done = this.animator.enqueue(moves, options.durationMs);
    this.renderer.requestRender();
    return done;
  }

  whenIdle(): Promise<void> {
    return this.animator.whenIdle();
  }

  isBusy(): boolean {
    return this.animator.isBusy();
  }

  setInputEnabled(enabled: boolean): void {
    this.input.setEnabled(enabled);
  }

  resetView(): void {
    this.renderer.cameraRig.reset();
    this.renderer.requestRender();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.animator.clear();
    this.input.dispose();
    this.themes.dispose();
    this.renderer.dispose();
  }

  readVisualState(): CubeState {
    return this.renderer.model.readState();
  }

  isBloomActive(): boolean {
    return this.themes.isBloomActive();
  }

  projectToScreen(x: number, y: number, z: number): ScreenPoint {
    return this.renderer.projectToScreen(new Vector3(x, y, z));
  }

  /** 玩家轉動：先通知外部更新遊戲邏輯，再排進動畫佇列（動畫中也不丟掉） */
  private playUserMove(move: Move): void {
    this.options.onUserMove?.(move);
    void this.enqueueMoves([move], { durationMs: MOVE_DURATION.user });
  }

  private orbit(dx: number, dy: number): void {
    this.renderer.cameraRig.rotateBy(-dx * ORBIT_SPEED, dy * ORBIT_SPEED);
    this.renderer.requestRender();
  }

  private onFrame = (now: number): boolean => {
    const animating = this.animator.update(now);
    this.measureFrame(now, animating);
    return animating;
  };

  /** 只在連續動畫期間量兩幀的間隔，交給 ThemeApplier 判斷要不要關 bloom */
  private measureFrame(now: number, animating: boolean): void {
    const delta = this.lastFrameTime === null ? null : now - this.lastFrameTime;
    if (delta !== null && delta < MAX_MEASURED_FRAME_MS) this.themes.reportFrameTime(delta);
    this.lastFrameTime = animating ? now : null;
  }
}

export const createCubeEngine: CreateCubeEngine = (options) => new Engine(options);
