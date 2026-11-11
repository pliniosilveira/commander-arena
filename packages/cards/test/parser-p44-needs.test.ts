// Stage P44 (M60): a line of the voting slice that the grammar reads whose engine feature is not listed is reported as "recognised, not runnable" naming
// that feature, never built (D-068, D-194, D-195). The engine lists every feature below, so the support check is replaced here by one that lacks one feature
// at a time, and the lowering must name it. The lines are the real Oracle text of Emissary Green (name replaced by ~) and the vote of a spell.
import { describe, expect, test, vi } from 'vitest';

vi.mock('@commander-arena/engine', async (importOriginal) =>
  (await import('./blocked-features')).blockFeatures(
    await importOriginal<typeof import('@commander-arena/engine')>(),
  ),
);

import { BLOCKED } from './blocked-features';
import { read, withoutFeature } from './parser-p5-helpers';

const VOTE_THEN_TREASURES =
  'Starting with you, each player votes for profit or security. You create a number of Treasure tokens equal to twice the number of profit votes.';
const VOTE_THEN_COUNTERS =
  'Starting with you, each player votes for profit or security. Put a number of +1/+1 counters on each creature you control equal to the number of security votes.';

const CASES = [
  ['effect:vote', VOTE_THEN_TREASURES],
  ['amount:votesFor', VOTE_THEN_TREASURES],
  ['amount:multiple', VOTE_THEN_TREASURES],
  ['effect:createToken', VOTE_THEN_TREASURES],
  ['amount:votesFor', VOTE_THEN_COUNTERS],
  ['effect:addCounters', VOTE_THEN_COUNTERS],
] as const;

describe('the lines of the voting slice name the feature the engine lacks (D-194, D-195)', () => {
  test.each(CASES)('without %s: %s', (ref, text) => {
    const missing = withoutFeature(ref, text, 'sorcery');
    expect(missing).toMatchObject({ reason: 'notRunnable' });
    expect(missing.needs).toContain(ref);
  });

  test('a blocked line leaves the spell with no ability (never half-executed)', () => {
    for (const [ref, text] of CASES) {
      BLOCKED.clear();
      BLOCKED.add(ref);
      try {
        const parsed = read(text, 'sorcery');
        expect(parsed.unparsed.length, `${ref}: ${text}`).toBeGreaterThan(0);
        expect(parsed.abilities, `${ref}: ${text}`).toEqual([]);
      } finally {
        BLOCKED.clear();
      }
    }
  });
});
