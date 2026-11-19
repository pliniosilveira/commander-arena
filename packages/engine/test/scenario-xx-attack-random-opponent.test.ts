// Territorial Hellkite: "At the beginning of combat on your turn, choose an opponent at random that this creature didn't attack during your last combat. This creature attacks that player this
// combat if able. If you can't choose an opponent this way, tap this creature." (the SYNTHETIC creature of this file has the same ability as an `attackRandomOpponent` node).
// Pins: CR 508.1d (a requirement to attack is obeyed if able), CR 508.6 (attacking a player), CR 506.1 (a combat phase), CR 611.2 / 514.2 (the requirement lasts for this combat only),
// CR 701.26a (tap).
// The scenario DSL has two seats, so there is one opponent at most; the choice among several is the generator's (`pickRandom`, tested apart).
import { describe, expect, test } from 'vitest';
import { validateCard } from '../src/index';
import { createRng } from '../src/rng/index';
import { pickRandom } from '../src/rules/attack-random-opponent';
import { scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';

const HELLKITE = 'SYNTHETIC Territorial Dragon';
const LIBRARY = Array.from({ length: 12 }, () => 'Plains');

const hellkite = singleFaceCard({
  name: HELLKITE,
  manaCost: ['3', 'R', 'R'],
  types: ['creature'],
  subtypes: ['Dragon'],
  colors: ['R'],
  colorIdentity: ['R'],
  power: 6,
  toughness: 6,
  oracleText: 'Flying, haste',
  abilities: [
    { kind: 'keyword', keyword: { kind: 'flying' } },
    { kind: 'keyword', keyword: { kind: 'haste' } },
    {
      kind: 'triggered',
      trigger: { kind: 'step', step: 'beginCombat', whose: 'you' },
      effect: { kind: 'attackRandomOpponent', creature: { kind: 'this' } },
    },
  ],
});

const build = () =>
  scenario()
    .seat(0)
    .define(hellkite)
    .library(...LIBRARY)
    .battlefield(HELLKITE)
    .seat(1)
    .library(...LIBRARY)
    .at('precombatMain', { active: 0 })
    .build();

type G = ReturnType<typeof build>;

/** Passes priority until the declare attackers decision (the beginning of combat trigger resolves on the way). */
const toDeclare = (g: G) => {
  g.advanceTo('declareAttackers', { attack: false });
  return g.state.pending;
};

describe('the card is valid', () => {
  test('the node validates', () => {
    expect(validateCard(hellkite)).toEqual([]);
  });
});

describe('the first combat: the opponent was not attacked in the last combat', () => {
  test('the creature is required to attack the chosen opponent: an empty declaration is refused', () => {
    const g = build();
    const d = toDeclare(g);
    expect(d?.kind).toBe('declareAttackers');
    expect(() => g.act(0).declareAttackers([])).toThrow();
  });

  test('attacking that player is legal and the creature stays untapped until it attacks', () => {
    const g = build();
    toDeclare(g);
    expect(g.object(g.id(HELLKITE)).tapped).toBe(false);
    g.act(0).declareAttackers([{ attacker: HELLKITE, target: { player: 1 } }]);
    g.expect.combat({ attackers: [HELLKITE] });
  });

  test('the requirement ends with the combat (CR 611.2)', () => {
    const g = build();
    toDeclare(g);
    g.act(0).declareAttackers([{ attacker: HELLKITE, target: { player: 1 } }]);
    expect(
      g.state.continuousEffects.filter((e) => e.change.kind === 'mustAttackPlayer'),
    ).toHaveLength(1);
    g.advanceTo('postcombatMain');
    expect(g.state.continuousEffects.filter((e) => e.change.kind === 'mustAttackPlayer')).toEqual(
      [],
    );
  });
});

describe('the next combat of its controller: the only opponent was attacked, so none can be chosen', () => {
  test('the creature is tapped and attacks nobody', () => {
    const g = build();
    toDeclare(g);
    g.act(0).declareAttackers([{ attacker: HELLKITE, target: { player: 1 } }]);
    g.advanceTo('upkeep', { turn: 'next' });
    g.advanceTo('upkeep', { turn: 'next' });
    g.advanceTo('precombatMain');
    g.advanceTo('beginningOfCombat');
    g.passAll();
    expect(g.object(g.id(HELLKITE)).tapped).toBe(true);
    expect(g.state.continuousEffects.filter((e) => e.change.kind === 'mustAttackPlayer')).toEqual(
      [],
    );
  });
});

describe('a combat in which it did not attack counts as a combat it did not attack in (CR 506.1)', () => {
  test('after a combat with no attack, an opponent can be chosen again', () => {
    const g = build();
    // The first combat it attacks; in the second it is tapped (no opponent can be chosen) and attacks nobody.
    toDeclare(g);
    g.act(0).declareAttackers([{ attacker: HELLKITE, target: { player: 1 } }]);
    g.advanceTo('upkeep', { turn: 'next' });
    g.advanceTo('upkeep', { turn: 'next' });
    g.advanceTo('precombatMain');
    g.advanceTo('beginningOfCombat');
    g.passAll();
    // It did not attack in that combat, so in the one after it the opponent can be chosen again.
    g.advanceTo('upkeep', { turn: 'next' });
    g.advanceTo('upkeep', { turn: 'next' });
    g.advanceTo('precombatMain');
    g.advanceTo('beginningOfCombat');
    g.passAll();
    expect(
      g.state.continuousEffects.filter((e) => e.change.kind === 'mustAttackPlayer'),
    ).toHaveLength(1);
  });
});

describe('"Choose an opponent at random. This creature attacks that player this combat if able." (no exclusion of the last combat, nothing to tap)', () => {
  const ANY = 'SYNTHETIC Reckless Bear';
  const any = singleFaceCard({
    name: ANY,
    manaCost: ['2', 'G'],
    types: ['creature'],
    subtypes: ['Bear'],
    colors: ['G'],
    colorIdentity: ['G'],
    power: 3,
    toughness: 3,
    oracleText: '',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'step', step: 'beginCombat', whose: 'you' },
        effect: { kind: 'attackRandomOpponent', creature: { kind: 'this' }, anyOpponent: true },
      },
    ],
  });
  const game = () =>
    scenario()
      .seat(0)
      .define(any)
      .library(...LIBRARY)
      .battlefield(ANY)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();

  test('the node validates', () => {
    expect(validateCard(any)).toEqual([]);
  });

  test('it is required to attack, and again in the next combat of its controller even though that opponent was attacked before (CR 508.1d)', () => {
    const g = game();
    g.advanceTo('declareAttackers', { attack: false });
    expect(() => g.act(0).declareAttackers([])).toThrow();
    g.act(0).declareAttackers([{ attacker: ANY, target: { player: 1 } }]);
    g.advanceTo('upkeep', { turn: 'next' });
    g.advanceTo('upkeep', { turn: 'next' });
    g.advanceTo('precombatMain');
    g.advanceTo('beginningOfCombat');
    g.passAll();
    expect(g.object(g.id(ANY)).tapped).toBe(false);
    expect(
      g.state.continuousEffects.filter((e) => e.change.kind === 'mustAttackPlayer'),
    ).toHaveLength(1);
  });
});

describe('the random choice comes from the seeded generator', () => {
  test('one candidate is that one; several are picked by the generator, the same for the same seed', () => {
    expect(pickRandom([1], createRng(7))[0]).toBe(1);
    const a = pickRandom([1, 2, 3], createRng(11));
    const b = pickRandom([1, 2, 3], createRng(11));
    expect(a[0]).toBe(b[0]);
    const seen = new Set<number>();
    let rng = createRng(3);
    for (let i = 0; i < 40; i += 1) {
      const [x, next] = pickRandom([1, 2, 3], rng);
      seen.add(x);
      rng = next;
    }
    expect([...seen].sort()).toEqual([1, 2, 3]);
  });
});
