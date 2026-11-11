import { describe, expect, it } from 'vitest';
import { AXES, applyMoves, createSolvedState, layerCoords } from '../core';
import type { CubeState, Move } from '../core/types';
import { CubeModel } from './CubeModel';
import { MoveAnimator } from './MoveAnimator';

/** 把狀態排成固定順序的字串，方便比對 */
function canonical(state: CubeState): string[] {
  return state.stickers.map((s) => `${s.position.join(',')}|${s.normal.join(',')}|${s.color}`).sort();
}

/** 固定的 20 步（包含內層），測試結果可重現 */
function sampleMoves(size: number): Move[] {
  const layers = layerCoords(size);
  return Array.from({ length: 20 }, (_, i) => ({
    axis: AXES[(i * 7) % 3],
    layer: layers[(i * 5) % layers.length],
    dir: i % 3 === 0 ? -1 : 1,
  }));
}

/** 用假的時間一幀一幀推進，直到動畫播完 */
function runUntilIdle(animator: MoveAnimator, frameMs = 16): number {
  let now = 0;
  let frames = 0;
  while (animator.update(now) && frames < 10_000) {
    now += frameMs;
    frames += 1;
  }
  return now;
}

describe('MoveAnimator', () => {
  for (const size of [2, 3, 4]) {
    it(`${size}×${size}：播完後畫面狀態和 core applyMoves 一致`, async () => {
      const model = new CubeModel(size);
      const animator = new MoveAnimator(model);
      const moves = sampleMoves(size);
      const done = animator.enqueue(moves, 70);
      runUntilIdle(animator);
      await done;
      expect(animator.isBusy()).toBe(false);
      expect(canonical(model.readState())).toEqual(canonical(applyMoves(createSolvedState(size), moves)));
      // 旋轉校正成精確的 90° 倍數：四元數分量只會是 0、±0.5、±√½、±1
      for (const obj of model.root.children) {
        for (const c of obj.quaternion.toArray()) {
          expect([0, 0.5, Math.SQRT1_2, 1].some((v) => Math.abs(Math.abs(c) - v) < 1e-9)).toBe(true);
        }
      }
    });
  }

  it('分頁在背景很久後回來，一幀就追上所有已經該播完的步驟', async () => {
    const model = new CubeModel(3);
    const animator = new MoveAnimator(model);
    const done = animator.enqueue(sampleMoves(3), 100);
    animator.update(0);
    expect(animator.update(60_000)).toBe(false);
    await done;
  });

  it('clear() 會讓還沒播完的 Promise 和 whenIdle 都 resolve', async () => {
    const model = new CubeModel(3);
    const animator = new MoveAnimator(model);
    const a = animator.enqueue(sampleMoves(3), 100);
    const b = animator.enqueue(sampleMoves(3), 100);
    const idle = animator.whenIdle();
    animator.update(0);
    animator.update(50);
    animator.clear();
    await Promise.all([a, b, idle]);
    expect(animator.isBusy()).toBe(false);
    expect(model.pivot.children).toHaveLength(0);
  });

  it('沒有轉動時 enqueue 和 whenIdle 立刻 resolve', async () => {
    const animator = new MoveAnimator(new CubeModel(2));
    await animator.enqueue([], 100);
    await animator.whenIdle();
  });

  it('setState 之後畫面就是指定的狀態', () => {
    const model = new CubeModel(4);
    const target = applyMoves(createSolvedState(4), sampleMoves(4));
    model.setState(target);
    expect(canonical(model.readState())).toEqual(canonical(target));
  });
});
