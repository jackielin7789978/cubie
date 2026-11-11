// 視覺檢查用的正式截圖（SPEC「驗證標準／視覺檢查」）。
// 平常 `npm run verify` 會 skip；要產生截圖時執行：
//   SCREENSHOTS=1 npx playwright test e2e/screenshots.spec.ts
// desktop（Chromium）project 用 setViewportSize 切三種 viewport；iphone（WebKit）project 只截直式三種主題。
import { expect, test } from '@playwright/test';
import type { Page, TestInfo } from '@playwright/test';

interface Move {
  axis: 'x' | 'y' | 'z';
  layer: number;
  dir: number;
}
interface CubieDebug {
  engine: {
    whenIdle(): Promise<void>;
    enqueueMoves(moves: Move[], options: { durationMs: number }): Promise<void>;
  };
}

const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  portrait: { width: 390, height: 844 },
  landscape: { width: 844, height: 390 },
} as const;
type ViewportName = keyof typeof VIEWPORTS;
const VIEWPORT_NAMES = Object.keys(VIEWPORTS) as ViewportName[];
const THEMES = ['classic', 'brand', 'neon'] as const;

test.skip(!process.env.SCREENSHOTS, '只有 SCREENSHOTS=1 時才產生截圖');

// 用真的 GPU 算圖。預設的 headless Chromium 用軟體算圖（SwiftShader），轉動動畫一長就太慢，
// 會觸發 engine 的自動降級把賽博龐克的 bloom 關掉，截到的就不是實機會看到的畫面。WebKit 會忽略這些參數。
test.use({ launchOptions: { args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] } });

const onlyProject = (testInfo: TestInfo, name: string) => test.skip(testInfo.project.name !== name, `只在 ${name} project 跑`);

async function openGame(page: Page, viewport: ViewportName): Promise<void> {
  await page.setViewportSize(VIEWPORTS[viewport]);
  await page.goto('./');
  await page.waitForFunction(() => Boolean((window as unknown as { __cubie?: { engine?: unknown } }).__cubie?.engine));
  await page.evaluate(() => document.fonts.ready);
}

/** 等動畫播完，再多等幾幀讓 renderer 畫出最後的畫面 */
async function settle(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await (window as unknown as { __cubie: CubieDebug }).__cubie.engine.whenIdle();
    for (let i = 0; i < 5; i++) await new Promise((r) => requestAnimationFrame(r));
  });
}

async function setTheme(page: Page, theme: string): Promise<void> {
  await page.getByTestId(`theme-${theme}`).click();
  await expect(page.getByTestId(`theme-${theme}`)).toHaveAttribute('aria-pressed', 'true');
}

async function setSize(page: Page, size: number): Promise<void> {
  await page.getByTestId(`size-${size}`).click();
  await expect(page.getByTestId(`size-${size}`)).toHaveAttribute('aria-pressed', 'true');
}

async function scramble(page: Page): Promise<void> {
  await page.getByTestId('btn-scramble').click();
  await expect(page.getByTestId('game-status')).toHaveText('ready', { timeout: 20_000 });
}

async function shoot(page: Page, name: string): Promise<void> {
  await settle(page);
  // 移開滑鼠，避免 hover 樣式留在按鈕上
  await page.mouse.move(0, 0);
  await page.screenshot({ path: `screenshots/${name}.png` });
}

for (const theme of THEMES) {
  for (const viewport of VIEWPORT_NAMES) {
    test(`${theme} 主題 3×3 打亂後（${viewport}）`, async ({ page }, testInfo) => {
      onlyProject(testInfo, 'desktop');
      await openGame(page, viewport);
      await setTheme(page, theme);
      await scramble(page);
      await shoot(page, `${theme}-${viewport}`);
    });
  }

  test(`${theme} 主題完成狀態（desktop）`, async ({ page }, testInfo) => {
    onlyProject(testInfo, 'desktop');
    await openGame(page, 'desktop');
    await setTheme(page, theme);
    await shoot(page, `${theme}-solved-desktop`);
  });

  test(`${theme} 主題 3×3 打亂後（WebKit 直式）`, async ({ page }, testInfo) => {
    onlyProject(testInfo, 'iphone');
    await openGame(page, 'portrait');
    await setTheme(page, theme);
    await scramble(page);
    await shoot(page, `${theme}-portrait-webkit`);
  });
}

// 比 390 窄的直式手機：切換列不能溢出、按鈕高度仍要 ≥44px
for (const viewport of [
  { width: 320, height: 568 },
  { width: 360, height: 740 },
]) {
  test(`窄直式 ${viewport.width}×${viewport.height} 不溢出`, async ({ page }, testInfo) => {
    onlyProject(testInfo, 'desktop');
    await page.setViewportSize(viewport);
    await page.goto('./');
    await page.waitForFunction(() => Boolean((window as unknown as { __cubie?: { engine?: unknown } }).__cubie?.engine));
    await page.evaluate(() => document.fonts.ready);
    await scramble(page);
    const overflow = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.switchers, .segmented, .segment, .stats, .toolbar, .btn'))
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return r.left < 0 || r.right > window.innerWidth || el.scrollWidth > el.clientWidth + 1;
        })
        .map((el) => el.textContent),
    );
    expect(overflow).toEqual([]);
    const heights = await page.locator('.segment, .btn').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height));
    for (const h of heights) expect(h).toBeGreaterThanOrEqual(44);
    await shoot(page, `classic-portrait-${viewport.width}x${viewport.height}`);
    await setTheme(page, 'neon');
    await shoot(page, `neon-portrait-${viewport.width}x${viewport.height}`);
  });
}

for (const size of [2, 4]) {
  for (const viewport of VIEWPORT_NAMES) {
    test(`${size}×${size} 打亂後（${viewport}）`, async ({ page }, testInfo) => {
      onlyProject(testInfo, 'desktop');
      await openGame(page, viewport);
      await setSize(page, size);
      await scramble(page);
      await shoot(page, `size${size}-${viewport}`);
    });
  }
}

for (const theme of ['classic', 'neon']) {
  for (const viewport of VIEWPORT_NAMES) {
    test(`${theme} 完成畫面（${viewport}）`, async ({ page }, testInfo) => {
      onlyProject(testInfo, 'desktop');
      await openGame(page, viewport);
      await setTheme(page, theme);
      await scramble(page);
      await page.getByTestId('btn-solve').click();
      await expect(page.getByTestId('solved-modal')).toBeVisible({ timeout: 30_000 });
      // 等彈出動畫和大部分彩帶結束
      await page.waitForTimeout(2500);
      await shoot(page, `modal-${theme}-${viewport}`);
    });
  }
}

test('轉層動畫播到一半（desktop）', async ({ page }, testInfo) => {
  onlyProject(testInfo, 'desktop');
  await openGame(page, 'desktop');
  await scramble(page);
  await settle(page);
  // 直接叫 engine 用很慢的速度播一步 R，在中途截圖
  await page.evaluate(() => {
    void (window as unknown as { __cubie: CubieDebug }).__cubie.engine.enqueueMoves([{ axis: 'x', layer: 1, dir: -1 }], {
      durationMs: 4000,
    });
  });
  await page.waitForTimeout(1600);
  await page.mouse.move(0, 0);
  await page.screenshot({ path: 'screenshots/animation-midway-desktop.png' });
});
