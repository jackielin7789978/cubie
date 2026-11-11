// 開發和 e2e 測試用的假 engine（網址加 ?mockEngine 才會用到）。
// 實作和真 engine 相同的 CubeEngine 介面，畫面只是一張 2D 展開圖。整合後可以整個資料夾刪掉。
import { applyMove, createSolvedState } from '../../core';
import type { CubeState, FaceColor, Move, Sticker } from '../../core/types';
import type { CubeEngine, CubeEngineOptions, EnqueueOptions } from '../../engine/types';
import type { Theme } from '../../themes/types';

export interface MockCubeEngine extends CubeEngine {
  /** 假裝玩家拖曳轉了一層：呼叫 onUserMove 並播放動畫 */
  simulateUserMove(move: Move): void;
  /** 目前畫面上的狀態（動畫播完的部分） */
  getState(): CubeState;
}

interface QueuedMove {
  move: Move;
  durationMs: number;
}

/** 展開圖：每個面在 4×3 格子裡的位置（欄、列） */
const NET_CELLS: Record<FaceColor, [number, number]> = { U: [1, 0], L: [0, 1], F: [1, 1], R: [2, 1], B: [3, 1], D: [1, 2] };

/** 只是為了畫圖：把貼紙投影到 2D（方向不一定和真的方塊一樣） */
function faceCoords(sticker: Sticker): [number, number] {
  const [x, y, z] = sticker.position;
  const [nx, ny] = sticker.normal;
  if (nx !== 0) return [-nx * z, -y];
  if (ny !== 0) return [x, ny * z];
  return [sticker.normal[2] * x, -y];
}

function faceOf(sticker: Sticker): FaceColor {
  const [nx, ny, nz] = sticker.normal;
  if (nx !== 0) return nx > 0 ? 'R' : 'L';
  if (ny !== 0) return ny > 0 ? 'U' : 'D';
  return nz > 0 ? 'F' : 'B';
}

function renderNet(root: HTMLElement, state: CubeState, theme: Theme): void {
  const n = state.size;
  const offset = (n - 1) / 2;
  const cells = state.stickers.map((sticker) => {
    const face = faceOf(sticker);
    const [u, v] = faceCoords(sticker);
    const [col, row] = NET_CELLS[face];
    const gx = col * n + Math.round(u + offset) + 1;
    const gy = row * n + Math.round(v + offset) + 1;
    return `<i style="grid-column:${gx};grid-row:${gy};background:${theme.faceColors[sticker.color]}"></i>`;
  });
  root.innerHTML = `<div style="display:grid;grid-template-columns:repeat(${4 * n},1fr);grid-template-rows:repeat(${3 * n},1fr);gap:2px;width:min(70%,70vh);aspect-ratio:4/3;padding:6px;border-radius:10px;background:${theme.bodyColor}">${cells.join('')}</div>`;
}

export function createMockEngine(options: CubeEngineOptions): MockCubeEngine {
  const root = document.createElement('div');
  root.dataset.mockEngine = 'true';
  root.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;touch-action:none';
  options.container.appendChild(root);

  let theme = options.theme;
  let state = createSolvedState(options.size);
  let queue: QueuedMove[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  let idleWaiters: Array<() => void> = [];
  let inputEnabled = true;

  const draw = () => renderNet(root, state, theme);

  const settleIfIdle = () => {
    if (timer !== null || queue.length > 0) return;
    idleWaiters.forEach((resolve) => resolve());
    idleWaiters = [];
  };

  const playNext = () => {
    timer = null;
    const next = queue.shift();
    if (!next) return settleIfIdle();
    timer = setTimeout(() => {
      state = applyMove(state, next.move);
      draw();
      playNext();
    }, next.durationMs);
  };

  const clearQueue = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    queue = [];
    settleIfIdle();
  };

  const whenIdle = () =>
    new Promise<void>((resolve) => {
      idleWaiters.push(resolve);
      settleIfIdle();
    });

  const enqueueMoves = (moves: readonly Move[], { durationMs }: EnqueueOptions) => {
    queue.push(...moves.map((move) => ({ move, durationMs })));
    if (timer === null) playNext();
    return whenIdle();
  };

  draw();
  return {
    setSize(size) {
      clearQueue();
      state = createSolvedState(size);
      draw();
    },
    setState(next) {
      clearQueue();
      state = next;
      draw();
    },
    setTheme(next) {
      theme = next;
      draw();
    },
    enqueueMoves,
    whenIdle,
    isBusy: () => timer !== null || queue.length > 0,
    setInputEnabled(enabled) {
      inputEnabled = enabled;
    },
    resetView() {},
    dispose() {
      clearQueue();
      root.remove();
    },
    simulateUserMove(move) {
      if (!inputEnabled) return;
      options.onUserMove?.(move);
      void enqueueMoves([move], { durationMs: 180 });
    },
    getState: () => state,
  };
}
