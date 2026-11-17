import { describe, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import { scenario } from '../src/testing/index';

const UNDERWORLD = singleFace({
  name: 'SYNTHETIC Underworld Connections',
  manaCost: ['1', 'B', 'B'],
  types: ['enchantment'],
  subtypes: ['Aura'],
  colors: ['B'],
  colorIdentity: ['B'],
  oracleText: 'SYNTHETIC: enchanted land has "{T}, Pay 1 life: Draw a card."',
  abilities: [
    { kind: 'keyword', keyword: { kind: 'enchant', filter: { types: ['land'] } } },
    {
      kind: 'static',
      static: {
        kind: 'grantAbility',
        subject: { kind: 'attached', types: ['land'] },
        ability: {
          kind: 'activated',
          cost: [{ kind: 'tap' }, { kind: 'payLife', amount: 1 }],
          effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
        },
      },
    },
  ],
});

describe('Underworld Connections', () => {
  test('the enchanted land activates the granted ability, pays life and draws', () => {
    const g = scenario()
      .define(UNDERWORLD)
      .seat(0)
      .life(20)
      .battlefield('Forest')
      .battlefield(UNDERWORLD.name, { attachedTo: 'Forest' })
      .library('Plains', 'Island')
      .seat(1)
      .build();

    g.act(0).activate('Forest', { ability: 1 });
    g.passAll();

    g.expect.life(0, 19);
    g.expect.zone('Plains', 'hand', { seat: 0 });
    g.expect.tapped('Forest');
  });
});
