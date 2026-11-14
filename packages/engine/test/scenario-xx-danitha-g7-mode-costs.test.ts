// The Danitha deck (issue 26), group 7 (D-433): modes that have a cost listed before their effect, Tiered (Restoration Magic).
// Pins: CR 702.183a (Tiered: "Choose one. As an additional cost to cast this spell, pay the cost associated with that mode."), CR 700.2h (a mode with a cost before its effect has an
// additional cost that must be paid as the spell is cast if the mode is chosen; with several such modes chosen, all the costs are paid), CR 601.2b-f (the modes are announced first, the
// total cost is the mana cost plus all additional costs), CR 118.3 (a cost that cannot be paid is not paid: a set of modes the caster cannot afford is not offered), CR 700.2a.
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-danitha-g7.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import { isFeatureSupported, syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';
import { chooseModesDecision } from './pending-helpers';

const TIERED = 'SYNTHETIC Tiered Ward'; // {W}; {0}, {1}, {3}{W}
const PAIR = 'SYNTHETIC Costed Pair'; // {R}, choose one or more: {1} gain 2, {R} 3 damage to a creature
const HALF = 'SYNTHETIC Half Costed Choice'; // {U}, choose one: gain 2, or {2}{U} draw two
const BEARS = 'Grizzly Bears';
const LIBRARY = Array.from({ length: 8 }, () => 'Forest');

/** Seat 0 holds `card` with the lands given; seat 1 has a Bears. Seat 0 is in its precombat main phase with 20 life. */
function game(card: string, lands: readonly string[]) {
  const b = scenario();
  for (const name of [TIERED, PAIR, HALF]) b.define(syntheticCard(name));
  b.seat(0)
    .life(20)
    .library(...LIBRARY)
    .hand(card)
    .battlefield(...lands)
    .battlefield(BEARS, { label: 'mine' });
  b.seat(1)
    .life(20)
    .library(...LIBRARY)
    .battlefield(BEARS, { label: 'theirs' });
  return b.at('precombatMain', { active: 0, priority: 0 }).build();
}

const LANDS = ['Plains', 'Forest', 'Mountain', 'Island', 'Swamp'];
const tapped = (g: ReturnType<typeof game>): number =>
  LANDS.flatMap((name) => g.find({ name, zone: 'battlefield' })).filter((o) => o.tapped).length;

describe('the cards are valid', () => {
  test.each([TIERED, PAIR, HALF])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });

  test('the feature is claimed', () => {
    expect(isFeatureSupported('ability:modeCost')).toBe(true);
  });
});

describe('Tiered: the cost of the chosen mode is an additional cost (CR 702.183a, 700.2h)', () => {
  test('the {0} tier costs only the mana cost: one Plains', () => {
    const g = game(TIERED, ['Plains', 'Plains', 'Plains', 'Plains', 'Plains']);
    g.act(0).cast(TIERED).modes(0).targets(['mine']).pay();
    expect(tapped(g)).toBe(1);
    g.passAll();
    g.expect.derived('mine', { keywords: ['hexproof', 'indestructible'] });
    g.expect.life(0, 20);
  });

  test('the {1} tier costs {W}{1}: two lands, and gains 3 life', () => {
    const g = game(TIERED, ['Plains', 'Plains', 'Plains', 'Plains', 'Plains']);
    g.act(0).cast(TIERED).modes(1).targets(['theirs']).pay();
    expect(tapped(g)).toBe(2);
    g.passAll();
    g.expect.derived('theirs', { keywords: ['hexproof', 'indestructible'] });
    g.expect.life(0, 23);
  });

  test('the {3}{W} tier costs {W}{3}{W}: five lands, and the group is protected', () => {
    const g = game(TIERED, ['Plains', 'Plains', 'Plains', 'Plains', 'Plains']);
    g.act(0).cast(TIERED).modes(2).pay();
    expect(tapped(g)).toBe(5);
    g.passAll();
    g.expect.derived('mine', { keywords: ['hexproof', 'indestructible'] });
    g.expect.derived('theirs', { keywords: [] });
    g.expect.life(0, 26);
  });

  test('the cost is a real cost: the tier that costs {3}{W} needs the white mana for both {W}s', () => {
    // Four Plains pay {W} and {3}, but not the second {W}... five lands of which only one makes white cannot pay {W}{3}{W}.
    const g = game(TIERED, ['Plains', 'Forest', 'Forest', 'Forest', 'Forest']);
    g.act(0).cast(TIERED);
    expect(chooseModesDecision(g).sets).toEqual([[0], [1]]);
  });
});

describe('only the tiers the caster can afford are offered (CR 118.3)', () => {
  test('with one land only the {0} tier', () => {
    const g = game(TIERED, ['Plains']);
    g.act(0).cast(TIERED);
    // With one legal choice the engine takes it itself and goes on to the target.
    g.expect.pending('targets', 0);
  });

  test('with two lands the {0} and the {1} tiers; with five, all three', () => {
    const two = game(TIERED, ['Plains', 'Plains']);
    two.act(0).cast(TIERED);
    expect(chooseModesDecision(two).sets).toEqual([[0], [1]]);
    const five = game(TIERED, ['Plains', 'Plains', 'Plains', 'Plains', 'Plains']);
    five.act(0).cast(TIERED);
    expect(chooseModesDecision(five).sets).toEqual([[0], [1], [2]]);
  });

  test('a tier that was not offered is refused when it is answered anyway', () => {
    const g = game(TIERED, ['Plains', 'Plains']);
    g.act(0).cast(TIERED);
    const r = g.act(0).try.action({ kind: 'chooseModes', modes: [2] });
    expect(r.ok).toBe(false);
  });

  test('the spell can be cast with just its mana cost on the battlefield: the {0} tier', () => {
    const g = game(TIERED, ['Plains']);
    g.expect.legal(0, { cast: TIERED });
  });

  test('with no mana at all it cannot be cast', () => {
    const g = game(TIERED, []);
    g.expect.illegal(0, { cast: TIERED });
  });
});

describe('several modes with a cost chosen: all the costs are paid (CR 700.2h)', () => {
  test('one mode: {R} and the cost of the mode', () => {
    const g = game(PAIR, ['Mountain', 'Mountain', 'Mountain', 'Mountain']);
    g.act(0).cast(PAIR).modes(0).pay();
    expect(tapped(g)).toBe(2);
    g.passAll();
    g.expect.life(0, 22);
  });

  test('both modes: {R}, {1} and {R}, four mana with two red', () => {
    const g = game(PAIR, ['Mountain', 'Mountain', 'Mountain', 'Mountain']);
    g.act(0).cast(PAIR).modes(0, 1).targets(['theirs']).pay();
    expect(tapped(g)).toBe(3);
    g.passAll();
    g.expect.life(0, 22);
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
  });

  test('with the mana for one mode and the mana cost only, the pair is not offered', () => {
    const g = game(PAIR, ['Mountain', 'Mountain']);
    g.act(0).cast(PAIR);
    expect(chooseModesDecision(g).sets).toEqual([[0], [1]]);
  });
});

describe('only some modes have a cost', () => {
  test('the free one costs only the mana cost; the costed one adds its own', () => {
    const free = game(HALF, ['Island', 'Island', 'Island', 'Island']);
    free.act(0).cast(HALF).modes(0).pay();
    expect(tapped(free)).toBe(1);
    free.passAll();
    free.expect.life(0, 22);
    const costed = game(HALF, ['Island', 'Island', 'Island', 'Island']);
    costed.act(0).cast(HALF).modes(1).pay();
    expect(tapped(costed)).toBe(4);
    costed.passAll();
    costed.expect.handSize(0, 2);
  });

  test('with only the mana cost the costed mode is not offered', () => {
    const g = game(HALF, ['Island']);
    g.act(0).cast(HALF);
    // One legal mode: the engine takes it itself, with no question.
    g.expect.stack([HALF]);
  });
});

describe('validation (CR 700.2h)', () => {
  const face = () => {
    const f = syntheticCard(TIERED).faces[0];
    if (f === undefined) throw new Error('no face');
    return f;
  };
  const withCost = (cost: unknown) => {
    const card = syntheticCard(TIERED);
    const f = face();
    const modes = (f.spell?.modes ?? []).map((m, i) => (i === 0 ? { ...m, cost } : m));
    return { ...card, faces: [{ ...f, spell: { ...f.spell, modes } }] } as never;
  };

  test('a mode cost other than mana is refused', () => {
    expect(validateCard(withCost([{ kind: 'tap' }])).length).toBeGreaterThan(0);
  });

  test('X in a mode cost is refused', () => {
    expect(validateCard(withCost([{ kind: 'mana', symbols: ['X'] }])).length).toBeGreaterThan(0);
  });

  test('an empty mode cost is refused', () => {
    expect(validateCard(withCost([])).length).toBeGreaterThan(0);
  });

  test('a mode cost with a repeatable choice is refused', () => {
    const card = syntheticCard(TIERED);
    const f = face();
    const bad = {
      ...card,
      faces: [{ ...f, spell: { ...f.spell, chooseModes: { min: 1, max: 3, repeatable: true } } }],
    } as never;
    expect(validateCard(bad).length).toBeGreaterThan(0);
  });

  test('the modes of a triggered ability have no cost', () => {
    const modes = face().spell?.modes ?? [];
    const bad = singleFace({
      name: 'SYNTHETIC Costed Ability Modes',
      manaCost: ['1', 'W'],
      types: ['enchantment'],
      colors: ['W'],
      colorIdentity: ['W'],
      oracleText: 'SYNTHETIC: a triggered ability with modes that have a cost.',
      abilities: [
        {
          kind: 'triggered',
          trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
          effect: { kind: 'sequence', effects: [] },
          modes,
          chooseModes: { min: 1, max: 1 },
        },
      ],
    });
    expect(validateCard(bad).length).toBeGreaterThan(0);
  });
});
