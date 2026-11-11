// Kociemba 解法 Web Worker：在背景執行緒建表和求解，不會卡住畫面。
import { handleKociembaRequest } from './kociembaHandler';
import type { KociembaRequest, KociembaResponse } from './kociembaProtocol';

// tsconfig 只載入 DOM 型別，self 會被當成 window；這裡用最小介面描述 Worker 的全域物件
interface WorkerScope {
  onmessage: ((event: MessageEvent<KociembaRequest>) => void) | null;
  postMessage(message: KociembaResponse): void;
}

const scope = self as unknown as WorkerScope;

scope.onmessage = (event) => {
  scope.postMessage(handleKociembaRequest(event.data));
};
