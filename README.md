# Cubie

在瀏覽器裡玩的 3D 魔術方塊，桌機和手機都能玩。

**線上試玩：https://jackielin7789978.github.io/cubie/**

## 功能

- **2×2、3×3、4×4** 三種尺寸
- **拖曳操作**：拖曳方塊面轉動一層，拖曳空白處旋轉視角；滑鼠和觸控都支援
- **遊戲流程**：按「開始遊戲」自動打亂，第一步開始計時，記錄步數和每種尺寸的最佳成績
- **放棄時的小彩蛋**：3×3 放棄時，由 [Herbert Kociemba](https://kociemba.org/) 的兩階段演算法算出解法，並播放還原動畫（通常 20 步左右）
- **三種主題**：經典、Omnichat 配色、賽博龐克（發光貼紙加光暈）
- **RWD**：桌機、平板、手機直式和橫式各有對應版面

## 技術

- Vite、React、TypeScript
- Three.js：3D 渲染、轉層動畫、光暈後製
- Zustand：遊戲狀態
- [cubejs](https://github.com/ldez/cubejs)：3×3 Kociemba 解法器，在 Web Worker 裡建表和求解，不會卡住畫面
- Vitest、Playwright：單元測試和端對端測試（桌機 Chromium、iPhone WebKit）

程式分成三層，彼此只透過介面溝通：

| 資料夾 | 內容 | 依賴 |
|---|---|---|
| `src/core` | 方塊狀態、轉動、打亂、完成判定、facelet 轉換 | 純 TypeScript，不依賴框架 |
| `src/engine` | Three.js 場景、動畫佇列、手勢、主題套用 | 不依賴 React |
| `src/components`、`src/store`、`src/hooks` | React UI 和遊戲流程 | |

`src/workers` 是 Kociemba 解法器的 Web Worker，`src/themes` 是三份主題設定。

## 本機開發

需要 Node.js 22 以上。

```bash
npm install
```

```bash
npm run dev
```

打開 http://localhost:5173/cubie/ 。

| 指令 | 用途 |
|---|---|
| `npm run test` | 單元測試 |
| `npm run e2e` | 端對端測試（第一次要先跑 `npx playwright install chromium webkit`） |
| `npm run verify` | 型別檢查、lint、單元測試、build、端對端測試全部跑一次 |
| `npm run build` | 產生正式版到 `dist/` |

push 到 `main` 後，GitHub Actions 會自動部署到 GitHub Pages。

## 授權

[MIT License](LICENSE)
