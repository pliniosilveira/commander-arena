// Stage P45 (M61): a line of the Ring slice that the grammar reads whose engine feature is not listed is reported as "recognised, not runnable" naming that
// feature, never built (D-068, D-196, D-197). The engine lists every feature below, so the support check is replaced here by one that lacks one feature
// at a time, and the lowering must name it. The lines are the real Oracle text of There and Back Again (name replaced by ~) and its siblings.
import { describe, expect, test, vi } from 'vitest';

vi.mock('@commander-arena/engine', async (importOriginal) =>
  (await import('./blocked-features')).blockFeatures(
    await importOriginal<typeof import('@commander-arena/engine')>(),
  ),
);

import { BLOCKED } from './blocked-features';
import { read, withoutFeature } from './parser-p5-helpers';

const RING = 'The Ring tempts you.';
const WHENEVER = 'Whenever the Ring tempts you, draw a card.';
const IF_BEARER = 'Whenever ~ attacks, if you control your Ring-bearer, draw a card.';
const WHILE = "When ~ enters, target creature can't block for as long as you control ~.";

const CASES = [
  ['effect:ringTempts', RING, 'sorcery'],
  ['trigger:ringTempted', WHENEVER, 'creature'],
  ['condition:controlsRingBearer', IF_BEARER, 'creature'],
  ['effect:restrict', WHILE, 'creature'],
  ['duration:forAsLongAsYouControlThis', WHILE, 'creature'],
  ['token:custom', 'Create Smaug, a legendary 6/6 red Dragon creature token.', 'sorcery'],
] as const;

describe('the lines of the Ring slice name the feature the engine lacks (D-196, D-197)', () => {
  test.each(CASES)('without %s: %s', (ref, text, type) => {
    const missing = withoutFeature(ref, text, type);
    expect(missing).toMatchObject({ reason: 'notRunnable' });
    expect(missing.needs).toContain(ref);
  });

  test('a blocked line leaves the ability with nothing (never half-executed)', () => {
    for (const [ref, text, type] of CASES) {
      BLOCKED.clear();
      BLOCKED.add(ref);
      try {
        const parsed = read(text, type);
        expect(parsed.unparsed.length, `${ref}: ${text}`).toBeGreaterThan(0);
        expect(parsed.abilities, `${ref}: ${text}`).toEqual([]);
        expect(parsed.spell ?? null, `${ref}: ${text}`).toBeNull();
      } finally {
        BLOCKED.clear();
      }
    }
  });
});
