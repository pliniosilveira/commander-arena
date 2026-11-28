// "Enchant opponent" (Tenuous Truce): an Aura that enchants a player who must be an opponent of its controller, the end step of the enchanted player, and the attacks between its
// controller and the enchanted player.
// Pins: CR 702.5a and 303.4a (the enchant ability defines the Aura spell's target: an opponent), CR 102.2 and 102.3 (who an opponent is, with two seats and more), CR 303.4c and 704.5m
// (an Aura on a player who is no longer an opponent of its controller goes to the graveyard), CR 303.4m and 603.2b ("enchanted opponent's end step": the turn of the player it is
// attached to), CR 508.1, 508.1b, 508.6 and 603.2c (attackers are declared together: "when you attack a player" triggers once for the declaration; an attack on a planeswalker
// of that player counts; an attack on another opponent does not). The Aura is SYNTHETIC (defined in this file); the rest are real cards.
import { describe, expect, test } from 'vitest';
import { illegalAuras } from '../src/rules/attach';
import { singleFaceCard } from './dsl-helpers';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const TRUCE = 'SYNTHETIC Truce Aura';
const WALKER = 'SYNTHETIC Vanilla Planeswalker';
const BEARS = 'Grizzly Bears';
const MINE = { name: BEARS, zone: 'battlefield' as const, seat: 0 as const };
const LIBRARY = Array.from({ length: 12 }, () => 'Plains');

const ENCHANT_OPPONENT = {
  kind: 'keyword',
  keyword: { kind: 'enchant', filter: {}, player: true, opponent: true },
} as const;

// "Enchant opponent / At the beginning of enchanted opponent's end step, you and that player each draw a card. / When you attack enchanted opponent or a planeswalker they control
// or when they attack you or a planeswalker you control, sacrifice this Aura."
const truce = singleFaceCard({
  name: TRUCE,
  manaCost: ['1', 'W'],
  types: ['enchantment'],
  subtypes: ['Aura'],
  colors: ['W'],
  colorIdentity: ['W'],
  oracleText:
    "Enchant opponent\nAt the beginning of enchanted opponent's end step, you and that player each draw a card.\nWhen you attack enchanted opponent or a planeswalker they control or when they attack you or a planeswalker you control, sacrifice this Aura.",
  abilities: [
    ENCHANT_OPPONENT,
    {
      kind: 'triggered',
      trigger: { kind: 'step', step: 'endStep', whose: 'enchantedPlayer' },
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'draw', player: { kind: 'you' }, count: 1 },
          { kind: 'draw', player: { kind: 'triggerPlayer' }, count: 1 },
        ],
      },
    },
    {
      kind: 'triggered',
      trigger: {
        kind: 'attackBatch',
        who: 'you',
        atLeast: 1,
        attackedEnchantedPlayerOrPlaneswalkers: true,
      },
      effect: { kind: 'sacrifice', objects: { kind: 'this' } },
    },
    {
      kind: 'triggered',
      trigger: {
        kind: 'attackBatch',
        who: 'any',
        atLeast: 1,
        byEnchantedPlayer: true,
        attackedYouOrPlaneswalkers: true,
      },
      effect: { kind: 'sacrifice', objects: { kind: 'this' } },
    },
  ],
});

/** Three seats: seat 0 casts the Aura; seats 1 and 2 are its opponents. Each has a Bears; seat 1 has a planeswalker. */
const game = () =>
  scenario({ seats: 3 })
    .define(truce)
    .seat(0)
    .library(...LIBRARY)
    .hand(TRUCE)
    .battlefield('Plains', { count: 2 })
    .battlefield(BEARS)
    .seat(1)
    .library(...LIBRARY)
    .battlefield(BEARS)
    .battlefield(WALKER)
    .seat(2)
    .library(...LIBRARY)
    .battlefield(BEARS)
    .at('precombatMain', { active: 0 })
    .build();

/** The Aura cast on seat 1 and resolved, in seat 0's precombat main phase. */
const enchanting = (seat: 1 | 2 = 1) => {
  const g = game();
  g.act(0).cast(TRUCE, { targets: [{ player: seat }], pay: true });
  g.passAll();
  expect(g.state.objects[g.id(TRUCE)]?.attachedToPlayer).toBe(seat);
  return g;
};

const handSize = (g: ReturnType<typeof game>, seat: number) => g.state.seats[seat]?.hand.length;

describe('the card is valid', () => {
  test('the Aura of this file', () => {
    expect(validateCard(truce)).toEqual([]);
  });

  test('"opponent" goes only with "player"; the triggers about the enchanted player need an Aura that enchants a player', () => {
    const face = truce.faces[0];
    if (face === undefined) throw new Error('no face');
    const withAbilities = (abilities: unknown) =>
      ({ ...truce, faces: [{ ...face, abilities }] }) as typeof truce;
    const messages = (abilities: unknown) =>
      validateCard(withAbilities(abilities))
        .map((m) => m.message)
        .join(' | ');
    expect(
      messages([{ kind: 'keyword', keyword: { kind: 'enchant', filter: {}, opponent: true } }]),
    ).toMatch(/opponent/);
    const creatureAura = { kind: 'keyword', keyword: { kind: 'enchant', filter: { types: ['creature'] } } };
    expect(messages([creatureAura, ...face.abilities.slice(1)])).toMatch(/enchants a player/);
  });

  test('the real Curse fixtures stay valid', () => {
    expect(validateCard(syntheticCard('SYNTHETIC Curse of Tithes'))).toEqual([]);
  });
});

describe('"Enchant opponent": the Aura spell targets an opponent (CR 702.5a, 303.4a, 102.3)', () => {
  test('the legal targets are the two opponents, never the caster and never a permanent', () => {
    const g = game();
    g.act(0).cast(TRUCE);
    const d = g.state.pending;
    if (d?.kind !== 'targets') throw new Error('expected the targets decision');
    const legal = d.specs.flatMap((spec) => spec.legal);
    expect(legal.every((t) => t.kind === 'player')).toBe(true);
    expect(legal.map((t) => (t.kind === 'player' ? t.seat : -1)).sort()).toEqual([1, 2]);
  });

  test('it enters attached to the opponent chosen', () => {
    const g = enchanting(2);
    expect(g.state.objects[g.id(TRUCE)]?.attachedTo).toBeNull();
    g.expect.invariants();
  });

  test('the enchanted player stops being an opponent of its controller: the Aura is illegal (CR 303.4c, 704.5m)', () => {
    const g = enchanting(1);
    expect(illegalAuras(g.state)).toEqual([]);
    const id = g.id(TRUCE);
    const obj = g.state.objects[id];
    if (obj === undefined) throw new Error('no Aura');
    // The Aura now under seat 1's control: the player it enchants is its own controller, no opponent.
    const taken = { ...g.state, objects: { ...g.state.objects, [id]: { ...obj, controller: 1 } } };
    expect(illegalAuras(taken).map((o) => o.id)).toEqual([id]);
  });
});

describe("At the beginning of enchanted opponent's end step, you and that player each draw a card (CR 303.4m, 603.2b)", () => {
  test("in the enchanted player's end step the controller and that player draw one each; the other opponent does not", () => {
    const g = enchanting(1);
    g.advanceTo('end', { turn: g.state.turn.number + 1 });
    const before = [handSize(g, 0), handSize(g, 1), handSize(g, 2)];
    g.passAll();
    expect([handSize(g, 0), handSize(g, 1), handSize(g, 2)]).toEqual([
      (before[0] ?? 0) + 1,
      (before[1] ?? 0) + 1,
      before[2],
    ]);
  });

  test("in its controller's own end step and in the other opponent's, nothing triggers", () => {
    const g = enchanting(1);
    const first = g.state.turn.number;
    g.advanceTo('end');
    expect(g.state.stack).toHaveLength(0);
    g.advanceTo('end', { turn: first + 2 });
    expect(g.state.turn.activeSeat).toBe(2);
    expect(g.state.stack).toHaveLength(0);
  });
});

describe('the sacrifice when the controller and the enchanted player attack each other (CR 508.1, 508.1b, 508.6, 603.2c)', () => {
  test('attacking the enchanted opponent with a creature: the Aura is sacrificed', () => {
    const g = enchanting(1);
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).declareAttackers([{ attacker: MINE, target: { player: 1 } }]);
    expect(g.state.stack).toHaveLength(1);
    g.passAll();
    g.expect.zone(TRUCE, 'graveyard');
  });

  test('attacking a planeswalker of the enchanted opponent: sacrificed too', () => {
    const g = enchanting(1);
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).declareAttackers([{ attacker: MINE, target: WALKER }]);
    g.passAll();
    g.expect.zone(TRUCE, 'graveyard');
  });

  test('attacking the other opponent: nothing triggers, the Aura stays', () => {
    const g = enchanting(1);
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).declareAttackers([{ attacker: MINE, target: { player: 2 } }]);
    expect(g.state.stack).toHaveLength(0);
    g.passAll();
    g.expect.zone(TRUCE, 'battlefield');
  });

  test('the enchanted opponent attacks the controller: sacrificed', () => {
    const g = enchanting(1);
    g.advanceTo('declareAttackers', { turn: g.state.turn.number + 1 });
    g.act(1).declareAttackers([
      { attacker: { name: BEARS, zone: 'battlefield', seat: 1 }, target: { player: 0 } },
    ]);
    expect(g.state.stack).toHaveLength(1);
    g.passAll();
    g.expect.zone(TRUCE, 'graveyard');
  });

  test('the enchanted opponent attacks the other opponent: the Aura stays', () => {
    const g = enchanting(1);
    g.advanceTo('declareAttackers', { turn: g.state.turn.number + 1 });
    g.act(1).declareAttackers([
      { attacker: { name: BEARS, zone: 'battlefield', seat: 1 }, target: { player: 2 } },
    ]);
    expect(g.state.stack).toHaveLength(0);
    g.passAll();
    g.expect.zone(TRUCE, 'battlefield');
  });

  test('the other opponent attacks the controller: the Aura stays (only the enchanted player counts)', () => {
    const g = enchanting(1);
    g.advanceTo('declareAttackers', { turn: g.state.turn.number + 2 });
    g.act(2).declareAttackers([
      { attacker: { name: BEARS, zone: 'battlefield', seat: 2 }, target: { player: 0 } },
    ]);
    expect(g.state.stack).toHaveLength(0);
    g.passAll();
    g.expect.zone(TRUCE, 'battlefield');
  });
});
