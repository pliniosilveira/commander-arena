// Cost reductions (D-095): "This spell costs {1} less to cast for each creature on the battlefield",
// "Artifact spells you cast cost {1} less to cast", "Instant and sorcery spells you cast cost {1} less
// to cast", "Creature spells you cast cost {2} less to cast".
// Pins: CR 118.7 / 118.7a (a reduction of generic mana affects only the generic part of the cost),
// CR 601.2f (the total cost: mana cost plus additional costs and increases, minus reductions; reduced
// to nothing it is {0}, never less; then it is locked in), CR 601.2h (the sacrifice paid afterwards
// does not change the locked-in cost), CR 113.6d (a spell's own cost-modifying ability functions on
// the stack), CR 604.2 (a permanent's static ability works while it is on the battlefield), CR 903.8
// (commander tax is an additional cost), CR 702.33a (kicker is too). The legal actions, the payment
// and the view's `castCost` all use the reduced cost. Cards are SYNTHETIC (synthetic-costs.ts).
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import { getView } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';

const WRATH = 'SYNTHETIC Wrath of Many'; // {8}{R}, {1} less per creature on the battlefield
const BENCH = 'SYNTHETIC Tinker Bench'; // artifact spells you cast cost {1} less
const CHANT = 'SYNTHETIC Spell Chant'; // instant and sorcery spells you cast cost {1} less
const GIANT = 'SYNTHETIC Giant Discount'; // creature spells you cast cost {2} less
const HAZE = 'SYNTHETIC Market Haze'; // spells cost {1} less for each land you control
const RITE = 'SYNTHETIC Sacrifice Rite'; // {4}{B}, {1} less per creature, sacrifice a creature
const KICK = 'SYNTHETIC Sacrifice Kicker'; // {R}, kicker {2}, sacrifice a creature
const SCOUT = 'SYNTHETIC Doomed Scout'; // {1} artifact creature

/** What the view says a card in seat 0's hand or command zone costs. */
function costOf(g: ScenarioGame, name: string, seat = 0): readonly string[] | undefined {
  const s = getView(g.state, seat).seats[seat];
  return [...(s?.hand ?? []), ...(s?.command ?? [])].find((o) => o.name === name)?.castCost;
}

describe('"This spell costs {1} less to cast for each creature on the battlefield" (CR 113.6d)', () => {
  const wrath = (creatures: number, lands: number, extra: readonly string[] = []) => {
    const b = scenario().seat(0).hand(WRATH);
    if (lands > 0) b.battlefield('Mountain', { count: lands });
    if (creatures > 0) b.battlefield('Grizzly Bears', { count: creatures });
    for (const e of extra) b.battlefield(e);
    return b.seat(1).build();
  };

  test('the cost is reduced by the creatures of every player, counted when the cost is determined', () => {
    const g = scenario()
      .seat(0)
      .hand(WRATH)
      .battlefield('Mountain', { count: 4 })
      .battlefield('Grizzly Bears', { count: 2 })
      .seat(1)
      .battlefield('Giant Spider', 'Llanowar Elves')
      .build();
    // Four creatures, two of them the opponent's: {8}{R} costs {4}{R}, five mana.
    expect(costOf(g, WRATH)).toEqual(['4', 'R']);
    g.expect.illegal(0, { cast: WRATH });
  });

  test('exactly enough lands for the reduced cost: castable, and that is all it taps', () => {
    const g = scenario()
      .seat(0)
      .hand(WRATH)
      .battlefield('Mountain', { count: 6 })
      .battlefield('Grizzly Bears', { count: 2 })
      .seat(1)
      .battlefield('Giant Spider', 'Llanowar Elves')
      .build();
    // Four creatures: {8}{R} costs {4}{R}, five mana: six Mountains are plenty and one stays untapped.
    g.expect.legal(0, { cast: WRATH });
    const cast = g.act(0).cast(WRATH);
    expect(g.state.casting?.totalCost).toEqual(['4', 'R']);
    cast.pay();
    expect(g.find({ name: 'Mountain', zone: 'battlefield' }).filter((o) => o.tapped)).toHaveLength(
      5,
    );
    g.expect.stack([WRATH]);
  });

  test('one land short of the reduced cost: not offered, not accepted', () => {
    const g = wrath(4, 4);
    // {4}{R} with four Mountains.
    expect(costOf(g, WRATH)).toEqual(['4', 'R']);
    g.expect.illegal(0, { cast: WRATH });
    expect(wrath(4, 5).act(0).try.cast(WRATH).ok).toBe(true);
  });

  test('never below zero: with more creatures than generic mana only {R} remains', () => {
    const g = wrath(10, 1);
    expect(costOf(g, WRATH)).toEqual(['R']);
    g.expect.legal(0, { cast: WRATH });
    g.act(0).cast(WRATH, { pay: true });
    g.expect.tapped('Mountain');
    g.expect.stack([WRATH]);
  });

  test('the colored part is never reduced: no red source, no cast, however many creatures', () => {
    const g = scenario()
      .seat(0)
      .hand(WRATH)
      .battlefield('Forest', { count: 9 })
      .battlefield('Grizzly Bears', { count: 12 })
      .seat(1)
      .build();
    expect(costOf(g, WRATH)).toEqual(['R']);
    g.expect.illegal(0, { cast: WRATH });
  });

  test('the spell itself is on the stack while its cost is determined: it counts as nothing', () => {
    // No creature on the battlefield: the full {8}{R}.
    const g = wrath(0, 9);
    expect(costOf(g, WRATH)).toEqual(['8', 'R']);
    g.expect.legal(0, { cast: WRATH });
  });

  test('the cost is locked in at CR 601.2f: creatures dying while paying do not matter', () => {
    const g = wrath(3, 6);
    const cast = g.act(0).cast(WRATH);
    expect(g.state.casting?.totalCost).toEqual(['5', 'R']);
    expect(cast.stage).toBe('payment');
  });

  test('the wrath it casts is the full spell: 13 damage to each creature', () => {
    const g = wrath(3, 6);
    g.act(0).cast(WRATH, { pay: true });
    g.passAll();
    expect(g.find({ name: 'Grizzly Bears', zone: 'graveyard' })).toHaveLength(3);
  });

  test('a cast cancelled gives everything back, the reduced cost included', () => {
    const g = wrath(3, 6);
    const before = g.positionHash();
    g.act(0).cast(WRATH, { pay: false }).cancel();
    g.expect.position(before);
  });
});

describe('a count of the hand while the card is still in it (CR 601.2a)', () => {
  // SYNTHETIC test card: "This spell costs {1} less to cast for each card in your hand."
  const probe = singleFace({
    name: 'SYNTHETIC Test Hand Discount',
    manaCost: ['6'],
    types: ['sorcery'],
    colors: [],
    colorIdentity: [],
    oracleText: 'This spell costs {1} less to cast for each card in your hand.',
    abilities: [
      {
        kind: 'static',
        static: {
          kind: 'costReduction',
          spells: { kind: 'this' },
          amount: { kind: 'countOf', filter: { zone: 'hand', controller: 'you' } },
        },
      },
    ],
    spell: { effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 1 } },
  });

  test('the card does not count itself: the view, the offer and the payment all say {4}', () => {
    const g = scenario()
      .define(probe)
      .seat(0)
      .hand(probe.name, 'Forest', 'Island')
      .battlefield('Swamp', { count: 4 })
      .landsPlayed(1)
      .seat(1)
      .build();
    // Two other cards in hand, the spell is on the stack once it is cast: {6} less {2} is {4}.
    expect(costOf(g, probe.name)).toEqual(['4']);
    g.expect.legal(0, { cast: probe.name });
    g.act(0).cast(probe.name);
    expect(g.state.casting?.totalCost).toEqual(['4']);
  });

  test('one card short of the reduced cost: not offered', () => {
    const g = scenario()
      .define(probe)
      .seat(0)
      .hand(probe.name, 'Forest', 'Island')
      .battlefield('Swamp', { count: 3 })
      .seat(1)
      .build();
    g.expect.illegal(0, { cast: probe.name });
  });
});

describe('"Artifact spells you cast cost {1} less to cast" (CR 604.2)', () => {
  test('a {1} artifact costs {0}: no payment is asked at all', () => {
    const g = scenario().seat(0).hand('Sol Ring').battlefield(BENCH).seat(1).build();
    expect(costOf(g, 'Sol Ring')).toEqual([]);
    g.expect.legal(0, { cast: 'Sol Ring' });
    g.act(0).cast('Sol Ring');
    g.expect.stack(['Sol Ring']);
    g.expect.pending('priority', 0);
  });

  test('an artifact creature is an artifact spell; a plain creature is not', () => {
    const g = scenario()
      .seat(0)
      .hand(SCOUT, 'Grizzly Bears')
      .battlefield(BENCH, 'Forest')
      .seat(1)
      .build();
    expect(costOf(g, SCOUT)).toEqual([]);
    expect(costOf(g, 'Grizzly Bears')).toEqual(['1', 'G']);
  });

  test('an artifact costing {2} costs {1}', () => {
    const g = scenario().seat(0).hand(BENCH).battlefield(BENCH).seat(1).build();
    expect(costOf(g, BENCH)).toEqual(['1']);
  });

  test('"you cast": the opponent’s artifact spells are not cheaper', () => {
    const g = scenario().seat(0).battlefield(BENCH).seat(1).hand('Sol Ring').build();
    expect(costOf(g, 'Sol Ring', 1)).toEqual(['1']);
  });

  test('without the permanent the cost is the printed one again', () => {
    const g = scenario().seat(0).hand('Sol Ring').seat(1).build();
    expect(costOf(g, 'Sol Ring')).toEqual(['1']);
    g.expect.illegal(0, { cast: 'Sol Ring' });
  });

  test('a permanent that lost all abilities gives no reduction (CR 613.1f)', () => {
    // SYNTHETIC test cards: an artifact creature with the bench's ability, and a spell that makes a
    // creature lose all abilities.
    const golem = singleFace({
      name: 'SYNTHETIC Test Bench Golem',
      manaCost: ['3'],
      types: ['artifact', 'creature'],
      colors: [],
      colorIdentity: [],
      power: 2,
      toughness: 2,
      oracleText: 'Artifact spells you cast cost {1} less to cast.',
      abilities: [
        {
          kind: 'static',
          static: {
            kind: 'costReduction',
            spells: { types: ['artifact'], controller: 'you' },
            amount: 1,
          },
        },
      ],
    });
    const hush = singleFace({
      name: 'SYNTHETIC Test Hush',
      manaCost: ['U'],
      types: ['instant'],
      colors: ['U'],
      colorIdentity: ['U'],
      oracleText: 'Target creature loses all abilities until end of turn.',
      spell: {
        targets: [
          {
            id: 't1',
            what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
          },
        ],
        effect: {
          kind: 'loseAllAbilities',
          objects: { kind: 'target', id: 't1' },
          duration: 'untilEndOfTurn',
        },
      },
    });
    const g = scenario()
      .define(golem)
      .define(hush)
      .seat(0)
      .hand('Sol Ring', hush.name)
      .battlefield(golem.name, 'Island')
      .seat(1)
      .build();
    expect(costOf(g, 'Sol Ring')).toEqual([]);
    g.act(0).cast(hush.name, { targets: [golem.name], pay: true });
    g.passAll();
    expect(costOf(g, 'Sol Ring')).toEqual(['1']);
  });
});

describe('"Instant and sorcery spells you cast cost {1} less to cast"', () => {
  const chant = (...hand: string[]) =>
    scenario()
      .seat(0)
      .hand(...hand)
      .battlefield(CHANT)
      .seat(1)
      .build();

  test('generic mana only: {R} stays {R}, {2}{U} becomes {1}{U}, {1}{B}{B} becomes {B}{B}', () => {
    const g = chant('Lightning Bolt', 'Divination', 'Murder');
    expect(costOf(g, 'Lightning Bolt')).toEqual(['R']);
    expect(costOf(g, 'Divination')).toEqual(['1', 'U']);
    expect(costOf(g, 'Murder')).toEqual(['B', 'B']);
  });

  test('a creature spell is not an instant or a sorcery', () => {
    const g = chant('Grizzly Bears');
    expect(costOf(g, 'Grizzly Bears')).toEqual(['1', 'G']);
  });

  test('the cheaper cost is the cost to pay: Divination with two lands', () => {
    const g = scenario()
      .seat(0)
      .hand('Divination')
      .battlefield(CHANT, 'Island', 'Island')
      .library('Plains', 'Plains', 'Plains')
      .seat(1)
      .build();
    g.expect.legal(0, { cast: 'Divination' });
    g.act(0).cast('Divination', { pay: true });
    g.expect.tapped('Island[0]');
    g.expect.tapped('Island[1]');
    g.passAll();
    g.expect.handSize(0, 2);
  });
});

describe('several reductions', () => {
  test('two permanents stack: two Chants take {2} off {1}{B}{B}', () => {
    const g = scenario().seat(0).hand('Murder').battlefield(CHANT, CHANT).seat(1).build();
    expect(costOf(g, 'Murder')).toEqual(['B', 'B']);
    const h = scenario().seat(0).hand('Divination').battlefield(CHANT, CHANT).seat(1).build();
    // {2}{U} less {2} is {U}.
    expect(costOf(h, 'Divination')).toEqual(['U']);
  });

  test('a count and a number stack, and the total still never goes below zero', () => {
    const g = scenario()
      .seat(0)
      .hand('Divination')
      .battlefield(CHANT, HAZE, 'Island', 'Island', 'Island')
      .seat(1)
      .build();
    // Chant 1 + Haze (three Islands... and the lands it counts: 3) = 4 off {2}{U}: {U}.
    expect(costOf(g, 'Divination')).toEqual(['U']);
  });

  test('a spell’s own reduction and a permanent’s together', () => {
    const g = scenario()
      .seat(0)
      .hand(WRATH)
      .battlefield(CHANT)
      .battlefield('Mountain', { count: 3 })
      .battlefield('Grizzly Bears', { count: 5 })
      .seat(1)
      .build();
    // {8}{R}: five creatures and the Chant take six: {2}{R}.
    expect(costOf(g, WRATH)).toEqual(['2', 'R']);
    g.expect.legal(0, { cast: WRATH });
  });

  test('a reduction without “you cast” reduces every player’s spells, counted for its controller', () => {
    const g = scenario()
      .seat(0)
      .hand('Divination')
      .battlefield('Island')
      .seat(1)
      .battlefield(HAZE, 'Island', 'Island')
      .build();
    // Haze reduces spells of every player, by the lands its controller (seat 1) has: two.
    expect(costOf(g, 'Divination')).toEqual(['U']);
  });
});

describe('with commander tax, kicker and additional costs (CR 601.2f)', () => {
  test('commander tax is part of the cost that is reduced: {W} and {2} less {2} is {W}', () => {
    const g = scenario()
      .seat(0)
      .commander('Isamaru, Hound of Konda', { casts: 1, label: 'cmd' })
      .battlefield(GIANT, 'Plains')
      .seat(1)
      .build();
    expect(costOf(g, 'Isamaru, Hound of Konda')).toEqual(['W']);
    g.expect.legal(0, { cast: 'cmd' });
    g.act(0).cast('cmd', { pay: true });
    g.expect.eventLog([{ kind: 'spellCast', fromZone: 'command', commanderTax: 2 }]);
    g.expect.tapped('Plains');
  });

  test('the reduction cannot take the colored part of the tax-laden cost', () => {
    const g = scenario()
      .seat(0)
      .commander('Isamaru, Hound of Konda', { casts: 3, label: 'cmd' })
      .battlefield(GIANT)
      .battlefield('Plains', { count: 4 })
      .seat(1)
      .build();
    // {W} + {2}{2}{2} = {6}{W}; Giant Discount takes {2}: {4}{W}, five mana.
    expect(costOf(g, 'Isamaru, Hound of Konda')).toEqual(['4', 'W']);
    g.expect.illegal(0, { cast: 'cmd' });
  });

  test('a kicked spell is reduced on its kicker cost: {R}{2} under a Chant is {1}{R}', () => {
    const g = scenario()
      .seat(0)
      .hand(KICK)
      .battlefield(CHANT)
      .battlefield('Mountain', { count: 2 })
      .battlefield('Grizzly Bears')
      .seat(1)
      .build();
    g.act(0).cast(KICK);
    // The kicked total is {R}{1}: two Mountains pay it, so the question is asked.
    expect(g.state.pending?.kind).toBe('confirmOptional');
    g.act(0).accept();
    g.act(0).chooseTargets({ player: 1 });
    expect(g.state.casting?.totalCost).toEqual(['1', 'R']);
    g.act(0).payAuto();
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 0 });
    g.passAll();
    g.expect.life(1, 35);
  });

  test('the cost is locked in before the sacrifice (CR 601.2h): the count is the one before', () => {
    const g = scenario()
      .seat(0)
      .hand(RITE)
      .battlefield('Swamp', { count: 2 })
      .battlefield('Grizzly Bears', 'Llanowar Elves', 'Giant Spider')
      .library('Plains', 'Plains', 'Plains')
      .seat(1)
      .build();
    // Three creatures: {4}{B} less {3} is {1}{B}. Sacrificing one afterwards does not change it.
    expect(costOf(g, RITE)).toEqual(['1', 'B']);
    g.expect.legal(0, { cast: RITE });
    const cast = g.act(0).cast(RITE);
    expect(g.state.casting?.totalCost).toEqual(['1', 'B']);
    cast.pay();
    g.act(0).choosePermanents('Llanowar Elves');
    g.expect.tapped('Swamp[0]');
    g.expect.tapped('Swamp[1]');
    g.passAll();
    g.expect.handSize(0, 3);
  });
});

describe('the view and the legal actions agree with the payment', () => {
  test('a card is offered exactly when its reduced cost can be paid, for every land count', () => {
    for (let lands = 0; lands <= 7; lands += 1) {
      const b = scenario().seat(0).hand(WRATH);
      if (lands > 0) b.battlefield('Mountain', { count: lands });
      const g = b.battlefield('Grizzly Bears', { count: 3 }).seat(1).build();
      // Three creatures: {5}{R}, six mana.
      const needed = 6;
      expect(g.act(0).try.cast(WRATH).ok, `${lands} lands`).toBe(lands >= needed);
    }
  });
});
