// The Niv-Mizzet deck (issue 25), group 2b-a (D-331 to D-333): a line the grammar reads whose engine feature is not listed is reported as "recognised, not
// runnable" naming that feature, never built (D-068). The engine lists every feature below, so the support check is replaced here by one that lacks one
// feature at a time, and the lowering must name it. The lines are the real Oracle text of the golden corpus (names replaced by ~).
import { describe, expect, test, vi } from 'vitest';

vi.mock('@commander-arena/engine', async (importOriginal) =>
  (await import('./blocked-features')).blockFeatures(
    await importOriginal<typeof import('@commander-arena/engine')>(),
  ),
);

import { DECLARED_NEEDS } from '../src/convert/parser/index';
import { BLOCKED } from './blocked-features';
import { read, withoutFeature } from './parser-p5-helpers';

const CASES = [
  [
    'condition:cardsInLibrary',
    'As long as there are no cards in your library, ~ has base power and toughness 10/10 and has flying and vigilance.',
    'creature',
  ],
  [
    'condition:cardsInLibrary',
    'If you would draw a card while your library has no cards in it, skip that draw instead.',
    'creature',
  ],
  [
    'replacement:skipDraw',
    'If you would draw a card while your library has no cards in it, skip that draw instead.',
    'creature',
  ],
  ['replacement:skipDraw', 'If you would draw a card, skip that draw instead.', 'artifact'],
  [
    'trigger:noncombatDamageDealt',
    'Whenever a source you control deals noncombat damage to an opponent, you draw that many cards.',
    'creature',
  ],
] as const;

describe('the lines of the two primitives name the feature the engine lacks (D-068)', () => {
  test.each(CASES)('without %s: %s', (ref, text, type) => {
    const missing = withoutFeature(ref, text, type);
    expect(missing).toMatchObject({ reason: 'notRunnable' });
    expect(missing.needs).toContain(ref);
  });

  test('a blocked line leaves the face with no ability (never half-executed)', () => {
    for (const [ref, text, type] of CASES) {
      BLOCKED.clear();
      BLOCKED.add(ref);
      try {
        const parsed = read(text, type);
        expect(parsed.abilities, `${ref}: ${text}`).toEqual([]);
      } finally {
        BLOCKED.clear();
      }
    }
  });

  test('every feature the lowerings of this slice name is declared', () => {
    for (const ref of [
      'condition:cardsInLibrary',
      'replacement:skipDraw',
      'trigger:noncombatDamageDealt',
    ] as const) {
      expect(DECLARED_NEEDS, ref).toContain(ref);
    }
  });
});
