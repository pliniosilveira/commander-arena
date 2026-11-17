import { describe, expect, test } from 'vitest';
import { CREATURE_TYPES, FIXTURE_CARDS, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

describe('Maskwood Nexus', () => {
  test('the real-card fixture validates', () => {
    const fixture = FIXTURE_CARDS['Maskwood Nexus'];
    if (fixture === undefined) throw new Error('Maskwood Nexus fixture missing');
    expect(validateCard(fixture)).toEqual([]);
  });

  test('creatures you control get every creature type additively', () => {
    const g = scenario().seat(0).battlefield('Maskwood Nexus').battlefield('Grizzly Bears').build();
    g.expect.derived('Grizzly Bears', { subtypes: [...new Set([...CREATURE_TYPES, 'Bear'])] });
  });

  test('a creature card you own outside the battlefield receives all creature types', () => {
    const g = scenario().seat(0).battlefield('Maskwood Nexus').hand('Grizzly Bears').build();
    g.expect.derived(
      { name: 'Grizzly Bears', zone: 'hand' },
      {
        subtypes: [...new Set([...CREATURE_TYPES, 'Bear'])],
      },
    );
  });

  test('the activated ability creates a blue Shapeshifter token with changeling', () => {
    const g = scenario()
      .seat(0)
      .battlefield('Maskwood Nexus')
      .pool('C')
      .pool('C')
      .pool('C')
      .build();
    g.act(0).activate('Maskwood Nexus', { pay: true });
    g.passAll();
    g.expect.pt('Shapeshifter', 2, 2);
    g.expect.derived('Shapeshifter', {
      subtypes: [...new Set([...CREATURE_TYPES, 'Shapeshifter'])],
      keywords: ['changeling'],
      colors: ['U'],
    });
  });
});
