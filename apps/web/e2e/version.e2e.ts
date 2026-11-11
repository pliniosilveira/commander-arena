import { expect, test } from '@playwright/test';

/** Issue 104: the start screen says which app build, engine and card parser the page runs. */
test('the start screen shows the app build, the engine and the card parser versions', async ({
  page,
}) => {
  await page.goto('/');
  const line = page.getByTestId('app-version');
  await expect(line).toBeVisible();
  await expect(line).toHaveText(
    /^Build (dev|[0-9a-f]{7})( \(\d{4}-\d{2}-\d{2}\))? · Engine \d+ · Card parser \d+$/,
  );
});

test('a game screen does not carry the version line', async ({ page }) => {
  await page.goto('/?autostart=white-knights,swamp-forest&seed=7');
  await expect(page.getByText('Your opening hand')).toBeVisible();
  await expect(page.getByTestId('app-version')).toHaveCount(0);
});
