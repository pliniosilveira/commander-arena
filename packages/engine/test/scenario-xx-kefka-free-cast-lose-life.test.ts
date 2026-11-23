// "Exile a card at random from each opponent's graveyard. You may cast any number of spells from among cards exiled this way without paying their mana costs. Then each player who owns a
// spell you cast this way loses life equal to its mana value." (Kefka, Dancing Mad, issue 97). Pins: CR 608.2g (casting during resolution), CR 118.9 (without paying), CR 101.4 (APNAP order),
// CR 202.3 (mana value), CR 701.13 (Exile). Cards are SYNTHETIC wrappers of the real mechanics; the opponents' graveyards use real cards.
import { describe, expect, test } from 'vitest';
import { scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';

const CASTER = 'SYNTHETIC Random Exile Caster';
const BEARS = 'Grizzly Bears';
const SPIDER = 'Giant Spider';

const caster = singleFaceCard({
  name: CASTER,
  manaCost: ['U'],
  types: ['sorcery'],
  colors: ['U'],
  colorIdentity: ['U'],
  oracleText:
    'Exile a card at random from each opponent’s graveyard. You may cast any number of spells from among cards exiled this way without paying their mana costs. Then each player who owns a spell you cast this way loses life equal to its mana value.',
  spell: {
    effect: {
      kind: 'sequence',
      effects: [
        {
          kind: 'exile',
          objects: {
            kind: 'each',
            filter: { zone: 'graveyard', owner: { kind: 'eachOpponent' } },
          },
          atRandom: true,
          perOwner: true,
        },
        { kind: 'castFree', objects: { kind: 'moved' }, max: 'any', remember: true },
        { kind: 'loseLifeManaValue', spells: { kind: 'moved' } },
      ],
    },
  },
});

function table(seed?: number) {
  const b = scenario({ seats: 4 })
    .seat(0)
    .define(caster)
    .hand(CASTER)
    .battlefield('Island')
    .seat(1)
    .graveyard(BEARS, BEARS)
    .seat(2)
    .graveyard(SPIDER, SPIDER, SPIDER)
    .seat(3)
    .at('precombatMain', { active: 0, turn: 1 });
  return (seed === undefined ? b : b.seed(seed)).build();
}

describe('Exile a card at random from each opponent graveyard, cast them free, owners lose life', () => {
  test('one card is exiled from each opponent graveyard and the others stay', () => {
    const g = table();
    g.act(0).cast(CASTER, { pay: true });
    g.passAll();
    const s = g.state;
    const exiled = Object.values(s.objects).filter((o) => o.zone === 'exile');
    expect(exiled.map((o) => o.owner).sort()).toEqual([1, 2]);
    expect(s.seats[1]?.graveyard.length).toBe(1);
    expect(s.seats[2]?.graveyard.length).toBe(2);
  });

  test('the same seed picks the same cards (seeded PRNG only)', () => {
    const run = () => {
      const g = table(7);
      g.act(0).cast(CASTER, { pay: true });
      g.passAll();
      return Object.values(g.state.objects)
        .filter((o) => o.zone === 'exile')
        .map((o) => `${o.owner}:${o.id}`)
        .sort();
    };
    expect(run()).toEqual(run());
  });

  test('casting both, each owner loses life equal to the mana value of their spell', () => {
    // Seat 1 has only Grizzly Bears (mana value 2); seat 2 has Giant Spider (mana value 4).
    const g = scenario({ seats: 4 })
      .seat(0)
      .define(caster)
      .hand(CASTER)
      .battlefield('Island')
      .seat(1)
      .graveyard(BEARS)
      .seat(2)
      .graveyard(SPIDER)
      .seat(3)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.act(0).cast(CASTER, { pay: true });
    g.passAll();
    g.expect.pending('chooseCards', 0);
    g.act(0).chooseCards({ name: BEARS, zone: 'exile', seat: 1 });
    g.expect.pending('chooseCards', 0);
    g.act(0).chooseCards({ name: SPIDER, zone: 'exile', seat: 2 });
    g.expect.stack([SPIDER, BEARS]);
    g.expect.life(0, 40);
    g.expect.life(1, 38);
    g.expect.life(2, 36);
    g.expect.life(3, 40);
    g.expect.invariants();
  });

  test('a spell that is not cast costs its owner nothing', () => {
    const g = scenario({ seats: 4 })
      .seat(0)
      .define(caster)
      .hand(CASTER)
      .battlefield('Island')
      .seat(1)
      .graveyard(BEARS)
      .seat(2)
      .graveyard(SPIDER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.act(0).cast(CASTER, { pay: true });
    g.passAll();
    g.act(0).chooseCards({ name: SPIDER, zone: 'exile', seat: 2 });
    g.act(0).chooseCards();
    g.expect.life(1, 40);
    g.expect.life(2, 36);
  });

  test('casting nothing loses no life and leaves the cards in exile', () => {
    const g = table();
    g.act(0).cast(CASTER, { pay: true });
    g.passAll();
    g.act(0).chooseCards();
    for (const seat of [0, 1, 2, 3]) g.expect.life(seat, 40);
    expect(Object.values(g.state.objects).filter((o) => o.zone === 'exile').length).toBe(2);
  });

  test('a player with an empty graveyard is skipped', () => {
    const g = scenario({ seats: 4 })
      .seat(0)
      .define(caster)
      .hand(CASTER)
      .battlefield('Island')
      .seat(1)
      .seat(2)
      .graveyard(SPIDER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.act(0).cast(CASTER, { pay: true });
    g.passAll();
    expect(Object.values(g.state.objects).filter((o) => o.zone === 'exile').length).toBe(1);
  });
});
