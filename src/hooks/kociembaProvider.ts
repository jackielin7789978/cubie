// 把 3×3 的 Kociemba 解法器（在 Web Worker 裡跑）包成控制器能用的「外部解法器」。
import type { CubeState, Move } from '../core/types';
import { createKociembaClient } from '../workers/kociembaClient';
import type { KociembaClient } from '../workers/types';
import type { SolutionProvider } from './gameController';

/** 解法器太久沒回應就放棄，控制器會改成直接重設方塊 */
const SOLVE_TIMEOUT_MS = 8000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('解法器逾時')), ms);
    promise.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

/**
 * 建立 3×3 專用的解法器。一建立就在背景建表（約 1–5 秒），
 * 玩家按「放棄」時通常已經準備好了。其他尺寸回傳 null（放棄時直接重設）。
 */
export function createKociembaProvider(client: KociembaClient = createKociembaClient()): SolutionProvider {
  client.init().catch((error: unknown) => console.warn('Kociemba 解法器初始化失敗', error));
  return (state: CubeState): Promise<Move[]> | null =>
    state.size === 3 ? withTimeout(client.solve(state), SOLVE_TIMEOUT_MS) : null;
}
