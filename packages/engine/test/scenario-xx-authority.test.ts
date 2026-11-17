import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import { groupEntersTapped } from '../src/rules/enters-group';
import { scenario } from '../src/testing/index';

const AUTHORITY = singleFace({
  name: 'SYNTHETIC Authority',
  manaCost: ['W'],
  types: ['enchantment'],
  colors: ['W'],
  colorIdentity: ['W'],
  oracleText: 'SYNTHETIC: creatures opponents control enter tapped.',
  abilities: [
    {
      kind: 'replacement',
      replacement: {
        kind: 'groupEntersTapped',
        what: { types: ['creature'], controller: 'opponent' },
      },
    },
  ],
});

describe('groupEntersTapped', () => {
  test('creatures opponents cast enter tapped', () => {
    const g = scenario()
      .define(AUTHORITY)
      .seat(0)
      .battlefield(AUTHORITY.name)
      .seat(1)
      .battlefield('Forest', 'Forest')
      .hand('Grizzly Bears')
      .library('Plains')
      .at('precombatMain', { active: 1 })
      .build();

    expect(
      groupEntersTapped(g.state, {
        ...g.object('Grizzly Bears'),
        controller: 1,
        zone: 'battlefield',
      }),
    ).toBe(true);
    g.act(1).cast('Grizzly Bears', { pay: true });
    g.passAll();

    expect(g.state.objects[g.id('Grizzly Bears')]?.tapped).toBe(true);
  });
});
