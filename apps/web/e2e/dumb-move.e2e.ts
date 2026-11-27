import { expect, test } from '@playwright/test';
import { settled } from './harness/settle';

/**
 * "That was a dumb move" (issue 627): in the game log, the control opens a form that marks an AI move (the latest by default) and
 * builds GitHub's "new issue" address with the labels and the replay. The address is captured instead of opening GitHub.
 */
test('the log offers a dumb move report that builds a labelled GitHub issue', async ({ page }) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => {
    window.open = (u) => {
      (window as unknown as { opened: string }).opened = String(u);
      return null;
    };
  });
  await page.goto('/?autostart=synthetic-hasty-goblins,swamp-forest&seed=1');
  await page.getByRole('button', { name: 'Keep', exact: true }).click();
  await settled(page);

  await page.getByRole('button', { name: 'Log', exact: true }).click();
  const log = page.getByRole('dialog', { name: 'Game log' });
  await log.getByRole('button', { name: 'That was a dumb move' }).click();
  const form = log.getByRole('form', { name: 'Report a dumb move of the AI' });
  await expect(form).toBeVisible();
  await expect(form.getByLabel('Which move?')).toBeVisible();
  // At phone width the form stays inside the log dialog (the board under it keeps its own minimum width).
  await page.setViewportSize({ width: 375, height: 740 });
  const box = await form.boundingBox();
  const frame = await log.boundingBox();
  expect(
    box === null || frame === null ? Number.NaN : frame.x + frame.width - (box.x + box.width),
  ).toBeGreaterThanOrEqual(0);
  await form.getByLabel('What should it have done? (optional)').fill('Mulligan that hand');
  const open = form.getByRole('button', { name: 'Open GitHub issue' });
  await expect(open).toBeEnabled();
  await open.click();

  const opened = await page.evaluate(() => (window as unknown as { opened: string }).opened);
  const url = new URL(opened);
  expect(url.pathname).toBe('/pliniosilveira/commander-arena/issues/new');
  expect(url.searchParams.get('labels')).toBe('ai-report,AI opponent');
  expect(url.searchParams.get('title')).toMatch(/^Dumb move: /);
  const body = url.searchParams.get('body') ?? '';
  expect(body).toContain('Mulligan that hand');
  expect(body).toContain('Game replay for the AI coach');
  await expect(form.getByRole('status')).toContainText('browser blocked the new tab');
});
