// Stage P20 (M6): a power and toughness text the grammar reads but whose engine feature is not listed is
// reported as "recognised, not runnable" naming that feature, never built (D-068, D-115). The engine lists
// `static:characteristicPt` and `amount:times`, so the support check is replaced here by one that lacks one
// feature at a time, and the lowering must name it.
import { describe, expect, test, vi } from 'vitest';

vi.mock('@commander-arena/engine', async (importOriginal) =>
  (await import('./blocked-features')).blockFeatures(
    await importOriginal<typeof import('@commander-arena/engine')>(),
  ),
);

import { BLOCKED } from './blocked-features';
import { dropped, withoutFeature } from './parser-p5-helpers';

const CDA = "~'s power and toughness are each equal to the number of lands you control.";
const FOR_EACH = '~ gets +1/+0 for each artifact you control.';
const NEGATIVE = '~ gets -1/-1 for each artifact you control.';
const STEP_OF_TWO = '~ gets +2/+0 for each artifact you control.';
const ALL = 'All creatures get -X/-X until end of turn.';
const PLUS_X = 'Target creature gets +X/+0 until end of turn.';

describe('the lowerings of stage P20 name the engine feature they need (D-115)', () => {
  test.each([
    ['static:characteristicPt', CDA, 'creature'],
    ['amount:countOf', CDA, 'creature'],
    ['static:modifyPt', FOR_EACH, 'creature'],
    ['amount:countOf', FOR_EACH, 'creature'],
    ['amount:times', NEGATIVE, 'creature'],
    ['amount:times', STEP_OF_TWO, 'creature'],
    ['amount:times', ALL, 'sorcery'],
    ['amount:x', ALL, 'sorcery'],
    ['amount:x', PLUS_X, 'instant'],
    ['effect:modifyPt', ALL, 'sorcery'],
  ] as const)('without %s: %s', (ref, text, type) => {
    const missing = withoutFeature(ref, text, type);
    expect(missing).toMatchObject({ reason: 'notRunnable' });
    expect(missing.needs).toContain(ref);
  });

  test('a step of one needs no multiple: "+1/+0 for each" lowers without amount:times', () => {
    BLOCKED.clear();
    BLOCKED.add('amount:times');
    try {
      expect(() => dropped(FOR_EACH, 'creature')).toThrow('was read');
      expect(() => dropped(PLUS_X, 'instant')).toThrow('was read');
    } finally {
      BLOCKED.clear();
    }
  });
});
