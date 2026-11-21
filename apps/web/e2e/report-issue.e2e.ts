import { expect, test } from '@playwright/test';
import { settled } from './harness/settle';

/** The "Report issue" button (bottom right): a dialog with a text area; Submit opens a GitHub "new issue" page with the log and the stack. */
test('Report issue opens a dialog and Submit opens a prefilled GitHub issue', async ({ page }) => {
  test.setTimeout(120_000);
  // A fake screen capture (a canvas stream) and a clipboard that records the image; the address is captured instead of opening GitHub.
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.addInitScript(() => {
    navigator.mediaDevices.getDisplayMedia = async () => {
      const c = document.createElement('canvas');
      c.width = 320;
      c.height = 200;
      const g = c.getContext('2d');
      if (g !== null) {
        g.fillStyle = '#c33';
        g.fillRect(0, 0, 320, 200);
      }
      return c.captureStream(10);
    };
  });
  await page.addInitScript(() => {
    window.open = (u) => {
      (window as unknown as { opened: string }).opened = String(u);
      return null;
    };
  });
  await page.goto('/?autostart=synthetic-hasty-goblins,swamp-forest&seed=1');
  await page.getByRole('button', { name: 'Keep', exact: true }).click();
  await settled(page);

  await page.getByRole('button', { name: 'Report issue' }).click();
  const dialog = page.getByRole('dialog', { name: 'Report an issue' });
  await expect(dialog).toBeVisible();
  if (process.env.REPORT_SHOT) await page.screenshot({ path: process.env.REPORT_SHOT });
  await dialog.getByRole('textbox').fill('Something broke\nmore detail');

  await dialog.getByRole('button', { name: 'Submit' }).click();
  const opened = await page.evaluate(() => (window as unknown as { opened: string }).opened);
  const url = new URL(opened);
  expect(url.pathname).toBe('/pliniosilveira/commander-arena/issues/new');
  expect(url.searchParams.get('title')).toBe('Issue: Something broke');
  const body = url.searchParams.get('body') ?? '';
  expect(body).toContain('### Stack (top first)');
  expect(body).toContain('### Game log');
  const types = await page.evaluate(async () => {
    const items = await navigator.clipboard.read();
    return items.flatMap((i) => [...i.types]);
  });
  expect(types).toContain('image/png');
  expect(body).toContain('paste it here');
  await expect(dialog).toContainText('screenshot of the board is on your clipboard');
});
