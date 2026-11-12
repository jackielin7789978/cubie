// 3×3 Kociemba 解法器（cubejs）。直接放在專案裡，而不是從 npm 安裝：
// npm 上的 cubejs 1.3.2 把 npm@6 誤列為執行時相依套件，會多裝四百多個有漏洞的套件，
// 而且它靠全域 `this` 匯出，在 ES module 的 Web Worker 裡沒辦法直接使用。
import Cube from './cube.js';
// solve.js 沒有匯出東西，載入時會把 initSolver、solve 等方法加到 Cube 上
import './solve.js';

export default Cube;
