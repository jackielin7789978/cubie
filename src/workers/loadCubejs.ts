// 載入 cubejs。cubejs 是很舊的寫法：靠最外層的 `this` 把 Cube 掛成全域變數，
// 在 ES module 的 Worker 裡 `this` 是 undefined，直接 import 會出錯（Vite 開發模式就會壞）。
// 所以這裡把原始碼當成文字讀進來，再用我們自己準備的物件當 `this` 執行，
// 這樣開發模式、正式版和 node 測試的行為都一樣。
import type CubeClass from 'cubejs';
import cubeSource from 'cubejs/lib/cube.js?raw';
import solveSource from 'cubejs/lib/solve.js?raw';

type CubeConstructor = typeof CubeClass;

let cached: CubeConstructor | null = null;

function runWithScope(source: string, scope: object): void {
  // 用參數把 module / require 遮成 undefined，cubejs 才會走「掛到 this」那條路
  new Function('module', 'require', source).call(scope, undefined, undefined);
}

export function loadCubejs(): CubeConstructor {
  if (cached) return cached;
  const scope: { Cube?: CubeConstructor } = {};
  runWithScope(cubeSource, scope);
  runWithScope(solveSource, scope);
  if (!scope.Cube) throw new Error('cubejs 載入失敗');
  cached = scope.Cube;
  return cached;
}
