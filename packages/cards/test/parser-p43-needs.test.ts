// Stage P43 (M59): a line of the Ancient Adamantoise slice that the grammar reads whose engine feature is not listed is reported as "recognised, not
// runnable" naming that feature, never built (D-068, D-192, D-193). The engine lists every feature below, so the support check is replaced here by one
// that lacks one feature at a time, and the lowering must name it. The lines are the real Oracle text of the card (name replaced by ~).
import { describe, expect, test, vi } from 'vitest';

vi.mock('@commander-arena/engine', async (importOriginal) =>
  (await import('./blocked-features')).blockFeatures(
    await importOriginal<typeof import('@commander-arena/engine')>(),
  ),
);

import { BLOCKED } from './blocked-features';
import { read, withoutFeature } from './parser-p5-helpers';

const KEEPS = "Damage isn't removed from ~ during cleanup steps.";
const REDIRECT =
  'All damage that would be dealt to you and other permanents you control is dealt to ~ instead.';

const CASES = [
  ['static:keepsDamage', KEEPS],
  ['ability:static', KEEPS],
  ['replacement:redirectDamage', REDIRECT],
  ['ability:replacement', REDIRECT],
] as const;

describe('the lines of the Ancient Adamantoise slice name the feature the engine lacks (D-192, D-193)', () => {
  test.each(CASES)('without %s: %s', (ref, text) => {
    const missing = withoutFeature(ref, text, 'creature', ['Turtle']);
    expect(missing).toMatchObject({ reason: 'notRunnable' });
    expect(missing.needs).toContain(ref);
  });

  test('a blocked line leaves the face with no ability (never half-executed)', () => {
    for (const [ref, text] of CASES) {
      BLOCKED.clear();
      BLOCKED.add(ref);
      try {
        const parsed = read(text, 'creature', ['Turtle']);
        expect(parsed.unparsed.length, `${ref}: ${text}`).toBeGreaterThan(0);
        expect(parsed.abilities, `${ref}: ${text}`).toEqual([]);
      } finally {
        BLOCKED.clear();
      }
    }
  });
});
