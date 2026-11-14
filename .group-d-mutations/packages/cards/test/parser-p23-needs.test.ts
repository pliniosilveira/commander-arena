// Stage P23 (M6): a line the grammar reads whose engine feature is not listed is reported as "recognised, not
// runnable" naming that feature, never built (D-068, D-124). The engine lists every feature below, so the support
// check is replaced here by one that lacks one feature at a time, and the lowering must name it. All lines are
// the real lines of reports/templates.json.
import { describe, expect, test, vi } from 'vitest';

vi.mock('@commander-arena/engine', async (importOriginal) =>
  (await import('./blocked-features')).blockFeatures(
    await importOriginal<typeof import('@commander-arena/engine')>(),
  ),
);

import { DECLARED_NEEDS } from '../src/convert/parser/index';
import { BLOCKED } from './blocked-features';
import { read, withoutFeature } from './parser-p5-helpers';

const ESCAPE = 'Escape—{G}{G}{U}{U}, Exile five other cards from your graveyard.';
const UNLESS_ESCAPED = 'When ~ enters, sacrifice it unless it escaped.';

describe('the lines of the second named-alternative slice name the feature the engine lacks (D-124)', () => {
  test.each([
    ['castAlternative:spectacle', 'Spectacle {R}', 'creature'],
    ['cost:mana', 'Spectacle {R}', 'creature'],
    ['castAlternative:escape', ESCAPE, 'creature'],
    ['cost:mana', ESCAPE, 'creature'],
    ['keyword:unearth', 'Unearth {R}', 'creature'],
    ['cost:mana', 'Unearth {R}', 'creature'],
    ['ability:keyword', 'Unearth {R}', 'creature'],
    ['condition:escaped', UNLESS_ESCAPED, 'creature'],
    ['condition:not', UNLESS_ESCAPED, 'creature'],
    ['trigger:interveningIf', UNLESS_ESCAPED, 'creature'],
    ['trigger:entersBattlefield', UNLESS_ESCAPED, 'creature'],
    ['effect:sacrifice', UNLESS_ESCAPED, 'creature'],
  ] as const)('without %s: %s', (ref, text, type) => {
    const missing = withoutFeature(ref, text, type);
    expect(missing).toMatchObject({ reason: 'notRunnable' });
    expect(missing.needs).toEqual([ref]);
  });

  test('a kind the engine does not list does not block the others', () => {
    BLOCKED.clear();
    BLOCKED.add('castAlternative:escape');
    try {
      expect(read('Spectacle {R}', 'creature').unparsed).toEqual([]);
      expect(read('Dash {1}{R}', 'creature').unparsed).toEqual([]);
      expect(read('Unearth {R}', 'creature').unparsed).toEqual([]);
      expect(read(ESCAPE, 'creature').unparsed).toHaveLength(1);
    } finally {
      BLOCKED.clear();
    }
  });

  test('a blocked line leaves the face with no entry and no ability (never half-executed)', () => {
    BLOCKED.clear();
    BLOCKED.add('castAlternative:spectacle');
    try {
      expect(read('Spectacle {R}', 'creature').alternativeCosts).toEqual([]);
    } finally {
      BLOCKED.clear();
    }
    BLOCKED.add('keyword:unearth');
    try {
      expect(read('Unearth {R}', 'creature').abilities).toEqual([]);
    } finally {
      BLOCKED.clear();
    }
    BLOCKED.add('condition:escaped');
    try {
      expect(read(UNLESS_ESCAPED, 'creature').abilities).toEqual([]);
    } finally {
      BLOCKED.clear();
    }
  });

  test('every feature the lowering can name is declared for the dimension test', () => {
    for (const ref of [
      'castAlternative:spectacle',
      'castAlternative:escape',
      'keyword:unearth',
      'condition:escaped',
    ] as const) {
      expect(DECLARED_NEEDS, ref).toContain(ref);
    }
  });
});
