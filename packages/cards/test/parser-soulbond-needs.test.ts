// A line of the soulbond slice that the grammar reads whose engine feature is not listed is reported as "recognised, not runnable" naming that feature, never built (D-068,
// D-286, D-284). The engine lists every feature below, so the support check is replaced here by one that lacks one feature at a time, and the lowering must name it. The
// lines are the text of Breathkeeper Seraph (name replaced by ~), one line at a time.
import { describe, expect, test, vi } from 'vitest';

vi.mock('@commander-arena/engine', async (importOriginal) =>
  (await import('./blocked-features')).blockFeatures(
    await importOriginal<typeof import('@commander-arena/engine')>(),
  ),
);

import { BLOCKED } from './blocked-features';
import { read, withoutFeature } from './parser-p5-helpers';

const KEYWORD = 'Flying, soulbond';
const SERAPH_LINE =
  'As long as ~ is paired with another creature, each of those creatures has "When this creature dies, you may return it to the battlefield under its owner\'s control at the beginning of your next upkeep."';

const CASES = [
  ['keyword:soulbond', KEYWORD],
  ['staticSubject:pair', SERAPH_LINE],
  ['condition:paired', SERAPH_LINE],
  ['effect:delayedTrigger', SERAPH_LINE],
  ['selector:triggerCard', SERAPH_LINE],
] as const;

describe('the lines of the Seraph name the feature the engine lacks (D-286, D-284)', () => {
  test.each(CASES)('without %s: %s', (ref, text) => {
    const missing = withoutFeature(ref, text, 'creature');
    expect(missing).toMatchObject({ reason: 'notRunnable' });
    expect(missing.needs).toContain(ref);
  });

  test('a blocked line leaves the ability with nothing (never half-executed)', () => {
    for (const [ref, text] of CASES) {
      BLOCKED.clear();
      BLOCKED.add(ref);
      try {
        const parsed = read(text, 'creature');
        expect(parsed.unparsed.length, `${ref}: ${text}`).toBeGreaterThan(0);
        expect(
          parsed.abilities.some(
            (a) =>
              a.kind === 'static' ||
              (ref === 'keyword:soulbond' && a.kind === 'keyword' && a.keyword.kind === 'soulbond'),
          ),
          `${ref}: ${text}`,
        ).toBe(false);
      } finally {
        BLOCKED.clear();
      }
    }
  });
});
