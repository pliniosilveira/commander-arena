// The Animated Army deck (issue 110), group offspring: the line "Offspring {1}" of Prosperous Bandit (CR 702.175a). The first line is the real Oracle text of the acceptance card of
// the golden corpus; the other lines are SYNTHETIC variants and the near misses the grammar must not read. The engine runs what is lowered in
// convert-grammar-engine-offspring.test.ts.
import { describe, expect, test, vi } from 'vitest';

vi.mock('@commander-arena/engine', async (importOriginal) =>
  (await import('./blocked-features')).blockFeatures(
    await importOriginal<typeof import('@commander-arena/engine')>(),
  ),
);

import { DECLARED_NEEDS } from '../src/convert/parser/index';
import { readAll, read as readFace, withoutFeature } from './parser-p5-helpers';

const NOT_READ = (text: string) => {
  const parsed = readFace(text, 'creature');
  expect(parsed.abilities, text).toEqual([]);
  expect(parsed.unparsed, text).toHaveLength(1);
};

describe('"Offspring {1}" (CR 702.175a)', () => {
  test('the real line of Prosperous Bandit', () => {
    expect(readAll('Offspring {1}', 'creature').abilities).toEqual([
      { kind: 'keyword', keyword: { kind: 'offspring', cost: [{ kind: 'mana', symbols: ['1'] }] } },
    ]);
  });

  test('the reminder text is not part of the ability', () => {
    expect(
      readAll(
        'Offspring {1} (You may pay an additional {1} as you cast this spell. If you do, when this creature enters, create a 1/1 token copy of it.)',
        'creature',
      ).abilities,
    ).toEqual([
      { kind: 'keyword', keyword: { kind: 'offspring', cost: [{ kind: 'mana', symbols: ['1'] }] } },
    ]);
  });

  test('another cost; the lines that are not offspring are not read', () => {
    expect(readAll('Offspring {1}{W}', 'creature').abilities).toMatchObject([
      { keyword: { kind: 'offspring', cost: [{ kind: 'mana', symbols: ['1', 'W'] }] } },
    ]);
    for (const line of [
      'Offspring',
      'Offspring {X}',
      'Offspring—Pay 2 life.',
      'Offspring {2}, offspring {1}',
      'First strike, offspring {1}',
      'offspring {2}.',
    ]) {
      NOT_READ(line);
    }
  });

  test('the line names the feature the engine lacks (D-068)', () => {
    const missing = withoutFeature('keyword:offspring', 'Offspring {1}', 'creature');
    expect(missing).toMatchObject({ reason: 'notRunnable' });
    expect(missing.needs).toContain('keyword:offspring');
    expect(DECLARED_NEEDS).toContain('keyword:offspring');
  });
});
