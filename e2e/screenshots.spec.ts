// 視覺檢查用的正式截圖（SPEC「驗證標準／視覺檢查」）。
// 平常 `npm run verify` 會 skip；要產生截圖時執行：
//   SCREENSHOTS=1 PORT=5185 npx playwright test e2e/screenshots.spec.ts
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
  store: { getState(): { scrambleMoves: Move[]; history: Move[] } };
  controller: {
    handleUserMove(move: Move): void;
    setSolutionProvider(provider: ((state: unknown) => Promise<Move[]> | null) | null): void;
  };
}

const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  portrait: { width: 390, height: 844 },
  landscape: { width: 844, height: 390 },
  narrow: { width: 320, height: 568 },
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
  await page.goto('./?testKeys');
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

/** 按「開始遊戲」，等打亂動畫播完 */
async function startGame(page: Page): Promise<void> {
  await page.getByTestId('btn-start').click();
  await expect(page.getByTestId('game-status')).toHaveText('ready', { timeout: 20_000 });
}

/** 假裝玩家轉了幾步（畫面和邏輯一起轉），讓計時開始、「上一步」可以按 */
async function playMoves(page: Page, moves: Move[]): Promise<void> {
  await page.evaluate((list) => {
    const { engine, controller } = (window as unknown as { __cubie: CubieDebug }).__cubie;
    for (const move of list) {
      void engine.enqueueMoves([move], { durationMs: 80 });
      controller.handleUserMove(move);
    }
  }, moves);
}

/** 照「打亂＋玩家轉動」的反向轉回去，模擬玩家自己解完 */
async function solveByHand(page: Page): Promise<void> {
  const moves = await page.evaluate(() => {
    const { scrambleMoves, history } = (window as unknown as { __cubie: CubieDebug }).__cubie.store.getState();
    return [...scrambleMoves, ...history].map((m) => ({ ...m, dir: -m.dir })).reverse();
  });
  // 第一步開始計時，隔一下再轉完，截圖上的成績才不是 0 秒
  await playMoves(page, moves.slice(0, 1));
  await page.waitForTimeout(1500);
  await playMoves(page, moves.slice(1));
}

/** 按第一次「放棄」，停在確認狀態（3×3 是「Kociemba」，2×2、4×4 是「確定放棄？」） */
async function armGiveUp(page: Page, confirmText = 'Kociemba'): Promise<void> {
  await page.getByTestId('btn-giveup').click();
  await expect(page.getByTestId('btn-giveup')).toHaveText(confirmText);
}

const R: Move = { axis: 'x', layer: 1, dir: -1 };

async function shoot(page: Page, name: string): Promise<void> {
  await settle(page);
  // 移開滑鼠，避免 hover 樣式留在按鈕上（不用 mouse.move 以外的方式，避免觸發「點別的地方」取消放棄確認）
  await page.mouse.move(0, 0);
  await page.screenshot({ path: `screenshots/${name}.png` });
}

/** 浮層有沒有超出畫面或互相重疊；按鈕高度 ≥44px */
async function expectNoOverflow(page: Page): Promise<void> {
  const problems = await page.evaluate(() => {
    const out: string[] = [];
    const els = Array.from(document.querySelectorAll<HTMLElement>('.switchers, .segmented, .segment, .stats, .toolbar, .btn'));
    for (const el of els) {
      const r = el.getBoundingClientRect();
      if (r.left < 0 || r.right > window.innerWidth || r.top < 0 || r.bottom > window.innerHeight) out.push(`超出畫面：${el.className}`);
      if (el.scrollWidth > el.clientWidth + 1) out.push(`內容溢出：${el.className} ${el.textContent}`);
    }
    const blocks = Array.from(document.querySelectorAll<HTMLElement>('.title, .switchers > *, .stats, .toolbar'));
    for (let i = 0; i < blocks.length; i++) {
      for (let j = i + 1; j < blocks.length; j++) {
        const a = blocks[i].getBoundingClientRect();
        const b = blocks[j].getBoundingClientRect();
        if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) out.push(`重疊：${blocks[i].className} / ${blocks[j].className}`);
      }
    }
    return out;
  });
  expect(problems).toEqual([]);
  const heights = await page.locator('.segment, .btn').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height));
  for (const h of heights) expect(h).toBeGreaterThanOrEqual(44);
}

for (const theme of THEMES) {
  for (const viewport of VIEWPORT_NAMES) {
    test(`${theme} 主題 3×3 遊戲中（${viewport}）`, async ({ page }, testInfo) => {
      onlyProject(testInfo, 'desktop');
      await openGame(page, viewport);
      await setTheme(page, theme);
      await startGame(page);
      await playMoves(page, [R]);
      await expectNoOverflow(page);
      await shoot(page, `${theme}-${viewport}`);
    });
  }

  test(`${theme} 主題 3×3 遊戲中（WebKit 直式）`, async ({ page }, testInfo) => {
    onlyProject(testInfo, 'iphone');
    await openGame(page, 'portrait');
    await setTheme(page, theme);
    await startGame(page);
    await playMoves(page, [R]);
    await shoot(page, `${theme}-portrait-webkit`);
  });
}

// 待機（方塊是完成狀態，只有「開始遊戲」）
for (const theme of THEMES) {
  for (const viewport of VIEWPORT_NAMES) {
    test(`${theme} 待機（${viewport}）`, async ({ page }, testInfo) => {
      onlyProject(testInfo, 'desktop');
      await openGame(page, viewport);
      await setTheme(page, theme);
      await expectNoOverflow(page);
      await shoot(page, `idle-${theme}-${viewport}`);
    });
  }
}

// 放棄確認中的按鈕：經典（淺色）和賽博龐克（深色）各一組
for (const theme of ['classic', 'neon']) {
  for (const viewport of VIEWPORT_NAMES) {
    test(`${theme} 放棄確認中（${viewport}）`, async ({ page }, testInfo) => {
      onlyProject(testInfo, 'desktop');
      await openGame(page, viewport);
      await setTheme(page, theme);
      await startGame(page);
      await playMoves(page, [R]);
      await settle(page);
      await armGiveUp(page);
      await expectNoOverflow(page);
      await shoot(page, `giveup-armed-${theme}-${viewport}`);
    });
  }
}

// 比 390 窄的直式手機：切換列不能溢出、按鈕高度仍要 ≥44px（待機和遊戲中都要檢查）
for (const viewport of [
  { width: 320, height: 568 },
  { width: 360, height: 740 },
]) {
  test(`窄直式 ${viewport.width}×${viewport.height} 不溢出`, async ({ page }, testInfo) => {
    onlyProject(testInfo, 'desktop');
    await page.setViewportSize(viewport);
    await page.goto('./?testKeys');
    await page.waitForFunction(() => Boolean((window as unknown as { __cubie?: { engine?: unknown } }).__cubie?.engine));
    await page.evaluate(() => document.fonts.ready);
    await expectNoOverflow(page);
    await startGame(page);
    await expectNoOverflow(page);
    await shoot(page, `classic-portrait-${viewport.width}x${viewport.height}`);
    await setTheme(page, 'neon');
    await armGiveUp(page);
    await expectNoOverflow(page);
    await shoot(page, `neon-portrait-${viewport.width}x${viewport.height}`);
  });
}

// 以前桌機版和直式版之間的缺口（寬度不到 760、高度又大於 540）：遊戲中、放棄確認中都不能超出畫面
for (const viewport of [
  { width: 600, height: 541 },
  { width: 700, height: 600 },
  { width: 760, height: 600 },
  { width: 720, height: 900 },
]) {
  test(`中間尺寸 ${viewport.width}×${viewport.height} 不溢出`, async ({ page }, testInfo) => {
    onlyProject(testInfo, 'desktop');
    await page.setViewportSize(viewport);
    await page.goto('./?testKeys');
    await page.waitForFunction(() => Boolean((window as unknown as { __cubie?: { engine?: unknown } }).__cubie?.engine));
    await page.evaluate(() => document.fonts.ready);
    await expectNoOverflow(page);
    await startGame(page);
    await playMoves(page, [R]);
    await settle(page);
    await expectNoOverflow(page);
    await expect(page.getByTestId('btn-giveup')).toBeVisible();
    await shoot(page, `classic-${viewport.width}x${viewport.height}`);
    await armGiveUp(page);
    await expectNoOverflow(page);
    await shoot(page, `giveup-armed-classic-${viewport.width}x${viewport.height}`);
  });
}

// 放棄後等 Kociemba 算解：按鈕顯示「Kociemba 思考中…」、時間停住（用一個不會回應的解法器卡在這個狀態）
for (const theme of ['classic', 'neon']) {
  for (const viewport of ['desktop', 'portrait', 'landscape', 'narrow'] as const) {
    test(`${theme} Kociemba 思考中（${viewport}）`, async ({ page }, testInfo) => {
      onlyProject(testInfo, 'desktop');
      await openGame(page, viewport);
      await setTheme(page, theme);
      await page.evaluate(() =>
        (window as unknown as { __cubie: CubieDebug }).__cubie.controller.setSolutionProvider(() => new Promise<Move[]>(() => {})),
      );
      await startGame(page);
      await playMoves(page, [R]);
      await page.waitForTimeout(1200);
      await settle(page);
      await armGiveUp(page);
      await page.getByTestId('btn-giveup').click();
      await expect(page.getByTestId('btn-giveup')).toHaveText('Kociemba 思考中…');
      await expectNoOverflow(page);
      await shoot(page, `giveup-thinking-${theme}-${viewport}`);
    });
  }
}

for (const size of [2, 4]) {
  for (const viewport of VIEWPORT_NAMES) {
    test(`${size}×${size} 打亂後（${viewport}）`, async ({ page }, testInfo) => {
      onlyProject(testInfo, 'desktop');
      await openGame(page, viewport);
      await setSize(page, size);
      await startGame(page);
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
      await startGame(page);
      await solveByHand(page);
      await expect(page.getByTestId('solved-modal')).toBeVisible({ timeout: 30_000 });
      // 等彈出動畫和大部分彩帶結束
      await page.waitForTimeout(2500);
      await shoot(page, `modal-${theme}-${viewport}`);
    });
  }
}

/** 3×3 放棄（按兩次），等 Kociemba 還原播完、完成畫面出現 */
async function giveUpToModal(page: Page): Promise<void> {
  await armGiveUp(page);
  await page.getByTestId('btn-giveup').click();
  await expect(page.getByTestId('solved-modal')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('modal-message')).toHaveText(/數學老師 Herbert Kociemba 用 \d+ 步幫你解完了/);
  // 等彈出動畫和大部分彩帶結束
  await page.waitForTimeout(2500);
}

/** 完成畫面整個在畫面裡、文案沒有溢出 */
async function expectModalFits(page: Page): Promise<void> {
  const problems = await page.evaluate(() => {
    const out: string[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('.modal, .modal-title, .modal-link, .modal-actions .btn'))) {
      const r = el.getBoundingClientRect();
      if (r.left < 0 || r.right > window.innerWidth || r.top < 0 || r.bottom > window.innerHeight) out.push(`超出畫面：${el.className}`);
      if (el.scrollWidth > el.clientWidth + 1) out.push(`內容溢出：${el.className}`);
    }
    return out;
  });
  expect(problems).toEqual([]);
}

// 3×3 放棄後 Kociemba 的完成畫面（人名是連結）
for (const theme of ['classic', 'neon']) {
  for (const viewport of VIEWPORT_NAMES) {
    test(`${theme} Kociemba 完成畫面（${viewport}）`, async ({ page }, testInfo) => {
      onlyProject(testInfo, 'desktop');
      await openGame(page, viewport);
      await setTheme(page, theme);
      await startGame(page);
      await playMoves(page, [R]);
      await settle(page);
      await giveUpToModal(page);
      await expectModalFits(page);
      await shoot(page, `giveup-modal-${theme}-${viewport}`);
    });
  }
}

// 2×2 的「確定放棄？」確認按鈕（沒有 Kociemba）
for (const viewport of ['desktop', 'portrait', 'narrow', 'landscape'] as const) {
  test(`2×2 放棄確認中（${viewport}）`, async ({ page }, testInfo) => {
    onlyProject(testInfo, 'desktop');
    await openGame(page, viewport);
    await setSize(page, 2);
    await startGame(page);
    await playMoves(page, [{ axis: 'y', layer: 0.5, dir: -1 }]);
    await settle(page);
    await armGiveUp(page, '確定放棄？');
    await expectNoOverflow(page);
    await shoot(page, `giveup-armed-size2-${viewport}`);
  });
}

test('轉層動畫播到一半（desktop）', async ({ page }, testInfo) => {
  onlyProject(testInfo, 'desktop');
  await openGame(page, 'desktop');
  await startGame(page);
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
