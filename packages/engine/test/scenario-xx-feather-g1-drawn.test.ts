// "Draw a card. Until end of turn, target creature gets +1/+0 for each card you've drawn this turn." (the Feather deck, issue 27, group 1: D-450, the amount
// `cardsDrawnThisTurn`).
// Pins: CR 121.1 (drawing a card), CR 611.2a (a continuous effect of a resolving spell lasts until end of turn), CR 608.2h (the amount is worked out once, as the effect is applied,
// so cards drawn afterwards do not change it), CR 608.2c (the instructions are followed in order: the card the spell draws counts), CR 903.9b (a draw replaced by the commander
// going to the command zone is not a card drawn), CR 613.4c (a +N/+0 effect is layer 7c).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-feather-g1.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const FIST = 'SYNTHETIC Feather Fist'; // {1}{R} instant: draw a card; target creature gets +1/+0 for each card you've drawn this turn
const DIVINATION = 'Divination'; // {2}{U} sorcery: draw two cards
const BEARS = 'Grizzly Bears'; // 2/2
const LIBRARY = Array.from({ length: 12 }, () => 'Mountain');

describe('the card is valid', () => {
  test(FIST, () => {
    expect(validateCard(syntheticCard(FIST))).toEqual([]);
  });

  test('a static ability cannot read it: nothing would refresh the layer when a card is drawn', () => {
    const card = singleFace({
      name: 'SYNTHETIC Test Drawn Static',
      manaCost: ['1'],
      types: ['creature'],
      colors: [],
      colorIdentity: [],
      power: 1,
      toughness: 1,
      oracleText: "This creature gets +1/+0 for each card you've drawn this turn.",
      abilities: [
        {
          kind: 'static',
          static: {
            kind: 'modifyPt',
            subject: { kind: 'this' },
            power: { kind: 'cardsDrawnThisTurn' } as never,
            toughness: 0,
          },
        },
      ],
    });
    expect(validateCard(card).length).toBeGreaterThan(0);
  });
});

describe('"+1/+0 for each card you\'ve drawn this turn" (CR 121.1, 608.2h)', () => {
  const start = (hand: readonly string[], opponentHand: readonly string[] = []) =>
    scenario()
      .seat(0)
      .life(20)
      .library(...LIBRARY)
      .hand(...hand)
      .battlefield('Mountain', 'Mountain', 'Mountain', 'Mountain', 'Island')
      .battlefield(BEARS, { label: 'mine' })
      .seat(1)
      .life(20)
      .library(...LIBRARY)
      .hand(...opponentHand)
      .battlefield('Island', 'Island', 'Island')
      .at('precombatMain', { active: 0, priority: 0 })
      .build();

  test('the card the spell draws counts: it is drawn first, so the first spell gives +1/+0', () => {
    const g = start([FIST]);
    g.act(0).cast(FIST, { targets: ['mine'], pay: true });
    g.passAll();
    g.expect.handSize(0, 1);
    g.expect.pt('mine', 3, 2);
    g.expect.invariants();
  });

  test('a second spell the same turn counts both cards drawn, and the first one’s bonus stays', () => {
    const g = start([`${FIST}`, `${FIST}`]);
    g.act(0).cast(`${FIST}[1]`, { targets: ['mine'], pay: true });
    g.passAll();
    g.act(0).cast(FIST, { targets: ['mine'], pay: true });
    g.passAll();
    g.expect.pt('mine', 2 + 1 + 2, 2);
  });

  test('every card drawn this turn counts, not only the spell’s: a Divination first makes three', () => {
    const g = start([DIVINATION, FIST]);
    g.act(0).cast(DIVINATION, { pay: true });
    g.passAll();
    g.act(0).cast(FIST, { targets: ['mine'], pay: true });
    g.passAll();
    g.expect.pt('mine', 2 + 3, 2);
  });

  test('the amount is worked out as the spell resolves and stays: cards drawn afterwards do not change it (CR 608.2h)', () => {
    const g = start([FIST, DIVINATION]);
    g.act(0).cast(FIST, { targets: ['mine'], pay: true });
    g.passAll();
    g.expect.pt('mine', 3, 2);
    g.act(0).cast(DIVINATION, { pay: true });
    g.passAll();
    g.expect.pt('mine', 3, 2);
  });

  test('only the controller’s draws count: the two cards the opponent drew this turn do not', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .library(...LIBRARY)
      .hand(FIST)
      .battlefield('Mountain', 'Mountain')
      .battlefield(BEARS, { label: 'mine' })
      .seat(1)
      .life(20)
      .library(...LIBRARY)
      .hand(DIVINATION)
      .battlefield('Island', 'Island', 'Island')
      .at('precombatMain', { active: 1, priority: 1 })
      .build();
    g.act(1).cast(DIVINATION, { pay: true });
    g.passAll();
    g.expect.handSize(1, 2);
    g.act(1).pass();
    g.act(0).cast(FIST, { targets: ['mine'], pay: true });
    g.passAll();
    g.expect.pt('mine', 3, 2);
  });

  test('the bonus lasts until end of turn only', () => {
    const g = start([FIST]);
    g.act(0).cast(FIST, { targets: ['mine'], pay: true });
    g.passAll();
    g.expect.pt('mine', 3, 2);
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.pt('mine', 2, 2);
  });
});
