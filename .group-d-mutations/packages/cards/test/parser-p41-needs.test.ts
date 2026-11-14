// Stage P41 (M56): a line of the Korvold deck's expensive singles that the grammar reads whose engine feature is not listed is reported as "recognised,
// not runnable" naming that feature, never built (D-068, D-187, D-188). The engine lists every feature below, so the support check is replaced here by one
// that lacks one feature at a time, and the lowering must name it. The lines are the real Oracle text of the cards (names replaced by ~).
import { describe, expect, test, vi } from 'vitest';

vi.mock('@commander-arena/engine', async (importOriginal) =>
  (await import('./blocked-features')).blockFeatures(
    await importOriginal<typeof import('@commander-arena/engine')>(),
  ),
);

import { BLOCKED } from './blocked-features';
import { read, withoutFeature } from './parser-p5-helpers';

const ATTACK =
  'Whenever you attack, you may sacrifice one or more Treasures. When you do, up to that many target creatures gain double strike until end of turn.';
const TIMES = 'Each creature you control gets +1/+0 for each time it has attacked this turn.';
const LANDFALL =
  "Whenever a land you control enters, if it's your main phase, there's an additional combat phase after this phase. At the beginning of that combat, untap all creatures you control.";
const TASTE =
  "Exile the top two cards of target opponent's library face down. You may look at and play those cards for as long as they remain exiled.";

const CASES = [
  ['selector:atLeastOne', ATTACK, 'creature'],
  ['selector:upToThatMany', ATTACK, 'creature'],
  ['trigger:attackBatch', ATTACK, 'creature'],
  ['amount:timesAttacked', TIMES, 'creature'],
  ['condition:yourMainPhase', LANDFALL, 'creature'],
  ['effect:extraCombat', LANDFALL, 'creature'],
  ['effect:exileTop', TASTE, 'instant'],
  ['effect:mayPlay', TASTE, 'instant'],
] as const;

describe('the lines of the Korvold slice 7a name the feature the engine lacks (D-187, D-188)', () => {
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
