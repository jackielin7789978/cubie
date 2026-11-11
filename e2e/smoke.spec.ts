import { expect, test } from '@playwright/test';

test('頁面可以打開', async ({ page }) => {
  await page.goto('./');
  await expect(page).toHaveTitle('Cubie');
});
