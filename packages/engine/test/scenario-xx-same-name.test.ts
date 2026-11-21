// "Return target creature card and all other cards with the same name as that card from your graveyard to your hand" (Echoing Return, Witch-king of Angmar deck): the filter
// `sameNameAs` of an `each` selector names the target card. Pins: CR 201.2 (names), CR 608.2b (a target that is illegal on resolution: the spell does nothing), CR 400.3 (hand).
// The card is SYNTHETIC; defined here.
import { describe, test } from 'vitest';
import { scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';

const SPELL = 'SYNTHETIC Echo Return';
const BEARS = 'Grizzly Bears';
const ELVES = 'Llanowar Elves';
const ANGEL = 'Serra Angel';

const CARD = singleFaceCard({
  name: SPELL,
  manaCost: ['B'],
  types: ['sorcery'],
  colors: ['B'],
  colorIdentity: ['B'],
  oracleText:
    'Return target creature card and all other cards with the same name as that card from your graveyard to your hand.',
  spell: {
    targets: [
      {
        id: 't1',
        what: {
          kind: 'object',
          filter: { zone: 'graveyard', types: ['creature'], controller: 'you' },
        },
      },
    ],
    effect: {
      kind: 'moveToZone',
      objects: {
        kind: 'each',
        filter: {
          zone: 'graveyard',
          controller: 'you',
          sameNameAs: { kind: 'target', id: 't1' },
        },
      },
      to: 'hand',
    },
  },
});

describe('all the cards with the same name as the target (CR 201.2)', () => {
  test('the target and every other card with its name return to the hand, and no card with another name does', () => {
    const g = scenario()
      .define(CARD)
      .seat(0)
      .hand(SPELL)
      .graveyard(BEARS, BEARS, ELVES, ANGEL)
      .pool('B')
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(SPELL, { targets: [`${BEARS}[0]`], pay: true });
    g.passAll();
    g.expect.zone(ELVES, 'graveyard', { seat: 0 });
    g.expect.zone(ANGEL, 'graveyard', { seat: 0 });
    g.expect.handSize(0, 2);
    g.expect.invariants();
  });

  test('a card of the same name in another player’s graveyard stays there', () => {
    const g = scenario()
      .define(CARD)
      .seat(0)
      .hand(SPELL)
      .graveyard(BEARS)
      .pool('B')
      .seat(1)
      .graveyard(BEARS)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(SPELL, { targets: [{ name: BEARS, seat: 0 }], pay: true });
    g.passAll();
    g.expect.handSize(0, 1);
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
  });
});
