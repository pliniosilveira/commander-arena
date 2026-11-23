// Ninjutsu {1}{R} (the Limit Break deck, group 6; `keyword` `ninjutsu`, expanded in `rules/derive-keywords.ts`): an activated ability that works only from the hand, "{1}{R}, Return an
// unblocked attacker you control to hand: Put this card onto the battlefield from your hand tapped and attacking." The creature enters attacking what the returned creature attacked.
// Pins: CR 702.49a (Ninjutsu; UNVERIFIED rule number: the CR text is not in the repository), CR 509.1h (unblocked), CR 508.4 (a creature put onto the battlefield attacking was never
// declared as an attacker), CR 602.2b (costs are paid as the ability is activated), CR 108.3 (the returned card goes to its owner's hand), CR 113.6b (the ability works from the hand).
// The Ninja is SYNTHETIC; the other cards are real fixtures or SYNTHETIC ones of the engine.
import { describe, expect, test } from 'vitest';
import { unsupportedFeatureIssues } from '../src/ast/supported';
import { singleFace } from '../src/cards/fixtures/helpers';
import { getLegalActions, validateCard } from '../src/index';
import { derive } from '../src/rules/derive';
import { type ScenarioGame, scenario } from '../src/testing/index';

const NINJA = 'SYNTHETIC Test Ninja';
const BEARS = 'Grizzly Bears';
const GOBLIN = 'Raging Goblin';
const WALL = 'SYNTHETIC Brick Wall';
const WALKER = 'SYNTHETIC Vanilla Planeswalker';
const FILLER = Array.from({ length: 20 }, () => 'Island');

const NINJA_CARD = singleFace({
  name: NINJA,
  manaCost: ['1', 'R'],
  types: ['creature'],
  subtypes: ['Human', 'Ninja'],
  colors: ['R'],
  colorIdentity: ['R'],
  power: 3,
  toughness: 3,
  oracleText: 'Ninjutsu {1}{R}',
  abilities: [
    {
      kind: 'keyword',
      keyword: { kind: 'ninjutsu', cost: [{ kind: 'mana', symbols: ['1', 'R'] }] },
    },
  ],
});

const activates = (g: ScenarioGame, seat: 0 | 1 | 2 = 0) =>
  getLegalActions(g.state, seat).filter((a) => a.kind === 'activate');

/** Seat 0 active with `attackers`, the Ninja in hand and two Mountains; seat 1 has `theirs`, seat 2 `third`. */
function game(
  seats: 2 | 3,
  attackers: readonly string[],
  theirs: readonly string[] = [],
  third: readonly string[] = [],
) {
  const b = scenario({ seats }).define(NINJA_CARD).seat(0);
  for (const a of attackers) b.battlefield(a);
  b.battlefield('Mountain', 'Mountain')
    .hand(NINJA)
    .library(...FILLER)
    .seat(1);
  for (const t of theirs) b.battlefield(t);
  b.library(...FILLER);
  if (seats === 3) {
    b.seat(2);
    for (const t of third) b.battlefield(t);
    b.library(...FILLER);
  }
  return b.at('precombatMain', { active: 0 }).build();
}

describe('the keyword', () => {
  test('the card is valid and its expansion is an activated ability of the hand with the return cost', () => {
    expect(validateCard(NINJA_CARD)).toEqual([]);
    const g = game(2, [BEARS]);
    const abilities = derive(g.state, g.object({ name: NINJA, seat: 0 })).abilities;
    expect(abilities).toContainEqual({
      kind: 'activated',
      cost: [
        { kind: 'mana', symbols: ['1', 'R'] },
        { kind: 'returnToHand', what: { types: ['creature'], unblocked: true } },
      ],
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'moveToZone', objects: { kind: 'this' }, to: 'battlefield', tapped: true },
          { kind: 'enterAttacking', objects: { kind: 'moved' }, asReturned: true },
        ],
      },
      functionsIn: 'hand',
    });
  });

  test('a card cannot write the engine-only asReturned flag', () => {
    const card = singleFace({
      name: 'SYNTHETIC Forged Ninjutsu',
      manaCost: ['R'],
      types: ['creature'],
      colors: ['R'],
      colorIdentity: ['R'],
      power: 1,
      toughness: 1,
      oracleText: 'test',
      abilities: [
        {
          kind: 'triggered',
          trigger: { kind: 'attacks', what: { kind: 'this' } },
          effect: { kind: 'enterAttacking', objects: { kind: 'moved' }, asReturned: true },
        },
      ],
    });
    expect(validateCard(card).map((i) => i.message)).toContain(
      'asReturned is written by the engine for Ninjutsu',
    );
  });
});

describe('the keyword is checked', () => {
  const withCost = (cost: readonly unknown[]) =>
    singleFace({
      name: 'SYNTHETIC Odd Ninjutsu',
      manaCost: ['R'],
      types: ['creature'],
      colors: ['R'],
      colorIdentity: ['R'],
      power: 1,
      toughness: 1,
      oracleText: 'test',
      // biome-ignore lint/suspicious/noExplicitAny: a deliberately malformed cost
      abilities: [{ kind: 'keyword', keyword: { kind: 'ninjutsu', cost: cost as any } }],
    });

  test('the return of the attacker is the engine’s own: a card does not list it', () => {
    const card = withCost([
      { kind: 'mana', symbols: ['R'] },
      { kind: 'returnToHand', what: { kind: 'this' } },
    ]);
    expect(validateCard(card).map((i) => i.message)).toContain(
      'ninjutsu already returns an unblocked attacker; do not list returnToHand',
    );
  });

  test('only mana is run: a cost of life is not supported', () => {
    expect(unsupportedFeatureIssues(withCost([{ kind: 'payLife', amount: 2 }])).length).toBe(1);
    expect(unsupportedFeatureIssues(withCost([{ kind: 'mana', symbols: ['1', 'R'] }]))).toEqual([]);
  });
});

describe('when it can be activated (CR 509.1h)', () => {
  test('not in the main phase, not before blockers are declared, not with no attacker', () => {
    const g = game(2, [BEARS]);
    expect(activates(g)).toHaveLength(0);
    g.advanceTo('declareAttackers');
    g.act(0).attack(BEARS);
    expect(g.state.turn.step).toBe('declareAttackers');
    expect(activates(g)).toHaveLength(0);
  });

  test('offered once the blockers are declared and an attacker is unblocked', () => {
    const g = game(2, [BEARS]);
    g.advanceTo('declareAttackers');
    g.act(0).attack(BEARS);
    g.advanceTo('declareBlockers');
    expect(activates(g)).toEqual([{ kind: 'activate', object: g.id(NINJA), abilityIndex: 1 }]);
  });

  test('not offered when the only attacker was blocked', () => {
    const g = game(2, [BEARS], [WALL]);
    g.advanceTo('declareAttackers');
    g.act(0).attack(BEARS);
    g.advanceTo('declareBlockers', { block: false });
    g.act(1).declareBlockers([{ blocker: WALL, attacker: BEARS }]);
    expect(activates(g)).toHaveLength(0);
  });

  test('not offered without the mana', () => {
    const g = scenario()
      .define(NINJA_CARD)
      .seat(0)
      .battlefield(BEARS, 'Mountain')
      .hand(NINJA)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack(BEARS);
    g.advanceTo('declareBlockers');
    expect(activates(g)).toHaveLength(0);
  });
});

describe('the activation (CR 602.2b, 108.3, 508.4)', () => {
  test('the unblocked attacker goes to the hand and the Ninja enters tapped and attacking the same player', () => {
    const g = game(2, [BEARS]);
    g.advanceTo('declareAttackers');
    g.act(0).attack(BEARS);
    g.advanceTo('declareBlockers');
    g.act(0).activate(NINJA, { pay: true });
    // Only one unblocked attacker: nothing to choose, the cost returned it.
    g.expect.zone(BEARS, 'hand', { seat: 0 });
    g.expect.zone(NINJA, 'hand', { seat: 0 });
    g.passAll();
    g.expect.zone(NINJA, 'battlefield', { seat: 0 });
    g.expect.tapped(NINJA, true);
    g.expect.combat({
      targets: [{ attacker: NINJA, target: { player: 1 } }],
    });
    g.expect.invariants();
  });

  test('the Ninja deals its combat damage to the player', () => {
    const g = game(2, [BEARS]);
    g.advanceTo('declareAttackers');
    g.act(0).attack(BEARS);
    g.advanceTo('declareBlockers');
    g.act(0).activate(NINJA, { pay: true });
    g.passAll();
    g.advanceTo('endOfCombat');
    g.expect.life(1, 37);
  });
});

describe('the attack target is the returned creature’s, with three seats (CR 508.4)', () => {
  const build = () => game(3, [BEARS, GOBLIN]);

  test('returning the creature that attacked the third seat: the Ninja attacks seat 2, not seat 1', () => {
    const g = build();
    g.advanceTo('declareAttackers');
    g.act(0).declareAttackers([
      { attacker: GOBLIN, target: { player: 1 } },
      { attacker: BEARS, target: { player: 2 } },
    ]);
    g.advanceTo('declareBlockers');
    g.act(0).activate(NINJA, { pay: true });
    // Two unblocked attackers: the player chooses which one to return.
    g.expect.pending('choosePermanent', 0);
    g.act(0).choosePermanents(BEARS);
    g.passAll();
    g.expect.zone(BEARS, 'hand', { seat: 0 });
    g.expect.combat({
      targets: [
        { attacker: GOBLIN, target: { player: 1 } },
        { attacker: NINJA, target: { player: 2 } },
      ],
    });
    g.advanceTo('endOfCombat');
    g.expect.life(2, 37);
    g.expect.life(1, 39);
  });

  test('returning the creature that attacked seat 1: the Ninja attacks seat 1', () => {
    const g = build();
    g.advanceTo('declareAttackers');
    g.act(0).declareAttackers([
      { attacker: GOBLIN, target: { player: 1 } },
      { attacker: BEARS, target: { player: 2 } },
    ]);
    g.advanceTo('declareBlockers');
    g.act(0).activate(NINJA, { pay: true });
    g.act(0).choosePermanents(GOBLIN);
    g.passAll();
    g.expect.combat({
      targets: [
        { attacker: BEARS, target: { player: 2 } },
        { attacker: NINJA, target: { player: 1 } },
      ],
    });
  });

  test('a blocked attacker is not a choice: only the unblocked one may be returned', () => {
    const g = game(3, [BEARS, GOBLIN], [], [WALL]);
    g.advanceTo('declareAttackers');
    g.act(0).declareAttackers([
      { attacker: GOBLIN, target: { player: 1 } },
      { attacker: BEARS, target: { player: 2 } },
    ]);
    g.advanceTo('declareBlockers', { block: false });
    g.act(2).declareBlockers([{ blocker: WALL, attacker: BEARS }]);
    g.act(0).activate(NINJA, { pay: true });
    // The Goblin is the only unblocked attacker: it is returned without a question, and the Ninja takes its target.
    g.expect.zone(GOBLIN, 'hand', { seat: 0 });
    g.passAll();
    g.expect.combat({
      targets: [
        { attacker: BEARS, target: { player: 2 } },
        { attacker: NINJA, target: { player: 1 } },
      ],
    });
  });

  test('returning a creature that attacked a planeswalker of another seat: the Ninja attacks that planeswalker', () => {
    const g = game(3, [BEARS, GOBLIN], [], [WALKER]);
    g.advanceTo('declareAttackers');
    g.act(0).declareAttackers([
      { attacker: GOBLIN, target: { player: 1 } },
      { attacker: BEARS, target: WALKER },
    ]);
    g.advanceTo('declareBlockers');
    g.act(0).activate(NINJA, { pay: true });
    g.act(0).choosePermanents(BEARS);
    g.passAll();
    g.expect.combat({
      targets: [
        { attacker: GOBLIN, target: { player: 1 } },
        { attacker: NINJA, target: WALKER },
      ],
    });
    expect(g.state.combat?.attackers.find((a) => a.object === g.id(NINJA))?.defender).toBe(2);
  });
});
