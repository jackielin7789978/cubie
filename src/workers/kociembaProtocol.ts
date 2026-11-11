// 主執行緒和 Kociemba Worker 之間傳遞的訊息格式。每個請求帶一個 id，回應帶回同一個 id。

export type KociembaRequest =
  | { type: 'init'; id: number }
  | { type: 'solve'; id: number; facelets: string };

export type KociembaResponse =
  | { type: 'ready'; id: number }
  | { type: 'solved'; id: number; solution: string }
  | { type: 'error'; id: number; message: string };

/** 和 Worker 溝通需要的最小介面，測試時可以換成假的 */
export interface WorkerLike {
  postMessage(message: KociembaRequest): void;
  onmessage: ((event: MessageEvent<KociembaResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  terminate(): void;
}
