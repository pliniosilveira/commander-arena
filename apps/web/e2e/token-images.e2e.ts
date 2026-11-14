import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { build } from 'vite';

// SYNTHETIC Scryfall answers and SVGs, following images.e2e.ts.
const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="488" height="680"><rect width="488" height="680" fill="gold"/></svg>';
let bundle = '';
const golden = readFileSync(
  new URL('../../../packages/cards/test/fixtures/corpus/golden.jsonl', import.meta.url),
  'utf8',
);

test.beforeAll(async () => {
  const output = await build({
    configFile: false,
    logLevel: 'silent',
    define: { 'process.env.NODE_ENV': '"production"' },
    build: {
      write: false,
      minify: false,
      lib: {
        entry: new URL('./harness/token-images-entry.tsx', import.meta.url).pathname,
        name: 'TokenImages',
        formats: ['iife'],
      },
    },
  });
  for (const result of Array.isArray(output) ? output : [output]) {
    if (!('output' in result)) continue;
    for (const chunk of result.output) {
      if (chunk.type === 'chunk' && chunk.isEntry) bundle = chunk.code;
    }
  }
  if (bundle === '') throw new Error('token image test bundle was not built');
});

for (const mode of ['matched', 'ambiguous', 'offline', 'broken-image'] as const) {
  test(`token tiles, previews and stack keep the frame when needed: ${mode}`, async ({ page }) => {
    const queries: string[] = [];
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('https://api.scryfall.com/cards/search**', (route) => {
      const query = new URL(route.request().url()).searchParams.get('q') ?? '';
      queries.push(query);
      if (mode === 'offline') return route.abort();
      // The live Thopter query also finds Servo // Thopter unless layout:token excludes it.
      const duplicateFace = query.startsWith('!"Thopter"') && !query.includes('layout:token');
      const total = query.includes('Uncatalogued')
        ? 0
        : mode === 'ambiguous' || duplicateFace
          ? 2
          : 1;
      const image_uris = {
        normal: 'https://cards.scryfall.io/normal/token.jpg',
        art_crop: 'https://cards.scryfall.io/art_crop/token.jpg',
      };
      return route.fulfill({
        json: { total_cards: total, has_more: false, data: total === 0 ? [] : [{ image_uris }] },
      });
    });
    await page.route('https://cards.scryfall.io/**', (route) =>
      mode === 'broken-image'
        ? route.abort()
        : route.fulfill({ contentType: 'image/svg+xml', body: SVG }),
    );
    await page.route('https://api.scryfall.com/cards/named**', (route) => route.abort());
    await page.goto('/');
    await page.addScriptTag({ content: bundle });
    await page.evaluate(
      (data) =>
        (window as unknown as { TokenImages: { mount(text: string): void } }).TokenImages.mount(
          data,
        ),
      golden,
    );
    await expect.poll(() => queries.length).toBe(5);
    for (const name of ['Treasure', 'Soldier', 'Thopter', 'stack']) {
      const section = page.locator(`[data-token-test="${name}"]`);
      await expect(section.locator('.board-card-name')).toBeVisible();
      if (mode === 'matched') {
        await expect(section.locator('.board-card-image.is-loaded')).toBeVisible();
        await expect(section.locator('.board-card-art-img.is-loaded')).toBeVisible();
        if (name !== 'stack') {
          await expect(section.locator('.board-tile-art.is-loaded')).toBeVisible();
        }
      } else {
        await expect(section.locator('img.is-loaded')).toHaveCount(0);
      }
    }
    const unknown = page.locator('[data-token-test="Uncatalogued"]');
    await expect(unknown.locator('.board-card-name')).toHaveText('Uncatalogued');
    await expect(unknown.locator('img')).toHaveCount(0);
    expect(queries.filter((q) => q.startsWith('!"Treasure"'))).toHaveLength(1);
    expect(queries.filter((q) => q.startsWith('!"Soldier"'))).toHaveLength(1);
    expect(queries.filter((q) => q.startsWith('!"Thopter"'))).toHaveLength(1);
    expect(queries.some((q) => q.includes('pow=1 tou=1'))).toBe(true);
    expect(errors).toEqual([]);
  });
}
