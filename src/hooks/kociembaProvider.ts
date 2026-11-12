// 把 3×3 的 Kociemba 解法器（在 Web Worker 裡跑）包成控制器能用的「外部解法器」。
import type { CubeState, Move } from '../core/types';
import { createKociembaClient } from '../workers/kociembaClient';
import type { KociembaClient } from '../workers/types';
import type { SolutionProvider } from './gameController';

export interface KociembaTimeouts {
  /** 等建表完成的上限。手機（尤其省電模式）建表可能要 10 秒以上，所以給得比較寬 */
  initMs: number;
  /** 建表完成後，單次求解的上限（桌機通常 < 1 秒） */
  solveMs: number;
}

export const DEFAULT_TIMEOUTS: KociembaTimeouts = { initMs: 30_000, solveMs: 8_000 };

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label}逾時（${ms} ms）`)), ms);
    promise.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

/** 先等建表（有自己的時限），再求解；兩段分開計時，建表慢不會吃掉求解的時間 */
async function solveOnce(client: KociembaClient, state: CubeState, timeouts: KociembaTimeouts): Promise<Move[]> {
  await withTimeout(client.init(), timeouts.initMs, 'Kociemba 建表');
  return withTimeout(client.solve(state), timeouts.solveMs, 'Kociemba 求解');
}

/**
 * 解一次；失敗（Worker 出錯、被瀏覽器暫停或終止而沒有回應、逾時）就把 Worker 關掉、
 * 換一個新的再試一次。iOS Safari 把分頁放到背景後可能會停掉 Worker，舊的 Worker 不會再回應。
 */
async function solveWithRetry(client: KociembaClient, state: CubeState, timeouts: KociembaTimeouts): Promise<Move[]> {
  try {
    return await solveOnce(client, state, timeouts);
  } catch (error) {
    console.warn('Kociemba 第一次求解失敗，換新的 Worker 重試', error);
    client.dispose();
    return solveOnce(client, state, timeouts);
  }
}

/**
 * 建立 3×3 專用的解法器。一建立就在背景建表，
 * 玩家按「放棄」時通常已經準備好了。其他尺寸回傳 null（放棄時直接重設）。
 */
export function createKociembaProvider(
  client: KociembaClient = createKociembaClient(),
  timeouts: KociembaTimeouts = DEFAULT_TIMEOUTS,
): SolutionProvider {
  client.init().catch((error: unknown) => console.warn('Kociemba 解法器初始化失敗', error));
  return (state: CubeState): Promise<Move[]> | null =>
    state.size === 3 ? solveWithRetry(client, state, timeouts) : null;
}
