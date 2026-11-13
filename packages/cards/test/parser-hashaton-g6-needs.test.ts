// The Hashaton deck program (issue 31), group 6 (D-1170, D-1171, provisional): a line the grammar reads whose engine feature is not listed is reported as "recognised,
// not runnable" naming that feature, never built (D-068). The support check is replaced here by one that lacks one feature at a time, and the lowering must name
// it. The lines are the real Oracle text of the golden corpus.
import { describe, expect, test, vi } from 'vitest';

vi.mock('@commander-arena/engine', async (importOriginal) =>
  (await import('./blocked-features')).blockFeatures(
    await importOriginal<typeof import('@commander-arena/engine')>(),
  ),
);

import { DECLARED_NEEDS } from '../src/convert/parser/index';
import { BLOCKED } from './blocked-features';
import { read, withoutFeature } from './parser-p5-helpers';

const LINE = 'You and creatures you control have protection from the chosen card type.';

const CASES = [
  ['static:playerProtection', LINE, 'creature'],
  ['static:grantKeyword', LINE, 'creature'],
  ['keyword:protection', LINE, 'creature'],
] as const;

describe('the protection line names the feature the engine lacks (D-068)', () => {
  test.each(CASES)('without %s: %s', (ref, text, type) => {
    const missing = withoutFeature(ref, text, type);
    expect(missing).toMatchObject({ reason: 'notRunnable' });
    expect(missing.needs).toContain(ref);
  });

  test('a blocked line leaves the face with no ability (never half-executed: neither the player nor the creatures get it)', () => {
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
    for (const ref of ['static:playerProtection', 'static:grantKeyword'] as const) {
      expect(DECLARED_NEEDS, ref).toContain(ref);
    }
  });
});
