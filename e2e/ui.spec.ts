// UI 工作線的端對端測試：用 ?mockEngine 的假 engine，只驗證 React UI、store 和控制器的串接。
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

interface MoveLike {
  axis: 'x' | 'y' | 'z';
  layer: number;
  dir: 1 | -1;
}

/** 頁面上 window.__cubie 的形狀（只列測試用到的部分；完整型別在 src/hooks/gameController.ts） */
interface CubieDebug {
  store: { getState(): { cube: unknown; size: number; scrambleMoves: MoveLike[]; history: MoveLike[] } };
  engine: { simulateUserMove(move: MoveLike): void; getState(): unknown } | null;
  controller: { setSolutionProvider(provider: ((state: unknown) => Promise<MoveLike[]> | null) | null): void };
}

declare global {
  interface Window {
    __cubie?: CubieDebug;
    /** 測試注入的延遲解法器：呼叫它才把解法交出去 */
    __releaseSolution?: () => void;
  }
}

const R: MoveLike = { axis: 'x', layer: 1, dir: -1 };

async function openApp(page: Page) {
  await page.goto('./?mockEngine');
  await page.waitForFunction(() => window.__cubie?.engine != null);
}

/** 透過 mock engine 假裝玩家轉了一層 */
async function userMove(page: Page, move: MoveLike) {
  await page.evaluate((m) => window.__cubie!.engine!.simulateUserMove(m), move);
}

const cubeSnapshot = (page: Page) => page.evaluate(() => JSON.stringify(window.__cubie!.store.getState().cube));

const status = (page: Page) => page.getByTestId('game-status');

/** 照「打亂＋玩家轉動」的反向轉回去，模擬玩家自己解完 */
async function solveByHand(page: Page) {
  const solution = await page.evaluate(() => {
    const { scrambleMoves, history } = window.__cubie!.store.getState();
    return [...scrambleMoves, ...history].map((m): MoveLike => ({ ...m, dir: m.dir === 1 ? -1 : 1 })).reverse();
  });
  for (const move of solution) await userMove(page, move);
  return solution.length;
}

/** 按「開始遊戲」，等打亂動畫播完 */
async function startGame(page: Page) {
  await page.getByTestId('btn-start').click();
  await expect(status(page)).toHaveText('ready', { timeout: 15_000 });
}

const KOCIEMBA_MESSAGE = /數學老師 Herbert Kociemba 用 \d+ 步幫你解完了/;

/** 3×3 放棄：確認按鈕是「Kociemba」→ Kociemba 還原播完跳出完成畫面（不算新紀錄）→ 按「關閉」回到待機 */
async function giveUpWithKociemba(page: Page) {
  const button = page.getByTestId('btn-giveup');
  await button.click();
  await expect(button).toHaveText('Kociemba');
  await button.click();
  const modal = page.getByTestId('solved-modal');
  await expect(modal).toBeVisible({ timeout: 30_000 });
  await expect(status(page)).toHaveText('solved');
  await expect(page.getByTestId('modal-message')).toHaveText(KOCIEMBA_MESSAGE);
  await expect(modal).not.toContainText('新紀錄');
  await expect(page.getByTestId('modal-time')).toHaveCount(0);
  await expect(page.getByTestId('stat-best')).toHaveText('—');
  await page.getByTestId('btn-close-modal').click();
  await expect(modal).toBeHidden();
  await expect(status(page)).toHaveText('idle');
  await expect(page.getByTestId('btn-start')).toBeVisible();
}

/** 2×2、4×4 放棄：確認按鈕是「確定放棄？」→ 直接重設回待機，沒有完成畫面 */
async function giveUpAndReset(page: Page) {
  const button = page.getByTestId('btn-giveup');
  await button.click();
  await expect(button).toHaveText('確定放棄？');
  await button.click();
  await expect(status(page)).toHaveText('idle');
  await expect(page.getByTestId('solved-modal')).toHaveCount(0);
  await expect(page.getByTestId('btn-start')).toBeVisible();
  await expect(page.getByTestId('stat-best')).toHaveText('—');
}

/** 尺寸切換是否鎖住 */
async function expectSizeLocked(page: Page, locked: boolean) {
  for (const size of [2, 3, 4]) {
    const segment = page.getByTestId(`size-${size}`);
    if (locked) await expect(segment).toBeDisabled();
    else await expect(segment).toBeEnabled();
  }
  const group = page.getByRole('group', { name: '方塊尺寸' });
  if (locked) {
    await expect(group).toHaveAttribute('aria-disabled', 'true');
    await expect(group).toHaveAttribute('title', '放棄這一局後才能切換尺寸');
    await expect(group).toHaveAccessibleDescription('放棄這一局後才能切換尺寸');
  } else {
    await expect(group).not.toHaveAttribute('aria-disabled', 'true');
  }
}

let consoleErrors: string[] = [];

test.beforeEach(async ({ page }) => {
  consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(`${msg.text()} @ ${JSON.stringify(msg.location())}`);
  });
  page.on('pageerror', (error) => consoleErrors.push(`${error.message}\n${error.stack ?? ''}`));
});

test.afterEach(() => {
  expect(consoleErrors).toEqual([]);
});

test.describe('UI 流程', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page);
  });

  test('待機時只有「開始遊戲」，可以自由轉動，沒有上一步和放棄', async ({ page }) => {
    await expect(page.getByTestId('btn-start')).toBeEnabled();
    await expect(page.getByTestId('btn-undo')).toHaveCount(0);
    await expect(page.getByTestId('btn-giveup')).toHaveCount(0);
    await expectSizeLocked(page, false);

    await userMove(page, R);
    await page.waitForTimeout(300);
    await expect(status(page)).toHaveText('idle');
    await expect(page.getByTestId('stat-moves')).toHaveText('0');
    await expect(page.getByTestId('stat-time')).toHaveText('0:00.00');
    await expect(page.getByTestId('btn-start')).toBeVisible();
  });

  test('開始遊戲 → 轉一步開始計時 → 上一步 → 放棄（按兩次）→ 完成畫面 → 關閉回到待機', async ({ page }) => {
    await startGame(page);
    await expect(page.getByTestId('stat-time')).toHaveText('0:00.00');
    await expect(page.getByTestId('stat-moves')).toHaveText('0');
    await expect(page.getByTestId('btn-start')).toHaveCount(0);
    await expect(page.getByTestId('btn-undo')).toBeDisabled();
    await expect(page.getByTestId('btn-giveup')).toBeEnabled();

    const before = await cubeSnapshot(page);
    await userMove(page, R);
    await expect(status(page)).toHaveText('solving');
    await expect(page.getByTestId('stat-moves')).toHaveText('1');
    await expect(page.getByTestId('stat-time')).not.toHaveText('0:00.00');

    await page.getByTestId('btn-undo').click();
    await expect(page.getByTestId('stat-moves')).toHaveText('2');
    expect(await cubeSnapshot(page)).toBe(before);
    await expect(page.getByTestId('btn-undo')).toBeDisabled();

    await userMove(page, R);
    await giveUpWithKociemba(page);
    await expect(page.getByTestId('stat-time')).toHaveText('0:00.00');
    await expect(page.getByTestId('stat-moves')).toHaveText('0');
    await expect(page.getByTestId('stat-best')).toHaveText('—');
    await expect(page.getByTestId('btn-start')).toBeEnabled();
    const state = await page.evaluate(() => {
      const s = window.__cubie!.store.getState();
      return { history: s.history.length, scramble: s.scrambleMoves.length };
    });
    expect(state).toEqual({ history: 0, scramble: 0 });
    expect(await cubeSnapshot(page)).toBe(await page.evaluate(() => JSON.stringify(window.__cubie!.engine!.getState())));
  });

  test('打亂中「上一步」「放棄」和尺寸切換都停用；遊戲中沒有開始按鈕', async ({ page }) => {
    await page.getByTestId('btn-start').click();
    await expect(status(page)).toHaveText('scrambling');
    await expect(page.getByTestId('btn-start')).toHaveCount(0);
    await expect(page.getByTestId('btn-undo')).toBeDisabled();
    await expect(page.getByTestId('btn-giveup')).toBeDisabled();
    await expectSizeLocked(page, true);
    await expect(status(page)).toHaveText('ready', { timeout: 15_000 });
    await expect(page.getByTestId('btn-giveup')).toBeEnabled();
    await expect(page.getByTestId('btn-start')).toHaveCount(0);
  });

  test('遊戲中尺寸切換被鎖住（按了沒反應）、主題仍可切換；放棄後恢復可用', async ({ page }) => {
    await startGame(page);
    await userMove(page, R);
    await expectSizeLocked(page, true);
    await page.getByTestId('size-2').click({ force: true });
    await expect(page.getByTestId('size-3')).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate(() => window.__cubie!.store.getState().size)).toBe(3);
    await expect(status(page)).toHaveText('solving');
    await expect(page.getByTestId('stat-moves')).toHaveText('1');

    await page.getByTestId('theme-neon').click();
    await expect(page.getByTestId('theme-neon')).toHaveAttribute('aria-pressed', 'true');
    await expect(status(page)).toHaveText('solving');

    await giveUpWithKociemba(page);
    await expectSizeLocked(page, false);
    await page.getByTestId('size-2').click();
    await expect(page.getByTestId('size-2')).toHaveAttribute('aria-pressed', 'true');
  });

  test('放棄第一次按下不會立刻放棄，約 3 秒沒確認就恢復原狀', async ({ page }) => {
    await startGame(page);
    await userMove(page, R);
    const button = page.getByTestId('btn-giveup');
    await button.click();
    await expect(button).toHaveText('Kociemba');
    await expect(button).toHaveAttribute('aria-label', /確定放棄.*Kociemba/);
    await expect(button).toHaveAttribute('data-armed', 'true');
    await page.waitForTimeout(500);
    await expect(status(page)).toHaveText('solving');
    await expect(page.getByTestId('stat-moves')).toHaveText('1');

    await expect(button).toHaveText('放棄', { timeout: 4_000 });
    await expect(button).toHaveAttribute('aria-label', '放棄這一局');
    await expect(status(page)).toHaveText('solving');
  });

  test('放棄第一次按下後，按了別的地方就恢復原狀', async ({ page }) => {
    await startGame(page);
    const button = page.getByTestId('btn-giveup');
    await button.click();
    await expect(button).toHaveText('Kociemba');
    await page.getByTestId('stat-moves').click();
    await expect(button).toHaveText('放棄');
    // 恢復後要重新按兩次才會放棄
    await button.click();
    await expect(status(page)).toHaveText('ready');
  });

  test('玩家自己解完：跳出完成畫面並刷新最佳紀錄，再玩一次會直接開始下一局', async ({ page }) => {
    await startGame(page);
    const moves = await solveByHand(page);

    const modal = page.getByTestId('solved-modal');
    await expect(modal).toBeVisible({ timeout: 15_000 });
    await expect(modal).toContainText('完成');
    await expect(modal).toContainText('新紀錄');
    await expect(page.getByTestId('stat-best')).not.toHaveText('—');
    await expect(page.getByTestId('stat-moves')).toHaveText(String(moves));

    await page.getByTestId('btn-play-again').click();
    await expect(modal).toBeHidden();
    await expect(page.getByTestId('btn-giveup')).toBeVisible();
    await expect(status(page)).toHaveText('ready', { timeout: 15_000 });
  });

  test('放棄後的完成畫面按「再玩一次」直接開始下一局', async ({ page }) => {
    await startGame(page);
    await userMove(page, R);
    const button = page.getByTestId('btn-giveup');
    await button.click();
    await button.click();
    await expect(page.getByTestId('solved-modal')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('modal-message')).toHaveText(KOCIEMBA_MESSAGE);
    await page.getByTestId('btn-play-again').click();
    await expect(page.getByTestId('solved-modal')).toBeHidden();
    await expect(status(page)).toHaveText('ready', { timeout: 15_000 });
    await expect(page.getByTestId('stat-moves')).toHaveText('0');
  });

  test('Kociemba 完成畫面裡的人名是另開新分頁的連結，而且點得到', async ({ page }) => {
    await startGame(page);
    await userMove(page, R);
    const button = page.getByTestId('btn-giveup');
    await button.click();
    await button.click();
    await expect(page.getByTestId('solved-modal')).toBeVisible({ timeout: 30_000 });
    const link = page.getByTestId('link-kociemba');
    await expect(link).toHaveText('Herbert Kociemba');
    await expect(link).toHaveAttribute('href', 'https://kociemba.org/');
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    // 點擊範圍夠大，而且連結中心點真的是連結本身（沒有被其他東西蓋住）
    const box = (await link.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(28);
    const hit = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.getAttribute('data-testid'), [box.x + box.width / 2, box.y + box.height / 2]);
    expect(hit).toBe('link-kociemba');
    expect(await link.evaluate((el) => getComputedStyle(el).pointerEvents)).not.toBe('none');
  });

  test('完成畫面按「關閉」回到待機，可以換尺寸', async ({ page }) => {
    await startGame(page);
    await solveByHand(page);
    await expect(page.getByTestId('solved-modal')).toBeVisible({ timeout: 15_000 });
    await page.getByTestId('btn-close-modal').click();
    await expect(page.getByTestId('solved-modal')).toBeHidden();
    await expect(status(page)).toHaveText('idle');
    await expect(page.getByTestId('btn-start')).toBeEnabled();
    await expectSizeLocked(page, false);
  });

  test('2×2、3×3、4×4 都能開始 → 轉幾步 → 放棄 → 回到完成狀態（3×3 經過 Kociemba 完成畫面，其他直接重設）', async ({ page }) => {
    test.slow(); // 4×4 打亂 40 步＋還原，機器忙的時候會超過預設的 60 秒
    for (const size of [2, 3, 4]) {
      await page.getByTestId(`size-${size}`).click();
      await expect(page.getByTestId(`size-${size}`)).toHaveAttribute('aria-pressed', 'true');
      expect(await page.evaluate(() => window.__cubie!.store.getState().size)).toBe(size);
      await startGame(page);
      const outer = (size - 1) / 2;
      await userMove(page, { axis: 'y', layer: outer, dir: -1 });
      await userMove(page, { axis: 'z', layer: outer, dir: -1 });
      await expect(page.getByTestId('stat-moves')).toHaveText('2');
      if (size === 3) await giveUpWithKociemba(page);
      else await giveUpAndReset(page);
      await expect(page.getByTestId('stat-moves')).toHaveText('0');
      await expect(page.getByTestId('stat-time')).toHaveText('0:00.00');
      expect(await cubeSnapshot(page)).toBe(await page.evaluate(() => JSON.stringify(window.__cubie!.engine!.getState())));
      await expectSizeLocked(page, false);
    }
  });

  test('重新整理後回到待機', async ({ page }) => {
    await startGame(page);
    await userMove(page, R);
    await page.reload();
    await page.waitForFunction(() => window.__cubie?.engine != null);
    await expect(status(page)).toHaveText('idle');
    await expect(page.getByTestId('btn-start')).toBeVisible();
    await expect(page.getByTestId('stat-moves')).toHaveText('0');
  });

  test('切換主題後重新整理仍記得，尺寸也記得', async ({ page }) => {
    await page.getByTestId('theme-neon').click();
    await page.getByTestId('size-4').click();
    await expect(page.locator('html')).toHaveAttribute('data-ui', 'dark');

    await page.reload();
    await page.waitForFunction(() => window.__cubie?.engine != null);
    await expect(page.getByTestId('theme-neon')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('size-4')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('html')).toHaveAttribute('data-ui', 'dark');

    await page.getByTestId('theme-brand').click();
    await page.reload();
    await expect(page.getByTestId('theme-brand')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('html')).toHaveAttribute('data-ui', 'light');
  });

  test('放棄後等解法期間：立刻停表，按鈕顯示「Kociemba 思考中…」', async ({ page }) => {
    // 換成一個要等測試放行才交出解法的解法器，模擬 Kociemba 還在建表
    await page.evaluate(() => {
      window.__cubie!.controller.setSolutionProvider(() => {
        const { scrambleMoves, history } = window.__cubie!.store.getState();
        const solution = [...scrambleMoves, ...history].map((m) => ({ ...m, dir: m.dir === 1 ? -1 : 1 }) as MoveLike).reverse();
        return new Promise((resolve) => (window.__releaseSolution = () => resolve(solution)));
      });
    });
    await startGame(page);
    await userMove(page, R);
    await page.waitForTimeout(150);
    const button = page.getByTestId('btn-giveup');
    await button.click();
    await button.click();
    await expect(button).toHaveText('Kociemba 思考中…');
    await expect(button).toHaveAttribute('aria-busy', 'true');
    await expect(button).toBeDisabled();
    await expect(page.getByTestId('btn-undo')).toBeDisabled();
    const frozen = await page.getByTestId('stat-time').textContent();
    await page.waitForTimeout(400);
    await expect(page.getByTestId('stat-time')).toHaveText(frozen!);
    await page.evaluate(() => window.__releaseSolution!());
    await expect(page.getByTestId('solved-modal')).toBeVisible({ timeout: 15_000 });
  });

  test('放棄確認中按 Esc 或焦點離開按鈕都會取消', async ({ page }) => {
    await startGame(page);
    const button = page.getByTestId('btn-giveup');
    // 用鍵盤操作（WebKit 點按鈕不會讓按鈕取得焦點）
    await button.focus();
    await page.keyboard.press('Enter');
    await expect(button).toHaveAttribute('data-armed', 'true');
    await page.keyboard.press('Escape');
    await expect(button).toHaveText('放棄');
    await expect(button).toHaveAttribute('data-armed', 'false');

    await button.focus();
    await page.keyboard.press('Enter');
    await expect(button).toHaveAttribute('data-armed', 'true');
    await button.evaluate((el) => (el as HTMLElement).blur());
    await expect(button).toHaveText('放棄');
    await expect(status(page)).toHaveText('ready');
  });

  test('完成彈窗有焦點陷阱，關閉後焦點回到「開始遊戲」', async ({ page }) => {
    await startGame(page);
    await solveByHand(page);
    const modal = page.getByTestId('solved-modal');
    await expect(modal).toBeVisible({ timeout: 15_000 });
    const focused = () => page.evaluate(() => document.activeElement?.getAttribute('data-testid'));
    await expect.poll(focused).toBe('btn-play-again');
    await page.keyboard.press('Tab');
    expect(await focused()).toBe('btn-close-modal');
    await page.keyboard.press('Tab');
    expect(await focused()).toBe('btn-play-again');
    await page.keyboard.press('Shift+Tab');
    expect(await focused()).toBe('btn-close-modal');
    await page.keyboard.press('Enter');
    await expect(modal).toBeHidden();
    await expect.poll(focused).toBe('btn-start');
  });

  test('無障礙標示：方塊區有 role=img 和隨尺寸變的說明，測試用的狀態元素對螢幕閱讀器隱藏', async ({ page }) => {
    const stage = page.getByTestId('cube-canvas');
    await expect(stage).toHaveAttribute('role', 'img');
    await expect(stage).toHaveAttribute('aria-label', '3×3 魔術方塊，拖曳方塊轉動一層，拖曳空白處旋轉視角');
    await page.getByTestId('size-2').click();
    await expect(stage).toHaveAttribute('aria-label', /^2×2 魔術方塊/);
    await expect(status(page)).toHaveAttribute('aria-hidden', 'true');
  });

  test('頁面不能捲動，按鈕觸控範圍至少 44px', async ({ page }) => {
    const overflow = await page.evaluate(() => ({
      scrollW: document.documentElement.scrollWidth - window.innerWidth,
      scrollH: document.documentElement.scrollHeight - window.innerHeight,
    }));
    expect(overflow.scrollW).toBeLessThanOrEqual(0);
    expect(overflow.scrollH).toBeLessThanOrEqual(0);
    const checkHeights = async () => {
      for (const button of await page.locator('button').all()) {
        const box = await button.boundingBox();
        expect(box!.height).toBeGreaterThanOrEqual(44);
      }
    };
    await checkHeights();
    await startGame(page);
    await checkHeights();
  });
});

// 視覺檢查用的截圖：UI_SCREENSHOTS=1 PORT=5182 npx playwright test e2e/ui.spec.ts --project=desktop -g 截圖
const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'portrait', width: 390, height: 844 },
  { name: 'landscape', width: 844, height: 390 },
];

test.describe('截圖', () => {
  test.skip(!process.env.UI_SCREENSHOTS, '只有設定 UI_SCREENSHOTS 時才截圖');

  for (const vp of VIEWPORTS) {
    test(`三種主題與完成畫面 ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await openApp(page);
      for (const theme of ['classic', 'brand', 'neon']) {
        await page.getByTestId(`theme-${theme}`).click();
        await startGame(page);
        await userMove(page, R);
        await page.waitForTimeout(600);
        await page.screenshot({ path: `screenshots/ui/${theme}-${vp.name}.png` });
        await solveByHand(page);
        await expect(page.getByTestId('solved-modal')).toBeVisible({ timeout: 15_000 });
        await page.waitForTimeout(400);
        if (theme !== 'brand') await page.screenshot({ path: `screenshots/ui/modal-${theme}-${vp.name}.png` });
        await page.getByTestId('btn-close-modal').click();
      }
    });
  }
});
