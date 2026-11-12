import Cube from '../vendor/cubejs';
import { beforeAll, describe, expect, it } from 'vitest';
import { applyMoves, createSolvedState, isSolved } from '../core/cubeState';
import { toFaceletString } from '../core/facelets';
import { parseNotation } from '../core/moves';
import { createSeededRng } from '../core/random';
import { generateScramble } from '../core/scramble';
import { solutionToMoves, solveWithFaceletSolver } from '../core/solver/kociembaSolver';
import { createKociembaClient } from './kociembaClient';
import { handleKociembaRequest, solveFacelets } from './kociembaHandler';
import type { KociembaRequest, KociembaResponse, WorkerLike } from './kociembaProtocol';

// cubejs 建表要好幾秒，整個檔案只做一次
const INIT_TIMEOUT = 60_000;
beforeAll(() => {
  handleKociembaRequest({ type: 'init', id: 0 });
}, INIT_TIMEOUT);

/** 不經過真的 Worker，直接在同一個執行緒呼叫 handler 的假 Worker */
function createInlineWorker(): WorkerLike & { terminated: boolean } {
  const worker = {
    terminated: false,
    onmessage: null as WorkerLike['onmessage'],
    onerror: null as WorkerLike['onerror'],
    postMessage(message: KociembaRequest) {
      const response = handleKociembaRequest(message);
      queueMicrotask(() => worker.onmessage?.({ data: response } as MessageEvent<KociembaResponse>));
    },
    terminate() {
      worker.terminated = true;
    },
  };
  return worker;
}

describe('facelet 字串和 cubejs 一致', () => {
  it.each(['R', 'U', 'F', 'L', 'D', 'B', "R U2 F' L D2 B'"])('套用 %s 後兩邊字串相同', (notation) => {
    const ours = toFaceletString(applyMoves(createSolvedState(3), parseNotation(notation)));
    expect(ours).toBe(new Cube().move(notation).asString());
  });
});

describe('cubejs 解法（node 直接呼叫，不經 Worker）', () => {
  it('隨機打亂 20 次，都能解回完成狀態', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const scrambled = applyMoves(createSolvedState(3), generateScramble(3, 25, createSeededRng(seed)));
      const solution = solutionToMoves(solveFacelets(toFaceletString(scrambled)));
      expect(solution.length).toBeLessThanOrEqual(22 * 2);
      expect(isSolved(applyMoves(scrambled, solution))).toBe(true);
    }
  }, INIT_TIMEOUT);

  it('玩家轉過中間層（中心塊移位）也能解', async () => {
    const moves = [
      ...generateScramble(3, 20, createSeededRng(99)),
      { axis: 'x', layer: 0, dir: 1 } as const,
      { axis: 'z', layer: 0, dir: -1 } as const,
      ...parseNotation("R U F'"),
    ];
    const scrambled = applyMoves(createSolvedState(3), moves);
    const solution = await solveWithFaceletSolver(scrambled, solveFacelets);
    expect(isSolved(applyMoves(scrambled, solution))).toBe(true);
  });

  it('完成狀態直接回傳空陣列，不呼叫解法器', async () => {
    const solver = () => {
      throw new Error('不應該被呼叫');
    };
    await expect(solveWithFaceletSolver(createSolvedState(3), solver)).resolves.toEqual([]);
  });
});

describe('createKociembaClient（假 Worker）', () => {
  it('init 只建立一次、isReady 變成 true、solve 能還原', async () => {
    let created = 0;
    const client = createKociembaClient(() => {
      created++;
      return createInlineWorker();
    });
    expect(client.isReady()).toBe(false);
    await Promise.all([client.init(), client.init()]);
    expect(client.isReady()).toBe(true);
    const scrambled = applyMoves(createSolvedState(3), generateScramble(3, 20, createSeededRng(5)));
    const solution = await client.solve(scrambled);
    expect(isSolved(applyMoves(scrambled, solution))).toBe(true);
    expect(created).toBe(1);
    client.dispose();
  });

  it('solve 不需要先呼叫 init；完成狀態回傳空陣列', async () => {
    const client = createKociembaClient(createInlineWorker);
    expect(await client.solve(createSolvedState(3))).toEqual([]);
    const scrambled = applyMoves(createSolvedState(3), parseNotation("R U R' U'"));
    const solution = await client.solve(scrambled);
    expect(isSolved(applyMoves(scrambled, solution))).toBe(true);
  });

  it('Worker 回傳錯誤時 solve 會 reject', async () => {
    const client = createKociembaClient(() => {
      const worker = createInlineWorker();
      worker.postMessage = (message) => {
        const response: KociembaResponse =
          message.type === 'init' ? { type: 'ready', id: message.id } : { type: 'error', id: message.id, message: '壞掉了' };
        queueMicrotask(() => worker.onmessage?.({ data: response } as MessageEvent<KociembaResponse>));
      };
      return worker;
    });
    const scrambled = applyMoves(createSolvedState(3), parseNotation('R'));
    await expect(client.solve(scrambled)).rejects.toThrow('壞掉了');
  });

  it('dispose 會終止 Worker，並讓未完成的請求 reject', async () => {
    const worker = createInlineWorker();
    worker.postMessage = () => {}; // 永遠不回應
    const client = createKociembaClient(() => worker);
    const pending = client.init();
    client.dispose();
    await expect(pending).rejects.toThrow();
    expect(worker.terminated).toBe(true);
    expect(client.isReady()).toBe(false);
  });
});
