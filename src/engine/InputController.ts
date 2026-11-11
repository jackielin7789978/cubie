// 玩家輸入：Pointer Events（滑鼠＋觸控同一套）和鍵盤。
// 按在方塊上拖曳 → 轉一層；按在空白處拖曳 → 旋轉視角。
import type { Move } from '../core/types';
import { dragToMove, keyToMove } from './gesture';
import type { FaceHit, Projector } from './gesture';

/** InputController 需要外部提供的能力 */
export interface InputTarget {
  canvas: HTMLCanvasElement;
  /** 是否監聽鍵盤（只給測試和開發頁用） */
  keyboard: boolean;
  pickFace(clientX: number, clientY: number): FaceHit | null;
  project: Projector;
  cubeSize(): number;
  onLayerMove(move: Move): void;
  /** 旋轉視角，單位是像素 */
  onOrbit(dx: number, dy: number): void;
}

/** 拖曳超過這個距離（像素）才算數 */
const DRAG_THRESHOLD = 10;

type DragMode = 'layer' | 'orbit' | 'done';

interface ActiveDrag {
  pointerId: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  mode: DragMode;
  hit: FaceHit | null;
}

/** 焦點在這些元素上時，鍵盤留給它們用 */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(target.tagName);
}

export class InputController {
  private enabled = true;
  private drag: ActiveDrag | null = null;

  constructor(private readonly target: InputTarget) {
    const { canvas } = target;
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerEnd);
    canvas.addEventListener('pointercancel', this.onPointerEnd);
    canvas.addEventListener('lostpointercapture', this.onPointerEnd);
    if (target.keyboard) window.addEventListener('keydown', this.onKeyDown);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    // 不能轉層時先收起手掌游標，下次滑鼠移動會重新判斷
    if (!enabled && !this.drag) this.setCursor('default');
  }

  dispose(): void {
    const { canvas } = this.target;
    canvas.removeEventListener('pointerdown', this.onPointerDown);
    canvas.removeEventListener('pointermove', this.onPointerMove);
    canvas.removeEventListener('pointerup', this.onPointerEnd);
    canvas.removeEventListener('pointercancel', this.onPointerEnd);
    canvas.removeEventListener('lostpointercapture', this.onPointerEnd);
    window.removeEventListener('keydown', this.onKeyDown);
    this.drag = null;
  }

  private onPointerDown = (e: PointerEvent): void => {
    // 多指觸控：只處理第一根手指
    if (this.drag || !e.isPrimary) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    const hit = this.enabled ? this.target.pickFace(e.clientX, e.clientY) : null;
    this.drag = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      lastX: e.clientX,
      lastY: e.clientY,
      mode: hit ? 'layer' : 'orbit',
      hit,
    };
    this.setCursor(hit ? 'grabbing' : 'move');
    // 指標拖出 canvas 外也能繼續收到事件；模擬的事件可能沒有真正的 pointer，失敗就算了
    try {
      this.target.canvas.setPointerCapture(e.pointerId);
    } catch {
      /* 忽略 */
    }
  };

  private onPointerMove = (e: PointerEvent): void => {
    const drag = this.drag;
    if (!drag) return this.updateHoverCursor(e);
    if (e.pointerId !== drag.pointerId) return;
    if (drag.mode === 'orbit') this.target.onOrbit(e.clientX - drag.lastX, e.clientY - drag.lastY);
    else if (drag.mode === 'layer') this.tryLayerMove(drag, e);
    drag.lastX = e.clientX;
    drag.lastY = e.clientY;
  };

  private onPointerEnd = (e: PointerEvent): void => {
    if (!this.drag || e.pointerId !== this.drag.pointerId) return;
    this.drag = null;
    this.updateHoverCursor(e);
    try {
      if (this.target.canvas.hasPointerCapture(e.pointerId)) this.target.canvas.releasePointerCapture(e.pointerId);
    } catch {
      /* 忽略 */
    }
  };

  /**
   * 滑鼠游標提示：移到可以轉的方塊上變成「手掌」，按住時變成「抓住」；
   * 空白處維持一般游標，拖曳旋轉視角時變成移動符號。觸控沒有游標，直接略過。
   */
  private updateHoverCursor(e: PointerEvent): void {
    if (e.pointerType !== 'mouse') return;
    const overCube = this.enabled && this.target.pickFace(e.clientX, e.clientY) !== null;
    this.setCursor(overCube ? 'grab' : 'default');
  }

  private setCursor(cursor: 'default' | 'grab' | 'grabbing' | 'move'): void {
    const { style } = this.target.canvas;
    if (style.cursor !== cursor) style.cursor = cursor;
  }

  /** 拖曳超過門檻時決定轉哪一層；一次拖曳只觸發一步 */
  private tryLayerMove(drag: ActiveDrag, e: PointerEvent): void {
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (Math.hypot(dx, dy) < DRAG_THRESHOLD || !drag.hit) return;
    drag.mode = 'done';
    if (!this.enabled) return;
    this.target.onLayerMove(dragToMove(drag.hit, { x: dx, y: dy }, this.target.project));
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (!this.enabled || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    if (isTypingTarget(e.target)) return;
    const move = keyToMove(e.key, e.shiftKey, this.target.cubeSize());
    if (!move) return;
    e.preventDefault();
    this.target.onLayerMove(move);
  };
}
