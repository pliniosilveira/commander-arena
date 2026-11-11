// Stage P25 (M6): a line of the upkeep slice the grammar reads whose engine feature is not listed is reported as
// "recognised, not runnable" naming that feature, never built (D-068, D-127). The engine lists every feature below,
// so the support check is replaced here by one that lacks one feature at a time, and the lowering must name it. The
// lines are the real lines of reports/templates.json.
import { describe, expect, test, vi } from 'vitest';

vi.mock('@commander-arena/engine', async (importOriginal) =>
  (await import('./blocked-features')).blockFeatures(
    await importOriginal<typeof import('@commander-arena/engine')>(),
  ),
);

import { DECLARED_NEEDS } from '../src/convert/parser/index';
import { BLOCKED } from './blocked-features';
import { read, withoutFeature } from './parser-p5-helpers';

const ECHO = 'Echo {3}{W}{W}';
const CUMULATIVE = 'Cumulative upkeep {1}';
const MONARCH = 'When ~ enters, you become the monarch.';

describe('the upkeep lines name the feature the engine lacks (D-127)', () => {
  test.each([
    ['ability:keyword', ECHO, 'creature'],
    ['keyword:echo', ECHO, 'creature'],
    ['cost:mana', ECHO, 'creature'],
    ['ability:keyword', CUMULATIVE, 'enchantment'],
    ['keyword:cumulativeUpkeep', CUMULATIVE, 'enchantment'],
    ['cost:mana', CUMULATIVE, 'enchantment'],
    ['ability:triggered', MONARCH, 'creature'],
    ['trigger:entersBattlefield', MONARCH, 'creature'],
    ['effect:becomeMonarch', MONARCH, 'creature'],
    ['effect:becomeMonarch', 'You become the monarch.', 'sorcery'],
  ] as const)('without %s: %s', (ref, text, type) => {
    const missing = withoutFeature(ref, text, type);
    expect(missing).toMatchObject({ reason: 'notRunnable' });
    expect(missing.needs).toEqual([ref]);
  });

  test('a kind the engine does not list does not block the others', () => {
    BLOCKED.clear();
    BLOCKED.add('keyword:echo');
    try {
      expect(read(CUMULATIVE, 'enchantment').unparsed).toEqual([]);
      expect(read(MONARCH, 'creature').unparsed).toEqual([]);
      expect(read(ECHO, 'creature').unparsed).toHaveLength(1);
    } finally {
      BLOCKED.clear();
    }
  });

  test('a blocked line leaves the face with no ability (never half-executed)', () => {
    for (const [ref, text, type] of [
      ['keyword:echo', ECHO, 'creature'],
      ['keyword:cumulativeUpkeep', CUMULATIVE, 'enchantment'],
      ['effect:becomeMonarch', MONARCH, 'creature'],
    ] as const) {
      BLOCKED.clear();
      BLOCKED.add(ref);
      try {
        expect(read(text, type).abilities, ref).toEqual([]);
      } finally {
        BLOCKED.clear();
      }
    }
  });

  test('every feature the lowering can name is declared for the dimension test', () => {
    for (const ref of [
      'keyword:echo',
      'keyword:cumulativeUpkeep',
      'effect:becomeMonarch',
      'cost:mana',
    ] as const) {
      expect(DECLARED_NEEDS, ref).toContain(ref);
    }
  });
});
