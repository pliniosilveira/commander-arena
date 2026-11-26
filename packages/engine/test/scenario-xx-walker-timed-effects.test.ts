// Timed effects of a planeswalker (Will Kenrith and Rowan Kenrith, issue 167), as SYNTHETIC nodes written by hand: base power and toughness and "loses all abilities" until the controller's
// next turn (`setPt`, `loseAllAbilities` with `untilYourNextTurn`), a cost reduction for the spells a chosen player casts until the controller's next turn (`playerSpellsCostLess`), and
// "attacks if able" on the creatures of a chosen player on their next turn (`requireAttackSource` with `anything`). The cards package plays the real Oracle text against these.
// Pins: CR 611.2a and 611.2c (the set is fixed as the ability resolves), CR 500.1 (the turn it resolves in is not counted), CR 613.1f and 613.4b (layers 6 and 7b), CR 601.2f and 118.7a
// (a generic reduction, never below zero), CR 508.1d (a requirement is obeyed when able), CR 606 (loyalty abilities).
import { describe, expect, test } from 'vitest';
import type { Effect } from '../src/ast/types';
import { singleFace } from '../src/cards/fixtures/helpers';
import { loyaltyAbility } from '../src/cards/fixtures/synthetic-planeswalkers';
import { type CardDefinition, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const WALKER = 'SYNTHETIC Timed Walker';
const BEARS = 'Grizzly Bears';
const ANGEL = 'Serra Angel';
const LIBRARY = Array.from({ length: 10 }, () => 'Plains');

const walker = (effects: readonly Effect[]): CardDefinition =>
  singleFace({
    name: WALKER,
    manaCost: ['4', 'U', 'U'],
    supertypes: ['legendary'],
    types: ['planeswalker'],
    subtypes: ['Synthetic'],
    colors: ['U'],
    colorIdentity: ['U'],
    loyalty: 4,
    oracleText: 'SYNTHETIC',
    abilities: effects.map((effect, i) =>
      loyaltyAbility(
        i + 1,
        effect,
        i === 0
          ? [
              {
                id: 't1',
                what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
              },
            ]
          : [{ id: 't1', what: { kind: 'player', filter: 'any' } }],
      ),
    ),
  });

const SHRINK: Effect = {
  kind: 'sequence',
  effects: [
    {
      kind: 'setPt',
      objects: { kind: 'target', id: 't1' },
      power: 0,
      toughness: 3,
      duration: 'untilYourNextTurn',
    },
    {
      kind: 'loseAllAbilities',
      objects: { kind: 'target', id: 't1' },
      duration: 'untilYourNextTurn',
    },
  ],
};
const DISCOUNT: Effect = {
  kind: 'playerSpellsCostLess',
  player: { kind: 'target', id: 't1' },
  spells: { anyOf: [{ types: ['instant'] }, { types: ['sorcery'] }] },
  amount: 2,
  duration: 'untilYourNextTurn',
};
const MUST_ATTACK: Effect = {
  kind: 'requireAttackSource',
  player: { kind: 'target', id: 't1' },
  duration: 'untilEndOfTheirNextTurn',
  anything: true,
};

describe('the nodes are valid', () => {
  test('validateCard finds nothing', () => {
    expect(validateCard(walker([SHRINK, DISCOUNT, MUST_ATTACK]))).toEqual([]);
  });

  test('a reduction names a whole number of generic mana, spells with no zone and no controller', () => {
    const bad = (patch: Partial<Extract<Effect, { kind: 'playerSpellsCostLess' }>>) =>
      validateCard(walker([SHRINK, { ...DISCOUNT, ...patch } as Effect])).map((i) => i.message);
    expect(bad({ amount: 0 }).join()).toMatch(/whole number/);
    expect(bad({ amount: 1.5 }).join()).toMatch(/whole number/);
    expect(bad({ spells: { types: ['instant'], zone: 'hand' } }).join()).toMatch(
      /spell being cast/,
    );
    expect(bad({ spells: { types: ['instant'], controller: 'you' } }).join()).toMatch(
      /spell being cast/,
    );
  });
});

describe('until your next turn on base power and toughness and on losing abilities', () => {
  const board = () =>
    scenario()
      .define(walker([SHRINK, DISCOUNT, MUST_ATTACK]))
      .seat(0)
      .library(...LIBRARY)
      .battlefield(WALKER)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(ANGEL, BEARS)
      .at('precombatMain', { active: 0 })
      .build();

  test('the creature is 0/3 with no abilities through the opponent turn and is itself again as my turn begins', () => {
    const g = board();
    g.act(0).activate(WALKER, { ability: 0, targets: [ANGEL] });
    g.passAll();
    g.expect.pt(ANGEL, 0, 3);
    g.expect.derived(ANGEL, { keywords: [] });
    g.expect.pt(BEARS, 2, 2);
    g.advanceTo('precombatMain', { turn: 'next' });
    g.expect.pt(ANGEL, 0, 3);
    g.advanceTo('precombatMain', { turn: 'next' });
    g.expect.pt(ANGEL, 4, 4);
    g.expect.derived(ANGEL, { keywords: ['flying', 'vigilance'] });
  });

  test('a creature that arrives later is not affected (the set is fixed as the ability resolves)', () => {
    const g = board();
    g.act(0).activate(WALKER, { ability: 0, targets: [BEARS] });
    g.passAll();
    g.expect.pt(BEARS, 0, 3);
    g.expect.pt(ANGEL, 4, 4);
  });
});

describe('a cost reduction for the spells a player casts until my next turn', () => {
  test('Divination costs {2} less for the targeted opponent, not for me', () => {
    const g = scenario()
      .define(walker([SHRINK, DISCOUNT, MUST_ATTACK]))
      .seat(0)
      .library(...LIBRARY)
      .battlefield(WALKER, 'Island')
      .hand('Divination')
      .seat(1)
      .library(...LIBRARY)
      .battlefield('Island')
      .hand('Divination')
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).activate(WALKER, { ability: 1, targets: [{ player: 1 }] });
    g.passAll();
    // I have one Island: my {2}{U} is still out of reach.
    expect(() => g.act(0).cast('Divination', { pay: true })).toThrow(/engine rejected/);
    // On their own turn the opponent casts theirs for {U}: the reduction lasts through it (CR 500.1).
    g.advanceTo('precombatMain', { turn: 'next' });
    g.act(1).cast('Divination', { pay: true });
    g.passAll();
    g.expect.zone('Divination', 'graveyard', { seat: 1 });
  });
});

describe('creatures of a player attack on their next turn if able, with no permanent to attack', () => {
  test('both creatures are required, and the requirement is over after that turn', () => {
    const g = scenario()
      .define(walker([SHRINK, DISCOUNT, MUST_ATTACK]))
      .seat(0)
      .library(...LIBRARY)
      .battlefield(WALKER)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(ANGEL, BEARS)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).activate(WALKER, { ability: 2, targets: [{ player: 1 }] });
    g.passAll();
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('declareAttackers', { attack: false });
    const d = g.state.pending;
    if (d?.kind !== 'declareAttackers')
      throw new Error(`expected declareAttackers, got ${d?.kind}`);
    expect([...d.mustAttack].sort()).toEqual([g.id(ANGEL), g.id(BEARS)].sort());
    expect(g.act(1).try.declareAttackers([{ attacker: ANGEL }]).ok).toBe(false);
    expect(g.act(1).try.declareAttackers([{ attacker: ANGEL }, { attacker: BEARS }]).ok).toBe(true);
  });
});
