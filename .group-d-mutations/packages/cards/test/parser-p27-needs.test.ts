// Stage P27 (M6): a line of the copy slice the grammar reads whose engine feature is not listed is reported as
// "recognised, not runnable" naming that feature, never built (D-068, D-129). The engine lists every feature below,
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

const STORM = 'Storm';
const REPLICATE = 'Replicate {2}';
const COPY = 'Copy target instant or sorcery spell. You may choose new targets for the copy.';
const COPY_CAST = 'Whenever you cast a spell of the chosen type, copy that spell.';

describe('the copy lines name the feature the engine lacks (D-129)', () => {
  test.each([
    ['ability:keyword', STORM, 'sorcery'],
    ['keyword:storm', STORM, 'sorcery'],
    ['ability:keyword', REPLICATE, 'sorcery'],
    ['keyword:replicate', REPLICATE, 'sorcery'],
    ['cost:mana', REPLICATE, 'sorcery'],
    ['effect:copySpell', COPY, 'instant'],
    ['selector:target', COPY, 'instant'],
    ['effect:copySpell', COPY_CAST, 'enchantment'],
    ['selector:triggerSubject', COPY_CAST, 'enchantment'],
  ] as const)('without %s: %s', (ref, text, type) => {
    const missing = withoutFeature(ref, text, type);
    expect(missing).toMatchObject({ reason: 'notRunnable' });
    expect(missing.needs).toEqual([ref]);
  });

  test('a kind the engine does not list does not block the others', () => {
    BLOCKED.clear();
    BLOCKED.add('keyword:storm');
    try {
      expect(read(REPLICATE, 'sorcery').unparsed).toEqual([]);
      expect(read(COPY, 'instant').unparsed).toEqual([]);
      expect(read(STORM, 'sorcery').unparsed).toHaveLength(1);
    } finally {
      BLOCKED.clear();
    }
  });

  test('a blocked line leaves the face with no ability and no spell (never half-executed)', () => {
    for (const [ref, text, type] of [
      ['keyword:storm', STORM, 'sorcery'],
      ['keyword:replicate', REPLICATE, 'sorcery'],
      ['effect:copySpell', COPY_CAST, 'enchantment'],
    ] as const) {
      BLOCKED.clear();
      BLOCKED.add(ref);
      try {
        expect(read(text, type).abilities, ref).toEqual([]);
      } finally {
        BLOCKED.clear();
      }
    }
    BLOCKED.add('effect:copySpell');
    try {
      expect(read(COPY, 'instant').spell).toBeNull();
    } finally {
      BLOCKED.clear();
    }
  });

  test('every feature the lowering can name is declared for the dimension test', () => {
    for (const ref of [
      'keyword:storm',
      'keyword:replicate',
      'effect:copySpell',
      'cost:mana',
      'selector:triggerSubject',
    ] as const) {
      expect(DECLARED_NEEDS, ref).toContain(ref);
    }
  });
});
