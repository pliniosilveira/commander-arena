// Stage P42 (M57): a line of the Korvold deck's control-change slice that the grammar reads whose engine feature is not listed is reported as "recognised,
// not runnable" naming that feature, never built (D-068, D-189, D-190). The engine lists every feature below, so the support check is replaced here by one
// that lacks one feature at a time, and the lowering must name it. The line is the real Oracle text of the card (name replaced by ~).
import { describe, expect, test, vi } from 'vitest';

vi.mock('@commander-arena/engine', async (importOriginal) =>
  (await import('./blocked-features')).blockFeatures(
    await importOriginal<typeof import('@commander-arena/engine')>(),
  ),
);

import { BLOCKED } from './blocked-features';
import { read, withoutFeature } from './parser-p5-helpers';

const NABBER =
  'Whenever an opponent taps an artifact for mana, gain control of that artifact until the end of your next turn.';

const CASES = [
  ['trigger:tapsForMana', NABBER, 'creature'],
  ['effect:gainControl', NABBER, 'creature'],
  ['effect:gainControl', 'Gain control of target creature until end of turn.', 'sorcery'],
] as const;

describe('the lines of the Korvold slice 8a name the feature the engine lacks (D-189, D-190)', () => {
  test.each(CASES)('without %s: %s', (ref, text, type) => {
    const missing = withoutFeature(ref, text, type, []);
    expect(missing).toMatchObject({ reason: 'notRunnable' });
    expect(missing.needs).toContain(ref);
  });

  test('a blocked line leaves the face with no ability (never half-executed)', () => {
    for (const [ref, text, type] of CASES) {
      BLOCKED.clear();
      BLOCKED.add(ref);
      try {
        const parsed = read(text, type, []);
        expect(parsed.unparsed.length, `${ref}: ${text}`).toBeGreaterThan(0);
      } finally {
        BLOCKED.clear();
      }
    }
  });
});
