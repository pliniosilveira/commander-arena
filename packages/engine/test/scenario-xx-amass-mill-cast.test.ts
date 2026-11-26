// "Amass Orcs X. Mill X cards. You may cast an instant or sorcery spell with mana value X or less from among them without paying its mana cost." (Summons of Saruman, without its
// Flashback line): the cards the controller milled are the cards "them" names, cast from the graveyard with the mana value limited by the X of the spell.
// Pins: CR 701.47a (amass Orcs X), CR 701.17a (mill), CR 608.2g (cast as the spell resolves, no timing restriction), CR 118.9 (without paying the mana cost), CR 107.3a and CR 202.3
// (the X announced limits the mana value; an {X} in the cost of a card cast this way is 0, CR 107.3b), CR 400.7 (a milled card is a new object).
// The card is SYNTHETIC, defined in this file (a synthetic fixture of this shape would change the derive digests).
import { describe, expect, test } from 'vitest';
import { getView, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';

const SUMMONS = 'SYNTHETIC Orc Summons';
const BOLT = 'Lightning Bolt'; // instant, mana value 1
const DIVINATION = 'Divination'; // sorcery, mana value 3
const BEARS = 'Grizzly Bears'; // creature, mana value 2

const summons = singleFaceCard({
  name: SUMMONS,
  manaCost: ['X', 'U', 'R'],
  types: ['sorcery'],
  colors: ['U', 'R'],
  colorIdentity: ['U', 'R'],
  oracleText:
    'Amass Orcs X. Mill X cards. You may cast an instant or sorcery spell with mana value X or less from among them without paying its mana cost.',
  spell: {
    x: true,
    effect: {
      kind: 'sequence',
      effects: [
        { kind: 'amass', subtype: 'Orc', count: { kind: 'x' } },
        { kind: 'mill', player: { kind: 'you' }, count: { kind: 'x' } },
        {
          kind: 'castFree',
          objects: { kind: 'moved' },
          filter: {
            anyOf: [{ types: ['instant'] }, { types: ['sorcery'] }],
            manaValueAtMost: { kind: 'x' },
          },
        },
      ],
    },
  },
});

function board(...library: string[]) {
  return scenario()
    .define(summons)
    .seat(0)
    .hand(SUMMONS)
    .battlefield('Island', 'Island', 'Mountain', 'Mountain', 'Mountain')
    .library(...library, 'Island', 'Island', 'Island')
    .seat(1)
    .library('Island', { count: 4 })
    .at('precombatMain', { active: 0, turn: 1 })
    .build();
}

describe('amass, mill, then cast an instant or sorcery from among the milled cards', () => {
  test('the card is valid', () => {
    expect(validateCard(summons)).toEqual([]);
  });

  test('X = 2: the Orc Army gets two counters, two cards are milled and the instant of mana value 1 may be cast', () => {
    const g = board(BOLT, DIVINATION);
    g.act(0).cast(SUMMONS, { pay: true, x: 2 });
    g.passAll();
    const army = getView(g.state, 0).battlefield.find((o) => o.subtypes.includes('Army'));
    expect(army).toMatchObject({ name: 'Orc Army', counters: { '+1/+1': 2 } });
    // Divination has mana value 3, more than X: only the Bolt is offered.
    g.expect.pending('chooseCards', 0);
    g.act(0).chooseCards(BOLT);
    g.expect.stack([BOLT, SUMMONS]);
    g.expect.zone(DIVINATION, 'graveyard', { seat: 0 });
    g.expect.invariants();
  });

  test('X = 3: the sorcery of mana value 3 is offered too', () => {
    const g = board(BOLT, DIVINATION, BEARS);
    g.act(0).cast(SUMMONS, { pay: true, x: 3 });
    g.passAll();
    g.expect.pending('chooseCards', 0);
    g.act(0).chooseCards(DIVINATION);
    g.expect.stack([DIVINATION]);
    // A creature card is never offered, whatever its mana value.
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
  });

  test('declining casts nothing, and a card of the wrong kind or too costly is never offered', () => {
    const g = board(BEARS, DIVINATION);
    g.act(0).cast(SUMMONS, { pay: true, x: 2 });
    g.passAll();
    g.expect.pending('priority');
    g.expect.stack([]);
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.zone(DIVINATION, 'graveyard', { seat: 0 });
  });
});
