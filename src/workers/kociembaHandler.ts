import Cube from '../vendor/cubejs';
import type { KociembaRequest, KociembaResponse } from './kociembaProtocol';

let initialized = false;

function ensureInitialized(): void {
  if (initialized) return;
  Cube.initSolver();
  initialized = true;
}

/** 用 cubejs 解 facelet 字串（同步、會阻塞，所以只在 Worker 或測試裡呼叫） */
export function solveFacelets(facelets: string): string {
  ensureInitialized();
  return Cube.fromString(facelets).solve();
}

/** 處理一個請求並產生回應。和 Worker 的全域物件分開，方便在 node 測試裡直接呼叫。 */
export function handleKociembaRequest(request: KociembaRequest): KociembaResponse {
  try {
    if (request.type === 'init') {
      ensureInitialized();
      return { type: 'ready', id: request.id };
    }
    return { type: 'solved', id: request.id, solution: solveFacelets(request.facelets) };
  } catch (error) {
    return { type: 'error', id: request.id, message: error instanceof Error ? error.message : String(error) };
  }
}
