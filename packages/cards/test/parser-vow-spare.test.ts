// Issue 89 (Silverquill Influence): Promise of Loyalty, "Each player puts a vow counter on a creature they control and sacrifices the rest. Each of those creatures can't attack you
// or planeswalkers you control for as long as it has a vow counter on it." (CR 608.2d, 701.21a, 122.1, 508.1a, 611.2b), through the whole pipeline, the near misses the grammar must not
// read, and the feature the lowering needs. The engine runs the same node in packages/engine/test/scenario-xx-vow-spare.test.ts.
import { describe, expect, test, vi } from 'vitest';

vi.mock('@commander-arena/engine', async (importOriginal) =>
  (await import('./blocked-features')).blockFeatures(
    await importOriginal<typeof import('@commander-arena/engine')>(),
  ),
);

import { read, readAll, withoutFeature } from './parser-p5-helpers';

const TEXT =
  "Each player puts a vow counter on a creature they control and sacrifices the rest. Each of those creatures can't attack you or planeswalkers you control for as long as it has a vow counter on it.";

describe('Promise of Loyalty', () => {
  test('the real text: the engine sparePermanents of creatures, a counter on each kept, the restriction tied to it', () => {
    expect(readAll(TEXT, 'sorcery').spell?.effect).toEqual({
      kind: 'sparePermanents',
      types: ['creature'],
      own: {
        players: { kind: 'eachPlayer' },
        typesOnly: true,
        counter: 'vow',
        cantAttackYou: true,
      },
    });
  });

  test.each([
    'Each player puts a vow counter on a creature they control and sacrifices the rest.',
    "Each player puts a vow counter on a creature they control and sacrifices the rest. Each of those creatures can't attack you for as long as it has a vow counter on it.",
    "Each player puts a vow counter on a creature they control and sacrifices the rest. Each of those creatures can't attack you or planeswalkers you control.",
    "Each player puts a vow counter on a creature they control and sacrifices the rest. Each of those creatures can't block you or planeswalkers you control for as long as it has a vow counter on it.",
    "Each opponent puts a vow counter on a creature they control and sacrifices the rest. Each of those creatures can't attack you or planeswalkers you control for as long as it has a vow counter on it.",
    "Each player puts a vow counter on a land they control and sacrifices the rest. Each of those creatures can't attack you or planeswalkers you control for as long as it has a vow counter on it.",
  ])('another wording is dropped, never half read (SYNTHETIC): %s', (text) => {
    const parsed = read(text, 'sorcery');
    expect(parsed.spell, text).toBeNull();
    expect(parsed.unparsed, text).not.toHaveLength(0);
  });

  test('with the engine feature unsupported the text is dropped whole', () => {
    const first = withoutFeature('effect:sparePermanents', TEXT, 'sorcery');
    expect(first).toBeDefined();
  });
});
