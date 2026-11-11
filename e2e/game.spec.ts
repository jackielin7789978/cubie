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

/** 開啟頁面並收集 console error */
async function openGame(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto('./?testKeys');
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

/** 按「開始遊戲」，等打亂動畫播完 */
async function startGame(page: Page): Promise<void> {
  await page.getByTestId('btn-start').click();
  await expect(status(page)).toHaveText('ready', { timeout: 20_000 });
}

const KOCIEMBA_MESSAGE = /數學老師 Herbert Kociemba 用 \d+ 步幫你解完了/;

/** 方塊的邏輯和畫面都是完成狀態，而且一致 */
async function expectSolvedEverywhere(page: Page): Promise<void> {
  expect(await isSolved(page)).toBe(true);
  expect(isSolvedState(await page.evaluate(() => (window as unknown as { __cubie: CubieDebug }).__cubie.engine.readVisualState()))).toBe(true);
  expect(await visualKey(page)).toBe(await logicalKey(page));
}

/** 回到待機：開始遊戲、尺寸可切換、時間步數歸零、沒有完成畫面、最佳紀錄仍是「—」 */
async function expectIdleAfterGiveUp(page: Page): Promise<void> {
  await expect(status(page)).toHaveText('idle');
  await expect(page.getByTestId('btn-start')).toBeVisible();
  await expect(page.getByTestId('solved-modal')).toHaveCount(0);
  await expect(page.getByTestId('size-2')).toBeEnabled();
  await expect(page.getByTestId('stat-moves')).toHaveText('0');
  await expect(page.getByTestId('stat-time')).toHaveText('0:00.00');
  await expect(page.getByTestId('stat-best')).toHaveText('—');
}

/** 3×3：確認按鈕是「Kociemba」，Kociemba 還原播完跳出完成畫面，按「關閉」回到待機 */
async function giveUpWithKociemba(page: Page, timeout = 40_000): Promise<void> {
  const button = page.getByTestId('btn-giveup');
  await button.click();
  await expect(button).toHaveText('Kociemba');
  await button.click();
  const modal = page.getByTestId('solved-modal');
  await expect(modal).toBeVisible({ timeout });
  await expect(page.getByTestId('modal-message')).toHaveText(KOCIEMBA_MESSAGE);
  await expect(modal).not.toContainText('新紀錄');
  await expect(page.getByTestId('stat-best')).toHaveText('—');
  await expectSolvedEverywhere(page);
  await page.getByTestId('btn-close-modal').click();
  await expect(modal).toBeHidden();
  await expectIdleAfterGiveUp(page);
  await expectSolvedEverywhere(page);
}

/** 2×2、4×4：確認按鈕是「確定放棄？」，直接重設回待機（沒有動畫、完成畫面） */
async function giveUpAndReset(page: Page): Promise<void> {
  const button = page.getByTestId('btn-giveup');
  await button.click();
  await expect(button).toHaveText('確定放棄？');
  await button.click();
  await expectIdleAfterGiveUp(page);
  await expectSolvedEverywhere(page);
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

test('開始遊戲 → 轉一步開始計時 → 上一步 → 放棄（按兩次）→ Kociemba 完成畫面 → 關閉回到待機', async ({ page }) => {
  const errors = await openGame(page);

  await startGame(page);
  expect(await isSolved(page)).toBe(false);
  await expect(page.getByTestId('btn-start')).toHaveCount(0);
  await expect(page.getByTestId('size-2')).toBeDisabled();
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

  await giveUpWithKociemba(page);
  await expect(page.getByTestId('size-2')).toBeEnabled();
  expect(errors).toEqual([]);
});

test('待機時可以用鍵盤自由轉動：不計時、不計步', async ({ page }) => {
  await openGame(page);
  await pressMove(page, 'r');
  await expect.poll(() => isSolved(page)).toBe(false);
  await expect(status(page)).toHaveText('idle');
  await expect(page.getByTestId('stat-moves')).toHaveText('0');
  expect(await visualKey(page)).toBe(await logicalKey(page));
  // 開始遊戲會先把方塊重設成完成狀態再打亂，畫面和邏輯仍然一致
  await startGame(page);
  expect(await visualKey(page)).toBe(await logicalKey(page));
});

test('玩家自己用鍵盤解完：跳出完成畫面並記錄最佳成績', async ({ page }) => {
  await openGame(page);
  await startGame(page);
  // 「上一步」不能撤銷打亂，所以這裡把打亂序列倒過來，用鍵盤一步一步轉回去
  const keys = await page.evaluate(() => {
    type M = { axis: 'x' | 'y' | 'z'; layer: number; dir: number };
    const { store } = (window as unknown as { __cubie: { store: { getState(): { scrambleMoves: M[] } } } }).__cubie;
    const faces = { x: ['R', 'L'], y: ['U', 'D'], z: ['F', 'B'] };
    return [...store.getState().scrambleMoves].reverse().map((m) => {
      const face = faces[m.axis][m.layer > 0 ? 0 : 1];
      // 反向之後的方向是 -m.dir；順時針 = 方向和該層座標的正負號相反
      const clockwise = -m.dir === -Math.sign(m.layer);
      return clockwise ? face.toLowerCase() : `Shift+${face}`;
    });
  });
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  for (const key of keys) await page.keyboard.press(key);
  await expect(status(page)).toHaveText('solved');
  await expect(page.getByTestId('solved-modal')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('stat-best')).not.toHaveText('—');
  expect(await visualKey(page)).toBe(await logicalKey(page));

  // 再玩一次：直接開始下一局
  await page.getByTestId('btn-play-again').click();
  await expect(page.getByTestId('solved-modal')).toBeHidden();
  await expect(status(page)).toHaveText('ready', { timeout: 20_000 });
  expect(await isSolved(page)).toBe(false);
  expect(await visualKey(page)).toBe(await logicalKey(page));
});

for (const size of [2, 3, 4]) {
  test(`${size}×${size}：開始 → 轉幾步 → 放棄 → 回到完成狀態的待機`, async ({ page }) => {
    test.slow();
    const errors = await openGame(page);
    await page.getByTestId(`size-${size}`).click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { __cubie: CubieDebug }).__cubie.store.getState().cube.size)).toBe(size);
    expect(await visualKey(page)).toBe(await logicalKey(page));

    await startGame(page);
    expect(await isSolved(page)).toBe(false);
    expect(await visualKey(page)).toBe(await logicalKey(page));

    await pressMove(page, 'u');
    await pressMove(page, 'f');
    await pressMove(page, 'Shift+R');
    await expect(page.getByTestId('stat-moves')).toHaveText('3');
    if (size === 3) await giveUpWithKociemba(page, 60_000);
    else await giveUpAndReset(page);
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
  await startGame(page);
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

test('一般玩家的網址不開放鍵盤轉動', async ({ page }) => {
  await page.goto('./');
  await page.waitForFunction(() => Boolean((window as unknown as { __cubie?: { engine?: unknown } }).__cubie?.engine));
  const before = await logicalKey(page);
  await page.keyboard.press('r');
  await page.keyboard.press('Shift+U');
  await page.waitForTimeout(400);
  expect(await logicalKey(page)).toBe(before);
});

test('滑鼠移到方塊上游標變成手掌，按住變成抓住，空白處是一般游標', async ({ page, isMobile }) => {
  test.skip(isMobile, '觸控裝置沒有游標');
  await openGame(page);
  const canvas = page.locator('[data-testid="cube-canvas"] canvas');
  const cursor = () => canvas.evaluate((c) => (c as HTMLElement).style.cursor);
  const front = await page.evaluate(() => (window as unknown as { __cubie: CubieDebug }).__cubie.engine.projectToScreen(0, 0, 1.5));

  await page.mouse.move(front.x, front.y);
  expect(await cursor()).toBe('grab');
  await page.mouse.down();
  expect(await cursor()).toBe('grabbing');
  await page.mouse.up();
  expect(await cursor()).toBe('grab');

  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + 8, box.y + box.height / 2);
  expect(await cursor()).toBe('default');
  await page.mouse.down();
  expect(await cursor()).toBe('move');
  await page.mouse.up();
});
