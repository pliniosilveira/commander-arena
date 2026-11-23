// Reconfigure (CR 702.151a) and "As long as ~ is attached to a creature, you may play lands and cast spells from the top of your library" (The Reality Chip, CR 305.1,
// 601.3, 401.5): the lines are read into the engine's keyword and its two conditional permissions. The lines are paraphrases of the Oracle text, not card data.
import { describe, expect, test, vi } from 'vitest';

vi.mock('@commander-arena/engine', async (importOriginal) =>
  (await import('./blocked-features')).blockFeatures(
    await importOriginal<typeof import('@commander-arena/engine')>(),
  ),
);

import { DECLARED_NEEDS } from '../src/convert/parser/index';
import { BLOCKED } from './blocked-features';
import { read, readAll, withoutFeature } from './parser-p5-helpers';

const TOP =
  'As long as ~ is attached to a creature, you may play lands and cast spells from the top of your library.';
const CONDITION = {
  kind: 'objectMatches',
  of: { kind: 'attached' },
  filter: { types: ['creature'] },
};

describe('Reconfigure', () => {
  test('lowers to the keyword with its cost', () => {
    const face = readAll('Reconfigure {2}{U}', 'artifact', ['Equipment']);
    expect(face.abilities).toEqual([
      {
        kind: 'keyword',
        keyword: { kind: 'reconfigure', cost: [{ kind: 'mana', symbols: ['2', 'U'] }] },
      },
    ]);
  });

  test('a cost other than a plain mana cost is not read', () => {
    expect(read('Reconfigure {X}', 'artifact', ['Equipment']).abilities).toEqual([]);
    expect(read('Reconfigure—Pay 2 life.', 'artifact', ['Equipment']).abilities).toEqual([]);
  });

  test('without the engine feature the line names it and is dropped', () => {
    const missing = withoutFeature('keyword:reconfigure', 'Reconfigure {2}{U}', 'artifact');
    expect(missing).toMatchObject({ reason: 'notRunnable' });
    expect(missing.needs).toContain('keyword:reconfigure');
    expect(DECLARED_NEEDS).toContain('keyword:reconfigure');
  });
});

describe('the conditional permission to play from the top of the library', () => {
  test('lowers to both permissions, each with the attached-to-a-creature condition', () => {
    const face = readAll(TOP, 'artifact', ['Equipment']);
    expect(face.abilities).toEqual([
      { kind: 'static', static: { kind: 'playLandsFromTopOfLibrary' }, condition: CONDITION },
      {
        kind: 'static',
        static: { kind: 'castFromTopOfLibrary', spells: {} },
        condition: CONDITION,
      },
    ]);
  });

  test.each([
    'static:castFromTopOfLibrary',
    'static:playLandsFromTopOfLibrary',
    'ability:staticCondition',
  ])('without %s the line is dropped whole, never half run', (ref) => {
    BLOCKED.clear();
    BLOCKED.add(ref);
    try {
      expect(read(TOP, 'artifact', ['Equipment']).abilities).toEqual([]);
    } finally {
      BLOCKED.clear();
    }
  });
});
