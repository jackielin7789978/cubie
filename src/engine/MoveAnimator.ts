// 轉動動畫佇列：依序播放，每一步把該層小方塊掛到 pivot 上旋轉，結束後放回並校正。
import type * as THREE from 'three';
import type { Move } from '../core/types';
import type { CubeModel } from './CubeModel';

interface Batch {
  remaining: number;
  resolve: () => void;
}

interface QueuedMove {
  move: Move;
  durationMs: number;
  batch: Batch;
}

interface ActiveStep extends QueuedMove {
  startTime: number;
  objects: THREE.Object3D[];
}

/** ease-out（三次方）：開始快、結束慢 */
export function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

export class MoveAnimator {
  private queue: QueuedMove[] = [];
  private active: ActiveStep | null = null;
  /** 上一步剛好結束的時間；同一幀內接著播下一步時，從這裡開始算，背景分頁回來時能正確追上進度 */
  private carryStart: number | null = null;
  private idleResolvers: (() => void)[] = [];
  private pendingBatches = new Set<Batch>();

  constructor(private readonly model: CubeModel) {}

  enqueue(moves: readonly Move[], durationMs: number): Promise<void> {
    if (moves.length === 0) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const batch: Batch = { remaining: moves.length, resolve };
      this.pendingBatches.add(batch);
      for (const move of moves) this.queue.push({ move, durationMs, batch });
    });
  }

  isBusy(): boolean {
    return this.active !== null || this.queue.length > 0;
  }

  whenIdle(): Promise<void> {
    if (!this.isBusy()) return Promise.resolve();
    return new Promise((resolve) => this.idleResolvers.push(resolve));
  }

  /** 每一幀呼叫一次。回傳 true 代表還有動畫要播（需要下一幀）。 */
  update(now: number): boolean {
    while (this.isBusy()) {
      const step = this.active ?? this.startNext(now);
      const t = step.durationMs > 0 ? (now - step.startTime) / step.durationMs : 1;
      if (t < 1) {
        this.setAngle(step, easeOutCubic(Math.max(0, t)));
        return true;
      }
      this.finish(step);
    }
    this.carryStart = null;
    return false;
  }

  /** 清空佇列（中途的那一步直接放回原位），並讓所有還在等的 Promise resolve */
  clear(): void {
    if (this.active) this.model.settle(this.active.objects);
    this.active = null;
    this.queue = [];
    this.carryStart = null;
    for (const batch of this.pendingBatches) batch.resolve();
    this.pendingBatches.clear();
    this.resolveIdle();
  }

  private startNext(now: number): ActiveStep {
    const next = this.queue.shift() as QueuedMove;
    const objects = this.model.cubiesInLayer(next.move.axis, next.move.layer);
    this.model.pivot.rotation.set(0, 0, 0);
    for (const obj of objects) this.model.pivot.attach(obj);
    this.active = { ...next, startTime: this.carryStart ?? now, objects };
    return this.active;
  }

  private setAngle(step: ActiveStep, progress: number): void {
    // Move.dir = 1 是繞正軸 +90°，剛好等於 pivot.rotation[axis] = +π/2
    this.model.pivot.rotation[step.move.axis] = (step.move.dir * Math.PI * progress) / 2;
  }

  private finish(step: ActiveStep): void {
    this.setAngle(step, 1);
    this.model.settle(step.objects);
    this.active = null;
    this.carryStart = step.startTime + step.durationMs;
    step.batch.remaining -= 1;
    if (step.batch.remaining === 0) {
      this.pendingBatches.delete(step.batch);
      step.batch.resolve();
    }
    if (!this.isBusy()) this.resolveIdle();
  }

  private resolveIdle(): void {
    const resolvers = this.idleResolvers;
    this.idleResolvers = [];
    for (const resolve of resolvers) resolve();
  }
}
