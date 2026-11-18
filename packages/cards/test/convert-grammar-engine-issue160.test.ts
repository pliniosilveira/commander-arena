// The cards of issue 160 (the Token Triumph precon), run as written (D-609 and the following entries). Each group imports SYNTHETIC cards through the grammar (never through a
// fixture), defines them in an engine scenario and plays them through applyAction. Every card name starts with "SYNTHETIC"; the wording of each text is that of the real card
// the issue names, taken from the card data of the issue's comment. No real card's text is claimed beyond that.
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const FILLER = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains'] as const;
const BEARS = 'Grizzly Bears';

type Builder = ReturnType<typeof scenario>;

function main(mine: (b: Builder) => Builder, theirs: (b: Builder) => Builder = (b) => b) {
  const a = mine(
    scenario()
      .seat(0)
      .life(20)
      .library(...FILLER),
  );
  return theirs(
    a
      .seat(1)
      .life(20)
      .library(...FILLER),
  )
    .at('precombatMain', { active: 0 })
    .build();
}

const tokens = (g: ScenarioGame, name: string, seat: 0 | 1 = 0) =>
  g.state.battlefield
    .map((id) => g.state.objects[id])
    .filter((o) => o?.token?.characteristics.name === name && o.controller === seat);

// ---- Group 1: "Tap an untapped creature you control" next to mana and in a mana ability (D-609).

const EVANGEL = parsed(
  'SYNTHETIC Parsed Evangel',
  'Creature — Elf Shaman',
  '{1}, {T}, Tap an untapped creature you control: Create a 1/1 green Saproling creature token.',
  { manaCost: '{1}{G}', colors: ['G'], power: '1', toughness: '1' },
);
const SENTINEL = parsed(
  'SYNTHETIC Parsed Sentinel',
  'Creature — Elf Scout',
  'Reach\n{T}, Tap an untapped creature you control: Add one mana of any color.',
  { manaCost: '{1}{G}', colors: ['G'], power: '1', toughness: '2' },
);
const SETTLEMENT = parsed(
  'SYNTHETIC Parsed Settlement',
  'Land',
  '{T}: Add {C}.\n{T}, Tap an untapped creature you control: Add one mana of any color.',
);

describe('"Tap an untapped creature you control" in the cost of an ability (D-609)', () => {
  test('{1}, {T} and a creature: the creature is tapped first, the mana is paid, a Saproling is made', () => {
    const g = main((b) =>
      b.define(EVANGEL).battlefield(EVANGEL.name).battlefield(BEARS).battlefield('Forest'),
    );
    g.act(0).activate(EVANGEL.name);
    g.expect.tapped(EVANGEL.name, true);
    g.expect.tapped(BEARS, true);
    g.act(0).payAuto();
    g.passAll();
    expect(tokens(g, 'Saproling')).toHaveLength(1);
    g.expect.invariants();
  });

  test('the creature tapped for the cost cannot be tapped for the mana as well', () => {
    const g = main((b) =>
      b.define(EVANGEL).battlefield(EVANGEL.name).battlefield('Llanowar Elves'),
    );
    g.act(0).activate(EVANGEL.name);
    g.expect.tapped('Llanowar Elves', true);
    // Only the Elves could have paid the {1}, and they are tapped now: the player takes it back.
    expect(g.act(0).try.action({ kind: 'payAuto' }).ok).toBe(false);
  });

  test('a mana ability that taps a creature: the Sentinel taps itself and the Bears, and makes one mana of any color', () => {
    const g = main((b) => b.define(SENTINEL).battlefield(SENTINEL.name).battlefield(BEARS));
    g.act(0).tapForMana(SENTINEL.name, { color: 'B' });
    g.expect.tapped(SENTINEL.name, true);
    g.expect.tapped(BEARS, true);
    expect(g.state.seats[0]?.manaPool.map((m) => m.color)).toEqual(['B']);
  });

  test('the land: a creature to tap, and then the land makes a color; without one it makes {C} only', () => {
    const lone = main((b) => b.define(SETTLEMENT).battlefield(SETTLEMENT.name));
    expect(() => lone.act(0).tapForMana(SETTLEMENT.name, { ability: 1, color: 'W' })).toThrow();
    lone.act(0).tapForMana(SETTLEMENT.name, { ability: 0 });
    expect(lone.state.seats[0]?.manaPool.map((m) => m.color)).toEqual(['C']);
    const g = main((b) => b.define(SETTLEMENT).battlefield(SETTLEMENT.name).battlefield(BEARS));
    g.act(0).tapForMana(SETTLEMENT.name, { ability: 1, color: 'W' });
    g.expect.tapped(SETTLEMENT.name, true);
    g.expect.tapped(BEARS, true);
    expect(g.state.seats[0]?.manaPool.map((m) => m.color)).toEqual(['W']);
  });
});
