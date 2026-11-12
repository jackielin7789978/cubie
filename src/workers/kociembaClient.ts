import { solveWithFaceletSolver } from '../core/solver/kociembaSolver';
import type { CubeState, Move } from '../core/types';
import type { KociembaRequest, KociembaResponse, WorkerLike } from './kociembaProtocol';
import type { KociembaClient } from './types';

type RequestBody = { type: 'init' } | { type: 'solve'; facelets: string };

interface Pending {
  resolve: (response: KociembaResponse) => void;
  reject: (error: Error) => void;
}

function createDefaultWorker(): WorkerLike {
  // Vite 看到 new URL(..., import.meta.url) 會把 worker 檔案另外打包
  return new Worker(new URL('./kociemba.worker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerLike;
}

/** 管理 Worker 和請求/回應配對：每個請求有自己的 id，回應用 id 找回對應的 Promise */
class WorkerChannel {
  private worker: WorkerLike | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();
  private readonly createWorker: () => WorkerLike;

  constructor(createWorker: () => WorkerLike) {
    this.createWorker = createWorker;
  }

  request(body: RequestBody): Promise<KociembaResponse> {
    const id = this.nextId++;
    const message = { ...body, id } as KociembaRequest;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.getWorker().postMessage(message);
    });
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
    this.rejectAll(new Error('Kociemba 解法器已關閉'));
  }

  private getWorker(): WorkerLike {
    if (this.worker) return this.worker;
    const worker = this.createWorker();
    worker.onmessage = (event) => this.settle(event.data);
    worker.onerror = (event) => this.rejectAll(new Error(`Kociemba Worker 發生錯誤：${event.message}`));
    this.worker = worker;
    return worker;
  }

  private settle(response: KociembaResponse): void {
    const entry = this.pending.get(response.id);
    if (!entry) return;
    this.pending.delete(response.id);
    if (response.type === 'error') entry.reject(new Error(response.message));
    else entry.resolve(response);
  }

  private rejectAll(error: Error): void {
    for (const entry of this.pending.values()) entry.reject(error);
    this.pending.clear();
  }
}

/**
 * 建立 3×3 Kociemba 解法器。Worker 在第一次 init() 或 solve() 時才建立。
 * createWorker 只有測試需要換掉，平常不用傳。
 */
export function createKociembaClient(createWorker: () => WorkerLike = createDefaultWorker): KociembaClient {
  const channel = new WorkerChannel(createWorker);
  let initPromise: Promise<void> | null = null;
  let ready = false;

  const init = (): Promise<void> => {
    if (initPromise) return initPromise;
    const current: Promise<void> = channel.request({ type: 'init' }).then(
      () => {
        ready = true;
      },
      (error: unknown) => {
        // 失敗了下次可以重試；dispose 後已經換成新的 init 就不要動它
        if (initPromise === current) initPromise = null;
        throw error;
      },
    );
    initPromise = current;
    return current;
  };

  const solveFacelets = async (facelets: string): Promise<string> => {
    await init();
    const response = await channel.request({ type: 'solve', facelets });
    if (response.type !== 'solved') throw new Error('Kociemba Worker 回傳了非預期的訊息');
    return response.solution;
  };

  return {
    init,
    isReady: () => ready,
    solve: (state: CubeState): Promise<Move[]> => solveWithFaceletSolver(state, solveFacelets),
    dispose: () => {
      channel.dispose();
      initPromise = null;
      ready = false;
    },
  };
}
