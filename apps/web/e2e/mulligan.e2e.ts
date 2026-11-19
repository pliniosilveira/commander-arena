import { expect, test } from '@playwright/test';

test('the first mulligan is free: keep seven cards and play on', async ({ page }) => {
  await page.goto('/?autostart=white-knights,swamp-forest&seed=7');
  await page.getByRole('button', { name: 'Mulligan', exact: true }).click();
  await expect(page.getByText(/Mulligans taken: 1/)).toBeVisible();
  await expect(page.getByText(/no cards go to the bottom/i)).toBeVisible();
  await page.getByRole('button', { name: 'Keep', exact: true }).click();
  await expect(page.locator('[data-dec-primary]')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/to the bottom of your library/i)).toHaveCount(0);
});

test('without the free mulligan, keeping bottoms a card and the dialog says how', async ({
  page,
}) => {
  await page.goto('/?autostart=white-knights,swamp-forest&seed=7&freeMulligan=0');
  await page.getByRole('button', { name: 'Mulligan', exact: true }).click();
  await page.getByRole('button', { name: 'Keep', exact: true }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Put 1 card on the bottom');
  await expect(dialog).toContainText(/Click the card below to choose/i);
  const confirm = dialog.getByRole('button', { name: 'Confirm' });
  await expect(confirm).toBeDisabled();
  await dialog.locator('button[aria-pressed]').first().click();
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect(page.locator('[data-dec-primary]')).toBeVisible({ timeout: 15_000 });
});
