// Stage P26 (M6): a line of the cast-later slice the grammar reads whose engine feature is not listed is reported as
// "recognised, not runnable" naming that feature, never built (D-068, D-128). The engine lists every feature below,
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

const SUSPEND = 'Suspend 2—{1}{B}';
const MADNESS = 'Madness {1}{B}{B}';
const FORETELL = 'Foretell {4}{R}{R}';
const DELAYED = "You draw a card at the beginning of the next turn's upkeep.";

describe('the cast-later lines name the feature the engine lacks (D-128)', () => {
  test.each([
    ['ability:keyword', SUSPEND, 'sorcery'],
    ['keyword:suspend', SUSPEND, 'sorcery'],
    ['cost:mana', SUSPEND, 'sorcery'],
    ['castAlternative:madness', MADNESS, 'creature'],
    ['cost:mana', MADNESS, 'creature'],
    ['castAlternative:foretell', FORETELL, 'sorcery'],
    ['cost:mana', FORETELL, 'sorcery'],
    ['effect:delayedTrigger', DELAYED, 'sorcery'],
    ['effect:draw', DELAYED, 'sorcery'],
  ] as const)('without %s: %s', (ref, text, type) => {
    const missing = withoutFeature(ref, text, type);
    expect(missing).toMatchObject({ reason: 'notRunnable' });
    expect(missing.needs).toEqual([ref]);
  });

  test('a kind the engine does not list does not block the others', () => {
    BLOCKED.clear();
    BLOCKED.add('castAlternative:madness');
    try {
      expect(read(SUSPEND, 'sorcery').unparsed).toEqual([]);
      expect(read(FORETELL, 'sorcery').unparsed).toEqual([]);
      expect(read(DELAYED, 'sorcery').unparsed).toEqual([]);
      expect(read(MADNESS, 'creature').unparsed).toHaveLength(1);
    } finally {
      BLOCKED.clear();
    }
  });

  test('a blocked line leaves the face with no entry, no ability and no spell (never half-executed)', () => {
    BLOCKED.clear();
    BLOCKED.add('keyword:suspend');
    try {
      expect(read(SUSPEND, 'sorcery').abilities).toEqual([]);
    } finally {
      BLOCKED.clear();
    }
    for (const [ref, text] of [
      ['castAlternative:madness', MADNESS],
      ['castAlternative:foretell', FORETELL],
    ] as const) {
      BLOCKED.add(ref);
      try {
        expect(read(text, 'creature').alternativeCosts, ref).toEqual([]);
      } finally {
        BLOCKED.clear();
      }
    }
    BLOCKED.add('effect:delayedTrigger');
    try {
      expect(read(DELAYED, 'sorcery').spell).toBeNull();
    } finally {
      BLOCKED.clear();
    }
  });

  test('every feature the lowering can name is declared for the dimension test', () => {
    for (const ref of [
      'keyword:suspend',
      'castAlternative:madness',
      'castAlternative:foretell',
      'effect:delayedTrigger',
      'effect:draw',
      'cost:mana',
    ] as const) {
      expect(DECLARED_NEEDS, ref).toContain(ref);
    }
  });
});
