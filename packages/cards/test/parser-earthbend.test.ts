// Earthbend (Avatar: The Last Airbender keyword action) through the whole pipeline: what it lowers to, the near misses the grammar must drop, and the engine feature it needs.
import { describe, expect, test, vi } from 'vitest';

vi.mock('@commander-arena/engine', async (importOriginal) =>
  (await import('./blocked-features')).blockFeatures(
    await importOriginal<typeof import('@commander-arena/engine')>(),
  ),
);

import { read, readAll, withoutFeature } from './parser-p5-helpers';

const LAND = { id: 't1', what: { kind: 'object', filter: { types: ['land'], controller: 'you' } } };

describe('earthbend N', () => {
  test('an enters trigger declares the target land and earthbends it', () => {
    const [a] = readAll('When ~ enters, earthbend 2.', 'creature').abilities;
    expect(a).toEqual({
      kind: 'triggered',
      trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
      targets: [LAND],
      effect: { kind: 'earthbend', objects: { kind: 'target', id: 't1' }, count: 2 },
    });
  });

  test('a spell: one earthbend, then another with its own target, then life', () => {
    const spell = readAll('Earthbend 3, then earthbend 3. You gain 3 life.', 'sorcery').spell;
    expect(spell?.targets).toHaveLength(2);
    expect(spell?.effect?.kind).toBe('sequence');
  });

  test('X is the count the sentence defines', () => {
    const spell = readAll(
      'Earthbend X, where X is the number of Forests you control.',
      'sorcery',
    ).spell;
    expect(spell?.effect).toMatchObject({ kind: 'earthbend', count: { kind: 'countOf' } });
  });

  test.each([
    'When ~ enters, earthbend.',
    'When ~ enters, earthbend a.',
    'When ~ enters, earthbend 2 target land.',
    'When ~ enters, earthbending 2.',
  ])('another wording is dropped: %s', (text) => {
    expect(read(text, 'creature').unparsed.length).toBeGreaterThan(0);
  });

  test('without effect:earthbend in the engine the ability is not read', () => {
    expect(withoutFeature('effect:earthbend', 'When ~ enters, earthbend 2.').reason).toBeDefined();
  });
});
