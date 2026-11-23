// "~ can't be blocked by creatures with greater power." (Locke, Treasure Hunter; CR 509.1b, 208.1) through the whole pipeline, the near misses the grammar must not read, and the feature the
// lowering needs. The engine runs the same node in packages/engine/test/scenario-xx-block-power.test.ts.
import { describe, expect, test, vi } from 'vitest';

vi.mock('@commander-arena/engine', async (importOriginal) =>
  (await import('./blocked-features')).blockFeatures(
    await importOriginal<typeof import('@commander-arena/engine')>(),
  ),
);

import { read, readAll, withoutFeature } from './parser-p5-helpers';

const TEXT = "~ can't be blocked by creatures with greater power.";

describe("can't be blocked by creatures with greater power", () => {
  test('a static ability: no creature with greater power than the source can block it', () => {
    const [ability] = readAll(TEXT, 'creature', ['Human']).abilities;
    expect(ability?.kind).toBe('static');
    if (ability?.kind !== 'static') return;
    expect(ability.static).toMatchObject({
      kind: 'cantBeBlockedBy',
      subject: { kind: 'this' },
      blockers: { types: ['creature'], powerGreaterThanSource: true },
    });
  });

  test.each([
    "~ can't be blocked by creatures with greater toughness.",
    "~ can't be blocked by creatures with greater power or toughness.",
    "~ can't be blocked by creatures with greater power",
    "~ can't be blocked by creatures with power greater than ~.",
    "~ can't be blocked by creatures with greater powers.",
  ])('another wording is dropped, never half read (SYNTHETIC): %s', (text) => {
    expect(read(text, 'creature').unparsed.length).toBeGreaterThan(0);
  });

  test('without selector:powerGreaterThanSource in the engine the ability is not read', () => {
    expect(
      withoutFeature('selector:powerGreaterThanSource', TEXT, 'creature', ['Human']).reason,
    ).toBeDefined();
  });
});
