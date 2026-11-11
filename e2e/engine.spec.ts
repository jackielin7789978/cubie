// engine 工作線的端對端測試：用 dev/engine.html 單獨測 3D 方塊（不經過 React）。
import { mkdirSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

type Axis = 'x' | 'y' | 'z';
interface Move {
  axis: Axis;
  layer: number;
  dir: 1 | -1;
}
interface Sticker {
  position: [number, number, number];
  normal: [number, number, number];
  color: string;
}
interface CubeState {
  size: number;
  stickers: Sticker[];
}
/** dev/engine-harness.ts 掛在 window 上的東西（只列測試用到的） */
interface HarnessWindow {
  engine: {
    enqueueMoves(moves: Move[], o: { durationMs: number }): Promise<void>;
    whenIdle(): Promise<void>;
    setState(s: CubeState): void;
    setTheme(t: unknown): void;
    setSize(n: number): void;
    setInputEnabled(b: boolean): void;
    resetView(): void;
    readVisualState(): CubeState;
    isBloomActive(): boolean;
    projectToScreen(x: number, y: number, z: number): { x: number; y: number };
  };
  core: {
    createSolvedState(n: number): CubeState;
    applyMoves(s: CubeState, m: Move[]): CubeState;
  };
  themes: Record<string, unknown>;
  __userMoves: Move[];
  recreateEngine(): void;
}
declare global {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface Window extends HarnessWindow {}
}

const SHOT_DIR = 'screenshots/engine';

async function openEngine(page: Page, size = 3, theme = 'classic'): Promise<string[]> {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto(`dev/engine.html?size=${size}&theme=${theme}`);
  await page.waitForFunction(() => 'engine' in window);
  await nextFrames(page);
  return errors;
}

/** 等兩幀，確保 requestRender 排的那一幀已經畫好 */
async function nextFrames(page: Page): Promise<void> {
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

async function waitIdle(page: Page): Promise<void> {
  await page.evaluate(() => window.engine.whenIdle());
  await nextFrames(page);
}

async function shot(page: Page): Promise<Buffer> {
  return page.locator('#stage').screenshot();
}

/** 在瀏覽器裡比對兩張 PNG，回傳差異像素的比例 */
async function diffRatio(page: Page, a: Buffer, b: Buffer): Promise<number> {
  return page.evaluate(
    async ([a64, b64]) => {
      const load = async (b: string) => {
        const blob = await (await fetch(`data:image/png;base64,${b}`)).blob();
        const bmp = await createImageBitmap(blob);
        const canvas = document.createElement('canvas');
        canvas.width = bmp.width;
        canvas.height = bmp.height;
        const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
        ctx.drawImage(bmp, 0, 0);
        return ctx.getImageData(0, 0, bmp.width, bmp.height).data;
      };
      const [da, db] = await Promise.all([load(a64), load(b64)]);
      let diff = 0;
      for (let i = 0; i < da.length; i += 4) {
        const d = Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]);
        if (d > 30) diff += 1;
      }
      return diff / (da.length / 4);
    },
    [a.toString('base64'), b.toString('base64')],
  );
}

const canonical = (s: CubeState) =>
  s.stickers.map((t) => `${t.position.join(',')}|${t.normal.join(',')}|${t.color}`).sort();

/** 用滑鼠從方塊上某一點拖曳一段距離 */
async function mouseDragFrom(page: Page, point: [number, number, number], dx: number, dy: number): Promise<void> {
  const p = await page.evaluate(([x, y, z]) => window.engine.projectToScreen(x, y, z), point);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(p.x + dx, p.y + dy, { steps: 8 });
  await page.mouse.up();
}

/** 在頁面裡 dispatch 觸控的 PointerEvent（WebKit 不支援 CDP 觸控） */
async function touchDrag(page: Page, from: { x: number; y: number }, dx: number, dy: number): Promise<void> {
  await page.evaluate(
    ([x, y, dx, dy]) => {
      const canvas = document.querySelector('#stage canvas') as HTMLCanvasElement;
      const fire = (type: string, cx: number, cy: number) =>
        canvas.dispatchEvent(
          new PointerEvent(type, {
            pointerId: 11,
            pointerType: 'touch',
            isPrimary: true,
            clientX: cx,
            clientY: cy,
            bubbles: true,
            cancelable: true,
          }),
        );
      fire('pointerdown', x, y);
      for (let i = 1; i <= 8; i++) fire('pointermove', x + (dx * i) / 8, y + (dy * i) / 8);
      fire('pointerup', x + dx, y + dy);
    },
    [from.x, from.y, dx, dy],
  );
}

test.describe('engine', () => {
  test('方塊正確顯示、沒有 console error', async ({ page }) => {
    const errors = await openEngine(page);
    await expect(page.locator('#stage canvas')).toHaveCount(1);
    const state = await page.evaluate(() => window.engine.readVisualState());
    const solved = await page.evaluate(() => window.core.createSolvedState(3));
    expect(canonical(state)).toEqual(canonical(solved));
    expect(errors).toEqual([]);
  });

  test('按鍵盤 R：畫面改變、onUserMove 收到標準記號 R', async ({ page }) => {
    const errors = await openEngine(page);
    const before = await shot(page);
    await page.keyboard.press('r');
    await waitIdle(page);
    expect(await page.evaluate(() => window.__userMoves)).toEqual([{ axis: 'x', layer: 1, dir: -1 }]);
    expect(await diffRatio(page, before, await shot(page))).toBeGreaterThan(0.005);
    await page.keyboard.press('Shift+R');
    await waitIdle(page);
    expect((await page.evaluate(() => window.__userMoves))[1]).toEqual({ axis: 'x', layer: 1, dir: 1 });
    expect(errors).toEqual([]);
  });

  test('setInputEnabled(false)：鍵盤和拖曳方塊都不轉層，但可以旋轉視角', async ({ page }) => {
    await openEngine(page);
    await page.evaluate(() => window.engine.setInputEnabled(false));
    await page.keyboard.press('r');
    const before = await shot(page);
    await mouseDragFrom(page, [0, 0, 1.5], 80, 0);
    await waitIdle(page);
    expect(await page.evaluate(() => window.__userMoves)).toEqual([]);
    expect(await diffRatio(page, before, await shot(page))).toBeGreaterThan(0.005);
  });

  test('正面中間偏上的貼紙往右拖 → 最上層往右轉', async ({ page }) => {
    await openEngine(page);
    await mouseDragFrom(page, [0, 1, 1.5], 60, 0);
    await waitIdle(page);
    expect(await page.evaluate(() => window.__userMoves)).toEqual([{ axis: 'y', layer: 1, dir: 1 }]);
    // 前面上排的綠色貼紙被帶到右面（往右走）
    const state = await page.evaluate(() => window.engine.readVisualState());
    const moved = state.stickers.filter((s) => s.color === 'F' && s.normal[0] === 1 && s.position[1] === 1);
    expect(moved).toHaveLength(3);
  });

  test('正面右欄往上拖 → 標準記號 R', async ({ page }) => {
    await openEngine(page);
    await mouseDragFrom(page, [1, 0, 1.5], 0, -60);
    await waitIdle(page);
    expect(await page.evaluate(() => window.__userMoves)).toEqual([{ axis: 'x', layer: 1, dir: -1 }]);
    const state = await page.evaluate(() => window.engine.readVisualState());
    const moved = state.stickers.filter((s) => s.color === 'F' && s.normal[1] === 1 && s.position[0] === 1);
    expect(moved).toHaveLength(3);
  });

  test('在空白處拖曳：不轉層，但視角改變', async ({ page }) => {
    await openEngine(page);
    const before = await shot(page);
    const box = (await page.locator('#stage').boundingBox())!;
    await page.mouse.move(box.x + 15, box.y + 15);
    await page.mouse.down();
    await page.mouse.move(box.x + 120, box.y + 60, { steps: 8 });
    await page.mouse.up();
    await nextFrames(page);
    expect(await page.evaluate(() => window.__userMoves)).toEqual([]);
    expect(await diffRatio(page, before, await shot(page))).toBeGreaterThan(0.005);
    // resetView 回到原本的畫面
    await page.evaluate(() => window.engine.resetView());
    await nextFrames(page);
    expect(await diffRatio(page, before, await shot(page))).toBeLessThan(0.002);
  });

  test('觸控拖曳轉動一層，頁面沒有捲動', async ({ page }) => {
    await openEngine(page);
    const touchAction = await page.locator('#stage canvas').evaluate((c) => getComputedStyle(c).touchAction);
    expect(touchAction).toBe('none');
    const scrollBefore = await page.evaluate(() => window.scrollY);
    const p = await page.evaluate(() => window.engine.projectToScreen(1, 0, 1.5));
    await touchDrag(page, p, 0, -60);
    await waitIdle(page);
    expect(await page.evaluate(() => window.__userMoves)).toEqual([{ axis: 'x', layer: 1, dir: -1 }]);
    expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);
  });

  test('動畫中連續輸入會排進佇列，不會丟掉', async ({ page }) => {
    await openEngine(page);
    await page.keyboard.press('r');
    await page.keyboard.press('u');
    await page.keyboard.press('f');
    await waitIdle(page);
    const moves = await page.evaluate(() => window.__userMoves);
    expect(moves).toHaveLength(3);
    const [visual, expected] = await page.evaluate((m) => {
      const { engine, core } = window;
      return [engine.readVisualState(), core.applyMoves(core.createSolvedState(3), m)];
    }, moves);
    expect(canonical(visual)).toEqual(canonical(expected));
  });

  test('enqueueMoves 20 步會 resolve，畫面和 core applyMoves 一致', async ({ page }) => {
    const errors = await openEngine(page, 4);
    const moves: Move[] = Array.from({ length: 20 }, (_, i) => ({
      axis: (['x', 'y', 'z'] as const)[(i * 7) % 3],
      layer: [-1.5, -0.5, 0.5, 1.5][(i * 5) % 4],
      dir: i % 3 === 0 ? -1 : 1,
    }));
    const [visual, expected] = await page.evaluate(async (m) => {
      const { engine, core } = window;
      await engine.enqueueMoves(m, { durationMs: 70 });
      return [engine.readVisualState(), core.applyMoves(core.createSolvedState(4), m)];
    }, moves);
    expect(canonical(visual)).toEqual(canonical(expected));
    await nextFrames(page);
    const animated = await shot(page);
    await page.evaluate((s) => window.engine.setState(s), expected);
    await nextFrames(page);
    expect(await diffRatio(page, animated, await shot(page))).toBeLessThan(0.002);
    expect(errors).toEqual([]);
  });

  test('setSize / setState 會清空佇列，未完成的 Promise 也會 resolve', async ({ page }) => {
    await openEngine(page);
    const resolved = await page.evaluate(async () => {
      const { engine } = window;
      const pending = engine.enqueueMoves(Array(10).fill({ axis: 'x', layer: 1, dir: 1 }), { durationMs: 500 });
      engine.setSize(2);
      await pending;
      return engine.readVisualState().size;
    });
    expect(resolved).toBe(2);
  });

  test('create → dispose → create 後 container 只有一個 canvas，主題切換來回不出錯', async ({ page }) => {
    const errors = await openEngine(page, 3, 'neon');
    await page.evaluate(() => {
      window.recreateEngine();
      window.recreateEngine();
    });
    await nextFrames(page);
    await expect(page.locator('#stage canvas')).toHaveCount(1);
    await page.evaluate(() => {
      const { engine, themes } = window;
      for (let i = 0; i < 5; i++) for (const id of ['classic', 'neon', 'brand']) engine.setTheme(themes[id]);
    });
    await nextFrames(page);
    expect(await page.evaluate(() => window.engine.isBloomActive())).toBe(false);
    await page.evaluate(() => window.engine.setTheme(window.themes.neon));
    expect(await page.evaluate(() => window.engine.isBloomActive())).toBe(true);
    expect(errors).toEqual([]);
  });
});

/** 用 WEBGL_lose_context 模擬 context 遺失再還原（iOS Safari 分頁放背景可能發生） */
async function loseAndRestoreContext(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const canvas = document.querySelector('#stage canvas') as HTMLCanvasElement;
    const gl = (canvas.getContext('webgl2') ?? canvas.getContext('webgl')) as WebGLRenderingContext;
    const ext = gl.getExtension('WEBGL_lose_context')!;
    const once = (type: string) => new Promise<void>((r) => canvas.addEventListener(type, () => r(), { once: true }));
    const lost = once('webglcontextlost');
    ext.loseContext();
    await lost;
    // 立刻還原的話 Chrome 不一定會送出 restored 事件，等一下比較接近真實情況
    await new Promise((r) => setTimeout(r, 300));
    const restored = once('webglcontextrestored');
    ext.restoreContext();
    await restored;
  });
}

test.describe('WebGL context 遺失後還原', () => {
  for (const theme of ['classic', 'neon']) {
    test(`${theme}：還原後不需互動就自動重畫，畫面和遺失前幾乎一樣`, async ({ page }) => {
      const errors = await openEngine(page, 3, theme);
      await page.evaluate(() => window.engine.enqueueMoves([{ axis: 'x', layer: 1, dir: -1 }], { durationMs: 10 }));
      await waitIdle(page);
      const before = await shot(page);
      await loseAndRestoreContext(page);
      await nextFrames(page);
      await nextFrames(page);
      const after = await shot(page);
      expect(await diffRatio(page, before, after)).toBeLessThan(0.02);
      expect(errors.filter((e) => !/context (lost|restored)/i.test(e))).toEqual([]);
    });
  }
});

// 視覺檢查用截圖：三種主題 × 三種尺寸 × 三種 viewport，只在桌機 project 跑一次
test.describe('engine 截圖', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', '只在 chromium 截圖');

  const viewports = [
    { width: 1440, height: 900 },
    { width: 390, height: 590 },
    { width: 560, height: 390 },
  ];
  for (const theme of ['classic', 'brand', 'neon']) {
    test(`主題 ${theme}`, async ({ page }) => {
      mkdirSync(SHOT_DIR, { recursive: true });
      for (const vp of viewports) {
        await page.setViewportSize(vp);
        for (const size of [2, 3, 4]) {
          const errors = await openEngine(page, size, theme);
          await page.screenshot({ path: `${SHOT_DIR}/${theme}-${size}-${vp.width}x${vp.height}.png` });
          expect(errors).toEqual([]);
        }
      }
    });
  }

  test('轉動到一半、從底面看', async ({ page }) => {
    mkdirSync(SHOT_DIR, { recursive: true });
    await openEngine(page, 3, 'classic');
    await page.evaluate(() => {
      void window.engine.enqueueMoves([{ axis: 'x', layer: 1, dir: -1 }], { durationMs: 3000 });
    });
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${SHOT_DIR}/classic-3-midturn.png` });
    await waitIdle(page);
    const box = (await page.locator('#stage').boundingBox())!;
    await page.mouse.move(box.x + 20, box.y + 100);
    await page.mouse.down();
    await page.mouse.move(box.x + 20, box.y + 100 - 300, { steps: 10 });
    await page.mouse.up();
    await nextFrames(page);
    await page.screenshot({ path: `${SHOT_DIR}/classic-3-bottom-view.png` });
    await openEngine(page, 4, 'neon');
    await page.evaluate(() => {
      void window.engine.enqueueMoves([{ axis: 'y', layer: 0.5, dir: 1 }], { durationMs: 3000 });
    });
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${SHOT_DIR}/neon-4-midturn.png` });
  });
});
