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
  engine: { simulateUserMove(move: MoveLike): void } | null;
}

declare global {
  interface Window {
    __cubie?: CubieDebug;
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

async function scramble(page: Page) {
  await page.getByTestId('btn-scramble').click();
  await expect(status(page)).toHaveText('ready', { timeout: 15_000 });
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

  test('打亂 → 轉一步開始計時 → 上一步 → 自動還原跳出完成畫面', async ({ page }) => {
    await expect(page.getByTestId('stat-time')).toHaveText('0:00.00');
    await expect(page.getByTestId('btn-solve')).toBeDisabled();

    await scramble(page);
    await expect(page.getByTestId('stat-time')).toHaveText('0:00.00');
    await expect(page.getByTestId('stat-moves')).toHaveText('0');
    await expect(page.getByTestId('btn-solve')).toBeEnabled();

    const before = await cubeSnapshot(page);
    await userMove(page, R);
    await expect(status(page)).toHaveText('solving');
    await expect(page.getByTestId('stat-moves')).toHaveText('1');
    await expect(page.getByTestId('stat-time')).not.toHaveText('0:00.00');

    await page.getByTestId('btn-undo').click();
    await expect(page.getByTestId('stat-moves')).toHaveText('2');
    expect(await cubeSnapshot(page)).toBe(before);
    await expect(page.getByTestId('btn-undo')).toBeDisabled();

    await page.getByTestId('btn-solve').click();
    const modal = page.getByTestId('solved-modal');
    await expect(modal).toBeVisible({ timeout: 15_000 });
    await expect(modal).toContainText('自動還原完成');
    await expect(modal).not.toContainText('新紀錄');
    await expect(status(page)).toHaveText('solved');
    await expect(page.getByTestId('stat-best')).toHaveText('—');

    await page.getByTestId('btn-close-modal').click();
    await expect(modal).toBeHidden();
    await expect(status(page)).toHaveText('idle');
    await expect(page.getByTestId('btn-solve')).toBeDisabled();
  });

  test('打亂中三個按鈕都停用', async ({ page }) => {
    await page.getByTestId('btn-scramble').click();
    await expect(status(page)).toHaveText('scrambling');
    for (const id of ['btn-scramble', 'btn-undo', 'btn-solve', 'size-2']) {
      await expect(page.getByTestId(id)).toBeDisabled();
    }
    await expect(status(page)).toHaveText('ready', { timeout: 15_000 });
    await expect(page.getByTestId('btn-scramble')).toBeEnabled();
  });

  test('玩家自己解完：跳出完成畫面並刷新最佳紀錄，再玩一次會重新打亂', async ({ page }) => {
    await scramble(page);
    const moves = await solveByHand(page);

    const modal = page.getByTestId('solved-modal');
    await expect(modal).toBeVisible({ timeout: 15_000 });
    await expect(modal).toContainText('完成');
    await expect(modal).toContainText('新紀錄');
    await expect(page.getByTestId('stat-best')).not.toHaveText('—');
    await expect(page.getByTestId('stat-moves')).toHaveText(String(moves));

    await page.getByTestId('btn-play-again').click();
    await expect(modal).toBeHidden();
    await expect(status(page)).toHaveText('ready', { timeout: 15_000 });
  });

  test('切換 2×2、4×4 都能打亂和自動還原', async ({ page }) => {
    test.slow(); // 4×4 打亂 40 步＋還原，機器忙的時候會超過預設的 60 秒
    for (const size of [2, 4]) {
      await page.getByTestId(`size-${size}`).click();
      await expect(page.getByTestId(`size-${size}`)).toHaveAttribute('aria-pressed', 'true');
      expect(await page.evaluate(() => window.__cubie!.store.getState().size)).toBe(size);
      await scramble(page);
      await page.getByTestId('btn-solve').click();
      await expect(page.getByTestId('solved-modal')).toBeVisible({ timeout: 30_000 });
      await page.getByTestId('btn-close-modal').click();
    }
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

  test('頁面不能捲動，按鈕觸控範圍至少 44px', async ({ page }) => {
    const overflow = await page.evaluate(() => ({
      scrollW: document.documentElement.scrollWidth - window.innerWidth,
      scrollH: document.documentElement.scrollHeight - window.innerHeight,
    }));
    expect(overflow.scrollW).toBeLessThanOrEqual(0);
    expect(overflow.scrollH).toBeLessThanOrEqual(0);
    for (const button of await page.locator('button').all()) {
      const box = await button.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
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
        await scramble(page);
        await userMove(page, R);
        await page.waitForTimeout(600);
        await page.screenshot({ path: `screenshots/ui/${theme}-${vp.name}.png` });
        // 經典：玩家自己解完（新紀錄）；其他：自動還原
        if (theme === 'classic') await solveByHand(page);
        else await page.getByTestId('btn-solve').click();
        await expect(page.getByTestId('solved-modal')).toBeVisible({ timeout: 15_000 });
        await page.waitForTimeout(400);
        if (theme !== 'brand') await page.screenshot({ path: `screenshots/ui/modal-${theme}-${vp.name}.png` });
        await page.getByTestId('btn-close-modal').click();
      }
    });
  }
});
