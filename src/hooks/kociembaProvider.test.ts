import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyMoves, createSolvedState } from '../core/cubeState';
import { parseNotation } from '../core/moves';
import type { Move } from '../core/types';
import type { KociembaClient } from '../workers/types';
import { createKociembaProvider } from './kociembaProvider';

const SOLUTION: Move[] = parseNotation("R'");
const SCRAMBLED = applyMoves(createSolvedState(3), parseNotation('R'));
const TIMEOUTS = { initMs: 30_000, solveMs: 8_000 };

/** 每建一個新 Worker（dispose 後）就換下一組行為；用來模擬「舊 Worker 壞了，新的正常」 */
interface WorkerBehavior {
  initMs: number;
  /** null：永遠不回應（例如 iOS 把 Worker 停掉） */
  solveMs: number | null;
}

function fakeClient(behaviors: WorkerBehavior[]): KociembaClient & { workers: number } {
  let index = 0;
  let initPromise: Promise<void> | null = null;
  const current = () => behaviors[Math.min(index, behaviors.length - 1)];
  const delay = <T>(ms: number, value: T) => new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));
  const client = {
    workers: 1,
    init: () => (initPromise ??= delay(current().initMs, undefined)),
    isReady: () => false,
    // 和真的 client 一樣：solve 會先等 init
    solve: async () => {
      await client.init();
      const { solveMs } = current();
      return solveMs === null ? new Promise<Move[]>(() => {}) : delay(solveMs, SOLUTION);
    },
    dispose: () => {
      index++;
      client.workers++;
      initPromise = null;
    },
  };
  return client;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('createKociembaProvider', () => {
  it('2×2、4×4 不處理（回傳 null）', () => {
    const provider = createKociembaProvider(fakeClient([{ initMs: 0, solveMs: 0 }]), TIMEOUTS);
    expect(provider(createSolvedState(2))).toBeNull();
    expect(provider(createSolvedState(4))).toBeNull();
  });

  it('手機建表很慢（12 秒）也會等它，不會因為求解時限 8 秒就放棄', async () => {
    const client = fakeClient([{ initMs: 12_000, solveMs: 500 }]);
    const provider = createKociembaProvider(client, TIMEOUTS);
    const result = provider(SCRAMBLED)!;
    await vi.advanceTimersByTimeAsync(13_000);
    await expect(result).resolves.toEqual(SOLUTION);
    expect(client.workers).toBe(1);
  });

  it('舊 Worker 沒有回應（例如 iOS 在背景停掉它）：逾時後換新 Worker 重試成功', async () => {
    const client = fakeClient([
      { initMs: 0, solveMs: null },
      { initMs: 3_000, solveMs: 500 },
    ]);
    const provider = createKociembaProvider(client, TIMEOUTS);
    const result = provider(SCRAMBLED)!;
    await vi.advanceTimersByTimeAsync(8_000 + 3_000 + 500);
    await expect(result).resolves.toEqual(SOLUTION);
    expect(client.workers).toBe(2);
  });

  it('重試也失敗才 reject（控制器會改成直接重設）', async () => {
    const client = fakeClient([{ initMs: 0, solveMs: null }]);
    const provider = createKociembaProvider(client, TIMEOUTS);
    const result = provider(SCRAMBLED)!;
    const assertion = expect(result).rejects.toThrow('逾時');
    await vi.advanceTimersByTimeAsync(8_000 * 2 + 1_000);
    await assertion;
  });
});
