// Token replacement effects, the Blood token and a token leaving the battlefield (Squirreled Away deck, group 1).
// "If you would create a Clue, Food, or Treasure token, instead create one of each." (`tokensInstead`, mode `eachOf`) and "If one or more tokens would be created under
// your control, those tokens plus that many 1/1 green Squirrel creature tokens are created instead." (mode `plusThatMany`).
// Pins: CR 614.1a (a replacement effect of a permanent), CR 614.5 (an effect replaces an event once: two of the first make three times as many of each), CR 616.1 (the
// affected player orders the effects; asked only when the order changes what is made), CR 111.10 (predefined tokens), CR 603.10a (a token that left the battlefield
// still triggers: leaves-the-battlefield abilities look back). The cards are SYNTHETIC (src/cards/fixtures/synthetic-squirrel-g1.ts).
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';

const MAKER = 'SYNTHETIC Trinket Maker';
const MAKER_TWIN = 'SYNTHETIC Trinket Maker Twin';
const BOSS = 'SYNTHETIC Squirrel Boss';
const BOSS_TWIN = 'SYNTHETIC Squirrel Boss Twin';
const CLUE_SPELL = 'SYNTHETIC Clue Spell';
const BLOOD_SPELL = 'SYNTHETIC Blood Spell';
const MOURNER = 'SYNTHETIC Blood Mourner';
const DRAINER = 'SYNTHETIC Token Drainer';
const TREASURES = 'SYNTHETIC Treasure Pair'; // two Treasure tokens
const MUSTER = 'SYNTHETIC Muster Call'; // two tapped 1/1 Soldiers
const LIB = Array.from({ length: 6 }, () => 'Plains');

const count = (g: ScenarioGame, name: string, seat: 0 | 1 | 2 = 0): number =>
  g.state.battlefield.filter((id) => {
    const o = g.state.objects[id];
    return o?.token?.characteristics.name === name && o.controller === seat;
  }).length;

const cast = (spell: string, ...mine: string[]) => {
  const g = scenario()
    .seat(0)
    .hand(spell)
    .battlefield('Plains', 'Mountain')
    .battlefield(...mine)
    .seat(1)
    .library(...LIB)
    .build();
  g.act(0).cast(spell, { pay: true });
  g.passAll();
  return g;
};

describe('the cards are valid', () => {
  test.each([MAKER, BOSS, MOURNER, DRAINER, BLOOD_SPELL])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });

  test('an each-of replacement names at least two predefined tokens', () => {
    const card = syntheticCard(MAKER);
    const face = card.faces[0];
    if (face === undefined) throw new Error('no face');
    const withRule = (rule: Record<string, unknown>) =>
      ({
        ...card,
        faces: [
          {
            ...face,
            abilities: [
              {
                kind: 'replacement',
                replacement: { kind: 'tokensInstead', what: { token: true }, ...rule },
              },
            ],
          },
        ],
      }) as never;
    const clue = { kind: 'preset', preset: 'Clue' };
    const food = { kind: 'preset', preset: 'Food' };
    expect(validateCard(withRule({ mode: 'eachOf', tokens: [clue, food] }))).toEqual([]);
    expect(validateCard(withRule({ mode: 'eachOf', tokens: [clue] }))).not.toEqual([]);
    expect(validateCard(withRule({ mode: 'eachOf' }))).not.toEqual([]);
    expect(
      validateCard(withRule({ mode: 'eachOf', tokens: [clue, { kind: 'copyOf' }] })),
    ).not.toEqual([]);
  });
});

describe('one of each instead (CR 614.1a, 111.10)', () => {
  test('a Clue becomes a Clue, a Food and a Treasure', () => {
    const g = cast(CLUE_SPELL, MAKER);
    expect([count(g, 'Clue'), count(g, 'Food'), count(g, 'Treasure')]).toEqual([1, 1, 1]);
    g.expect.invariants();
  });

  test('without the replacement: just the Clue (the baseline)', () => {
    const g = cast(CLUE_SPELL);
    expect([count(g, 'Clue'), count(g, 'Food'), count(g, 'Treasure')]).toEqual([1, 0, 0]);
  });

  test('two Treasures become two of each: that many of each kind', () => {
    const g = cast(TREASURES, MAKER);
    expect([count(g, 'Clue'), count(g, 'Food'), count(g, 'Treasure')]).toEqual([2, 2, 2]);
  });

  test('two of the replacement make three times as many of each (CR 614.5: each applies once)', () => {
    const g = cast(TREASURES, MAKER, MAKER_TWIN);
    expect([count(g, 'Clue'), count(g, 'Food'), count(g, 'Treasure')]).toEqual([6, 6, 6]);
  });

  test('a token that is none of the three is not replaced', () => {
    const g = cast(MUSTER, MAKER);
    expect(count(g, 'Soldier')).toBe(2);
    expect([count(g, 'Clue'), count(g, 'Food'), count(g, 'Treasure')]).toEqual([0, 0, 0]);
  });

  test("an opponent's replacement does not apply to my tokens", () => {
    const g = scenario()
      .seat(0)
      .hand(CLUE_SPELL)
      .battlefield('Plains', 'Mountain')
      .seat(1)
      .battlefield(MAKER)
      .library(...LIB)
      .build();
    g.act(0).cast(CLUE_SPELL, { pay: true });
    g.passAll();
    expect([count(g, 'Clue'), count(g, 'Food'), count(g, 'Treasure')]).toEqual([1, 0, 0]);
  });

  test('with three seats: the replacement of the seat that creates applies, those of the others do not', () => {
    const g = scenario({ seats: 3 })
      .seat(0)
      .hand(CLUE_SPELL)
      .battlefield('Plains', 'Mountain')
      .seat(1)
      .battlefield(MAKER)
      .library(...LIB)
      .seat(2)
      .battlefield(MAKER_TWIN)
      .library(...LIB)
      .build();
    g.act(0).cast(CLUE_SPELL, { pay: true });
    g.passAll();
    expect([count(g, 'Clue'), count(g, 'Food'), count(g, 'Treasure')]).toEqual([1, 0, 0]);
    expect([count(g, 'Clue', 1), count(g, 'Food', 1), count(g, 'Treasure', 1)]).toEqual([0, 0, 0]);
  });
});

describe('those tokens plus that many Squirrels (CR 614.1a)', () => {
  test('two tapped Soldiers: two tapped Soldiers and two Squirrels, what the spell said (tapped) applies to the added ones too', () => {
    const g = cast(MUSTER, BOSS);
    expect(count(g, 'Soldier')).toBe(2);
    expect(count(g, 'Squirrel')).toBe(2);
    for (const id of g.state.battlefield) {
      const o = g.state.objects[id];
      if (o?.token) expect(o.tapped).toBe(true);
    }
    g.expect.invariants();
  });

  test('it applies to every kind of token: a Clue and a Squirrel', () => {
    const g = cast(CLUE_SPELL, BOSS);
    expect([count(g, 'Clue'), count(g, 'Squirrel')]).toEqual([1, 1]);
  });

  test('two of them apply once each (CR 614.5): the Squirrels of the first are counted by the second', () => {
    const g = cast(TREASURES, BOSS, BOSS_TWIN);
    // Two Treasures, plus two Squirrels, then plus as many again of all four tokens: 2 + 2 + 4.
    expect(count(g, 'Treasure')).toBe(2);
    expect(count(g, 'Squirrel')).toBe(6);
  });

  test("an opponent's does not apply to my tokens", () => {
    const g = scenario()
      .seat(0)
      .hand(CLUE_SPELL)
      .battlefield('Plains', 'Mountain')
      .seat(1)
      .battlefield(BOSS)
      .library(...LIB)
      .build();
    g.act(0).cast(CLUE_SPELL, { pay: true });
    g.passAll();
    expect(count(g, 'Squirrel')).toBe(0);
    expect(count(g, 'Squirrel', 1)).toBe(0);
  });

  test('with three seats the replacement applies to tokens its controller creates only', () => {
    const g = scenario({ seats: 3 })
      .seat(0)
      .hand(CLUE_SPELL)
      .battlefield('Plains', 'Mountain')
      .seat(1)
      .library(...LIB)
      .seat(2)
      .battlefield(BOSS)
      .library(...LIB)
      .build();
    g.act(0).cast(CLUE_SPELL, { pay: true });
    g.passAll();
    expect([count(g, 'Clue'), count(g, 'Squirrel', 0), count(g, 'Squirrel', 2)]).toEqual([1, 0, 0]);
  });
});

describe('both together (CR 616.1: the order is the affected player\u2019s)', () => {
  const make = (first: 'maker' | 'boss') => {
    const g = scenario()
      .seat(0)
      .hand(CLUE_SPELL)
      .battlefield('Plains', 'Mountain')
      .battlefield(MAKER, BOSS)
      .seat(1)
      .library(...LIB)
      .build();
    g.act(0).cast(CLUE_SPELL, { pay: true });
    g.passAll();
    const d = g.state.pending;
    if (d?.kind !== 'chooseOption' || d.replacement?.tokens === undefined) {
      throw new Error(`expected the replacement question, got ${d?.kind}`);
    }
    expect(d.seat).toBe(0);
    const choices = d.replacement.choices;
    const maker = choices.find((c) => c.text.startsWith('Create one of each'));
    const boss = choices.find((c) => c.text.startsWith('Create those tokens plus that many'));
    // The Squirrels the boss adds are not replaced by the maker (it names Clues, Foods and Treasures), but they are added for every token there is when the boss applies:
    // the maker first leaves three tokens for the boss (six in all), the boss first leaves one (four in all).
    expect(maker?.kind === 'tokens' ? maker.outcome.total : -1).toBe(6);
    expect(boss?.kind === 'tokens' ? boss.outcome.total : -1).toBe(4);
    g.act(0).chooseOption((first === 'maker' ? maker : boss)?.option ?? '');
    g.passAll();
    return g;
  };

  test('the maker first: one of each, then a Squirrel for each of the three', () => {
    const g = make('maker');
    expect([count(g, 'Clue'), count(g, 'Food'), count(g, 'Treasure')]).toEqual([1, 1, 1]);
    expect(count(g, 'Squirrel')).toBe(3);
    g.expect.invariants();
  });

  test('the boss first: a Squirrel for the Clue, then the Clue becomes one of each', () => {
    const g = make('boss');
    expect([count(g, 'Clue'), count(g, 'Food'), count(g, 'Treasure')]).toEqual([1, 1, 1]);
    expect(count(g, 'Squirrel')).toBe(1);
    g.expect.invariants();
  });
});

describe('the Blood token (CR 111.10)', () => {
  test('a Blood token is an artifact with the Blood subtype and its ability: {1}, {T}, discard a card, sacrifice: draw a card', () => {
    const g = cast(BLOOD_SPELL);
    expect(count(g, 'Blood')).toBe(1);
    g.expect.derived(
      { name: 'Blood', zone: 'battlefield', nth: 0 },
      { types: ['artifact'], subtypes: ['Blood'] },
    );
    g.expect.invariants();
  });

  test('it can be sacrificed to draw: {1}, {T}, discard a card', () => {
    const g = scenario()
      .seat(0)
      .library(...LIB)
      .hand(BLOOD_SPELL, 'Plains')
      .battlefield('Plains', 'Plains', 'Plains')
      .seat(1)
      .library(...LIB)
      .build();
    g.act(0).cast(BLOOD_SPELL, { pay: true });
    g.passAll();
    const hand = g.state.seats[0]?.hand.length ?? 0;
    g.act(0).activate({ name: 'Blood', zone: 'battlefield', nth: 0 }, { pay: true });
    g.passAll();
    expect(count(g, 'Blood')).toBe(0);
    // One card discarded and one drawn.
    expect(g.state.seats[0]?.hand.length).toBe(hand);
    expect(g.state.seats[0]?.graveyard.length).toBe(1 + 1);
  });

  test('a creature an opponent controls dies: its controller of the watcher creates a Blood token', () => {
    const g = scenario({ seats: 3 })
      .seat(0)
      .hand('Murder')
      .battlefield('Swamp', 'Swamp', 'Swamp', MOURNER)
      .library(...LIB)
      .seat(1)
      .battlefield('Grizzly Bears')
      .library(...LIB)
      .seat(2)
      .library(...LIB)
      .build();
    g.act(0).cast('Murder', { pay: true, targets: ['Grizzly Bears'] });
    g.passAll();
    expect(count(g, 'Blood', 0)).toBe(1);
    expect(count(g, 'Blood', 1)).toBe(0);
  });
});

describe('a token you control leaves the battlefield (CR 603.6c, 603.10a)', () => {
  const sacrifice = (...mine: string[]) => {
    const g = scenario({ seats: 3 })
      .seat(0)
      .hand(TREASURES)
      .battlefield('Plains', 'Mountain', DRAINER, ...mine)
      .library(...LIB)
      .seat(1)
      .library(...LIB)
      .seat(2)
      .library(...LIB)
      .build();
    g.act(0).cast(TREASURES, { pay: true });
    g.passAll();
    return g;
  };

  test('a Treasure sacrificed for mana: each opponent loses 1 life and I gain 1', () => {
    const g = sacrifice();
    const before = g.state.seats.map((s) => s.life);
    g.act(0).tapForMana({ name: 'Treasure', zone: 'battlefield', nth: 0 }, { color: 'R' });
    g.passAll();
    expect(g.state.seats.map((s) => s.life)).toEqual([
      (before[0] ?? 0) + 1,
      (before[1] ?? 0) - 1,
      (before[2] ?? 0) - 1,
    ]);
    g.expect.invariants();
  });

  test('a creature that is not a token leaving does not trigger it', () => {
    const g = scenario()
      .seat(0)
      .hand('Murder')
      .battlefield('Swamp', 'Swamp', 'Swamp', DRAINER)
      .library(...LIB)
      .seat(1)
      .library(...LIB)
      .build();
    const before = g.state.seats.map((s) => s.life);
    g.act(0).cast('Murder', { pay: true, targets: [DRAINER] });
    g.passAll();
    expect(g.state.seats.map((s) => s.life)).toEqual(before);
  });
});
