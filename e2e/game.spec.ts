// 整合後的端對端情境（SPEC「驗證標準」）：真的 React UI + 真的 3D engine。
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

interface Sticker {
  position: [number, number, number];
  normal: [number, number, number];
  color: string;
}
interface CubeState {
  size: number;
  stickers: Sticker[];
}
/** App 掛在 window.__cubie 上給測試用的東西（只列用到的） */
interface CubieDebug {
  store: { getState(): { cube: CubeState; status: string; moveCount: number; history: unknown[] } };
  engine: {
    whenIdle(): Promise<void>;
    readVisualState(): CubeState;
    projectToScreen(x: number, y: number, z: number): { x: number; y: number };
  };
}

function cubie(): CubieDebug {
  return (window as unknown as { __cubie: CubieDebug }).__cubie;
}

/** 開啟頁面並收集 console error */
async function openGame(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto('./');
  await page.waitForFunction(() => Boolean((window as unknown as { __cubie?: { engine?: unknown } }).__cubie?.engine));
  return errors;
}

const status = (page: Page) => page.getByTestId('game-status');

/** 把狀態轉成可以比對的字串（貼紙順序無關） */
function stateKey(state: CubeState): string {
  return state.stickers
    .map((s) => `${s.position.map((v) => Math.round(v * 2)).join(',')}|${s.normal.map(Math.round).join(',')}|${s.color}`)
    .sort()
    .join(';');
}

async function logicalKey(page: Page): Promise<string> {
  return stateKey(await page.evaluate(() => (window as unknown as { __cubie: CubieDebug }).__cubie.store.getState().cube));
}

async function visualKey(page: Page): Promise<string> {
  return stateKey(
    await page.evaluate(async () => {
      const { engine } = (window as unknown as { __cubie: CubieDebug }).__cubie;
      await engine.whenIdle();
      return engine.readVisualState();
    }),
  );
}

/** 六個方向的貼紙是否各自同色 */
function isSolvedState(state: CubeState): boolean {
  const seen = new Map<string, string>();
  for (const s of state.stickers) {
    const key = s.normal.map(Math.round).join(',');
    if (!seen.has(key)) seen.set(key, s.color);
    else if (seen.get(key) !== s.color) return false;
  }
  return true;
}

async function isSolved(page: Page): Promise<boolean> {
  return isSolvedState(await page.evaluate(() => (window as unknown as { __cubie: CubieDebug }).__cubie.store.getState().cube));
}

async function scramble(page: Page): Promise<void> {
  await page.getByTestId('btn-scramble').click();
  await expect(status(page)).toHaveText('ready', { timeout: 20_000 });
}

/** 讓焦點離開按鈕，鍵盤轉動才會被 engine 接到 */
async function pressMove(page: Page, key: string): Promise<void> {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press(key);
}

/** 在頁面內 dispatch 觸控 PointerEvent，模擬手指在方塊上拖曳 */
async function touchDrag(page: Page, from: { x: number; y: number }, dx: number, dy: number): Promise<void> {
  await page.evaluate(
    ([x, y, dx, dy]) => {
      const canvas = document.querySelector('[data-testid="cube-canvas"] canvas')!;
      const fire = (type: string, cx: number, cy: number) =>
        canvas.dispatchEvent(
          new PointerEvent(type, {
            pointerId: 7,
            pointerType: 'touch',
            isPrimary: true,
            bubbles: true,
            cancelable: true,
            clientX: cx,
            clientY: cy,
            button: 0,
            buttons: type === 'pointerup' ? 0 : 1,
          }),
        );
      fire('pointerdown', x, y);
      for (let i = 1; i <= 6; i++) fire('pointermove', x + (dx * i) / 6, y + (dy * i) / 6);
      fire('pointerup', x + dx, y + dy);
    },
    [from.x, from.y, dx, dy],
  );
}

test('打開頁面：方塊顯示、沒有 console error', async ({ page }) => {
  const errors = await openGame(page);
  await expect(page.getByText('Cubie').first()).toBeVisible();
  const canvas = page.locator('[data-testid="cube-canvas"] canvas');
  await expect(canvas).toHaveCount(1);
  const box = await canvas.boundingBox();
  expect(box!.width).toBeGreaterThan(200);
  expect(box!.height).toBeGreaterThan(200);
  expect(await isSolved(page)).toBe(true);
  expect(errors).toEqual([]);
});

test('打亂 → 轉一步開始計時 → 上一步 → 自動還原跳出完成畫面', async ({ page }) => {
  const errors = await openGame(page);

  await scramble(page);
  expect(await isSolved(page)).toBe(false);
  await expect(page.getByTestId('stat-time')).toHaveText('0:00.00');
  await expect(page.getByTestId('stat-moves')).toContainText('0');
  expect(await visualKey(page)).toBe(await logicalKey(page));

  const beforeMove = await logicalKey(page);
  await pressMove(page, 'r');
  await expect(status(page)).toHaveText('solving');
  await expect(page.getByTestId('stat-moves')).toContainText('1');
  await expect(page.getByTestId('stat-time')).not.toHaveText('0:00.00');
  expect(await logicalKey(page)).not.toBe(beforeMove);

  await page.getByTestId('btn-undo').click();
  await expect(page.getByTestId('stat-moves')).toContainText('2');
  expect(await logicalKey(page)).toBe(beforeMove);
  expect(await visualKey(page)).toBe(beforeMove);

  await page.getByTestId('btn-solve').click();
  await expect(page.getByTestId('solved-modal')).toBeVisible({ timeout: 30_000 });
  expect(await isSolved(page)).toBe(true);
  expect(await visualKey(page)).toBe(await logicalKey(page));

  await page.getByTestId('btn-close-modal').click();
  await expect(page.getByTestId('solved-modal')).toBeHidden();
  expect(errors).toEqual([]);
});

test('手動解完會跳出完成畫面並記錄最佳成績', async ({ page }) => {
  await openGame(page);
  await scramble(page);
  // 用「上一步」沒辦法撤銷打亂，所以這裡轉一步再轉回來不會完成；
  // 改成直接驗證：打亂後玩家照反向序列轉回去 → 完成並寫入最佳紀錄
  const solution = await page.evaluate(() => {
    const { store } = (window as unknown as { __cubie: { store: { getState(): { scrambleMoves: { axis: string; layer: number; dir: number }[] } } } }).__cubie;
    return [...store.getState().scrambleMoves].reverse().map((m) => ({ ...m, dir: -m.dir }));
  });
  await page.evaluate((moves) => {
    const { store } = (window as unknown as { __cubie: { store: { getState(): { applyUserMove(m: unknown): void } } } }).__cubie;
    for (const move of moves) store.getState().applyUserMove(move);
  }, solution);
  await expect(status(page)).toHaveText('solved');
  await expect(page.getByTestId('solved-modal')).toBeVisible();
  await expect(page.getByTestId('stat-best')).not.toHaveText('—');
});

for (const size of [2, 3, 4]) {
  test(`${size}×${size}：可以打亂和自動還原`, async ({ page }) => {
    const errors = await openGame(page);
    await page.getByTestId(`size-${size}`).click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { __cubie: CubieDebug }).__cubie.store.getState().cube.size)).toBe(size);
    expect(await visualKey(page)).toBe(await logicalKey(page));

    await scramble(page);
    expect(await isSolved(page)).toBe(false);
    expect(await visualKey(page)).toBe(await logicalKey(page));

    await pressMove(page, 'u');
    await pressMove(page, 'f');
    await page.getByTestId('btn-solve').click();
    await expect(page.getByTestId('solved-modal')).toBeVisible({ timeout: 40_000 });
    expect(await isSolved(page)).toBe(true);
    expect(await visualKey(page)).toBe(await logicalKey(page));
    expect(errors).toEqual([]);
  });
}

test('切換三種主題，重新整理後仍然記得', async ({ page }) => {
  const errors = await openGame(page);
  for (const theme of ['brand', 'neon', 'classic']) {
    await page.getByTestId(`theme-${theme}`).click();
    await expect(page.getByTestId(`theme-${theme}`)).toHaveAttribute('aria-pressed', 'true');
    await page.reload();
    await page.waitForFunction(() => Boolean((window as unknown as { __cubie?: { engine?: unknown } }).__cubie?.engine));
    await expect(page.getByTestId(`theme-${theme}`)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-testid="cube-canvas"] canvas')).toHaveCount(1);
  }
  expect(errors).toEqual([]);
});

test('在方塊上觸控拖曳會轉動一層，頁面不會捲動', async ({ page }) => {
  await openGame(page);
  await scramble(page);
  const before = await logicalKey(page);
  const size = await page.evaluate(() => (window as unknown as { __cubie: CubieDebug }).__cubie.store.getState().cube.size);
  // 正面（+z）正中間那張貼紙在螢幕上的位置
  const point = await page.evaluate((half) => (window as unknown as { __cubie: CubieDebug }).__cubie.engine.projectToScreen(0, 0, half), size / 2);
  await touchDrag(page, point, 0, -70);
  await expect(page.getByTestId('stat-moves')).toContainText('1');
  expect(await logicalKey(page)).not.toBe(before);
  expect(await visualKey(page)).toBe(await logicalKey(page));
  expect(await page.evaluate(() => [window.scrollX, window.scrollY, document.documentElement.scrollTop])).toEqual([0, 0, 0]);
  const touchAction = await page.locator('[data-testid="cube-canvas"] canvas').evaluate((c) => getComputedStyle(c).touchAction);
  expect(touchAction).toBe('none');
});
