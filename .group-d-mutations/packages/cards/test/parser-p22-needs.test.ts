// Stage P22 (M6): a named alternative cost the grammar reads but whose engine feature is not listed is reported
// as "recognised, not runnable" naming that feature, never built (D-068, D-121). The engine lists every feature
// below, so the support check is replaced here by one that lacks one feature at a time, and the lowering must
// name it. All lines are the real keyword lines of reports/templates.json.
import { describe, expect, test, vi } from 'vitest';

vi.mock('@commander-arena/engine', async (importOriginal) =>
  (await import('./blocked-features')).blockFeatures(
    await importOriginal<typeof import('@commander-arena/engine')>(),
  ),
);

import { DECLARED_NEEDS } from '../src/convert/parser/index';
import { BLOCKED } from './blocked-features';
import { read, withoutFeature } from './parser-p5-helpers';

describe('the named alternative costs name `castAlternative:<kind>` (D-121)', () => {
  test.each([
    ['castAlternative:overload', 'Overload {6}{U}', 'instant'],
    ['castAlternative:evoke', 'Evoke {2}{U}', 'creature'],
    ['castAlternative:dash', 'Dash {1}{R}', 'creature'],
    ['cost:mana', 'Overload {6}{U}', 'instant'],
    ['cost:mana', 'Evoke {2}{U}', 'creature'],
    ['cost:mana', 'Dash {1}{R}', 'creature'],
  ] as const)('without %s: %s', (ref, text, type) => {
    const missing = withoutFeature(ref, text, type);
    expect(missing).toMatchObject({ reason: 'notRunnable' });
    expect(missing.needs).toEqual([ref]);
  });

  test('a kind the engine does not list does not block the others', () => {
    BLOCKED.clear();
    BLOCKED.add('castAlternative:dash');
    try {
      expect(read('Evoke {2}{U}', 'creature').unparsed).toEqual([]);
      expect(read('Overload {6}{U}', 'instant').unparsed).toEqual([]);
      expect(read('Dash {1}{R}', 'creature').unparsed).toHaveLength(1);
    } finally {
      BLOCKED.clear();
    }
  });

  test('a blocked line leaves the face with no entry (never half-executed)', () => {
    BLOCKED.clear();
    BLOCKED.add('castAlternative:evoke');
    try {
      expect(read('Evoke {2}{U}', 'creature').alternativeCosts).toEqual([]);
    } finally {
      BLOCKED.clear();
    }
  });

  test('every feature the lowering can name is declared for the dimension test', () => {
    for (const ref of [
      'castAlternative:overload',
      'castAlternative:evoke',
      'castAlternative:dash',
    ] as const) {
      expect(DECLARED_NEEDS, ref).toContain(ref);
    }
  });
});
