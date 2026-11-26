// Riders of Rohan deck, group E (Fealty to the Realm): "The monarch controls enchanted creature." is a static ability of an Aura, a layer 2 control effect (CR 613.1b) whose
// controller is the monarch (CR 725.1) as it is read, and "Enchanted creature attacks each combat if able and can't attack you." (CR 508.1d, 508.1a).
// Pins: CR 613.1b and 613.7 (layer 2, timestamps: the Aura's, which a new monarch does not change), CR 613.7e (an Aura gets a new timestamp as it is attached), CR 611.3a (a static
// ability applies only while its source does), CR 613.1f (an Aura that lost all abilities gives nothing), CR 506.4 (a permanent whose controller changes leaves combat), CR 302.6
// (a creature that came under a player's control this turn cannot attack), CR 508.1a, 508.1d, CR 725.1 and 725.3 (one monarch at most; none until an effect makes one).
// Cards: SYNTHETIC cards of this file, Grizzly Bears, Serra Angel and the basic lands. Three seats: seat 0 owns the Aura, seat 1 owns the creature, seat 2 is the other opponent.
import { describe, expect, test } from 'vitest';
import { validateCard } from '../src/index';
import { attackCandidates, requiredAttackers } from '../src/rules/combat-legality';
import { controlledSince, controllerOf } from '../src/rules/control';
import type { GameState } from '../src/state/types';
import { type ScenarioGame, scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';

const BEARS = 'Grizzly Bears';
const ANGEL = 'Serra Angel';
const FEALTY = 'SYNTHETIC Fealty Aura'; // Enchant creature. The monarch controls enchanted creature. Enchanted creature attacks each combat if able and can't attack you.
const GRAB = 'SYNTHETIC Crown Grab'; // Instant. You become the monarch.
const PURGE = 'SYNTHETIC Purge'; // Instant. Destroy target enchantment.
const SNATCH = 'SYNTHETIC Snatch Creature'; // Instant. Gain control of target creature until end of turn, untap it, haste (a real synthetic of the engine).
const LIBRARY = Array.from({ length: 12 }, () => 'Plains');

const fealty = singleFaceCard({
  name: FEALTY,
  manaCost: ['4', 'U'],
  types: ['enchantment'],
  subtypes: ['Aura'],
  colors: ['U'],
  colorIdentity: ['U'],
  oracleText:
    "Enchant creature\nThe monarch controls enchanted creature.\nEnchanted creature attacks each combat if able and can't attack you.",
  abilities: [
    { kind: 'keyword', keyword: { kind: 'enchant', filter: { types: ['creature'] } } },
    { kind: 'static', static: { kind: 'controlAttached', by: 'monarch' } },
    {
      kind: 'static',
      static: {
        kind: 'restriction',
        subject: { kind: 'attached', types: ['creature'] },
        restriction: 'attacksEachCombat',
      },
    },
    {
      kind: 'static',
      static: { kind: 'cantAttackYou', creatures: { hostOfSource: true } },
    },
  ],
});

const grab = singleFaceCard({
  name: GRAB,
  manaCost: ['U'],
  types: ['instant'],
  colors: ['U'],
  colorIdentity: ['U'],
  oracleText: 'You become the monarch.',
  spell: { effect: { kind: 'becomeMonarch', player: { kind: 'you' } } },
});

const purge = singleFaceCard({
  name: PURGE,
  manaCost: ['W'],
  types: ['instant'],
  colors: ['W'],
  colorIdentity: ['W'],
  oracleText: 'Destroy target enchantment.',
  spell: {
    targets: [
      {
        id: 't1',
        what: { kind: 'object', filter: { zone: 'battlefield', types: ['enchantment'] } },
      },
    ],
    effect: { kind: 'destroy', objects: { kind: 'target', id: 't1' } },
  },
});

/** Seat 0's precombat main phase with the Aura on seat 1's Bears; seat 2 has Serra Angel; `monarch` is the monarch at the start. */
function board(monarch?: 0 | 1 | 2, hand: readonly string[] = []): ScenarioGame {
  return scenario({ seats: 3 })
    .define(fealty)
    .define(grab)
    .define(purge)
    .seat(0)
    .hand(...hand)
    .battlefield('Island', 'Island', 'Island', 'Plains')
    .battlefield(FEALTY, { attachedTo: BEARS })
    .library(...LIBRARY)
    .seat(1)
    .battlefield(BEARS)
    .library(...LIBRARY)
    .seat(2)
    .battlefield(ANGEL)
    .library(...LIBRARY)
    .at('precombatMain', monarch === undefined ? {} : { monarch })
    .build();
}

const who = (g: ScenarioGame, name: string) => {
  const [found] = g.find({ name, zone: 'battlefield' });
  if (found === undefined) throw new Error(`${name} is not on the battlefield`);
  return controllerOf(g.state, found);
};

describe('the card is valid', () => {
  test('the Aura', () => {
    expect(validateCard(fealty)).toEqual([]);
  });
});

describe('"The monarch controls enchanted creature." (CR 613.1b, 725.1)', () => {
  test('the monarch controls it, whoever that is: any opponent of the Aura controller, or the controller', () => {
    for (const monarch of [0, 1, 2] as const) {
      expect(who(board(monarch), BEARS)).toBe(monarch);
    }
  });

  test('the owner and the stored controller do not change (CR 108.3, 110.2)', () => {
    const g = board(2);
    expect(g.object(g.id(BEARS)).owner).toBe(1);
    expect(g.object(g.id(BEARS)).controller).toBe(1);
  });

  test('with no monarch it changes nothing: the creature stays with its controller', () => {
    const g = board();
    expect(g.state.monarch).toBeNull();
    expect(who(g, BEARS)).toBe(1);
  });

  test("a creature the Aura is not attached to is not affected, and neither is the Aura (it stays its controller's)", () => {
    const g = board(2);
    expect(who(g, ANGEL)).toBe(2);
    expect(who(g, FEALTY)).toBe(0);
  });

  test('the view shows the creature on the monarch side for every seat', () => {
    const g = board(2);
    for (const seat of [0, 1, 2] as const) {
      expect(g.view(seat).battlefield.find((o) => o.name === BEARS)?.controller).toBe(2);
    }
  });

  test('control follows the monarch as the designation changes hands (CR 725.3)', () => {
    const g = board(2, [GRAB]);
    expect(who(g, BEARS)).toBe(2);
    const mark = g.mark();
    g.act(0).cast(GRAB, { pay: true });
    g.passAll();
    g.expect.monarch(0);
    expect(who(g, BEARS)).toBe(0);
    expect(g.eventsSince(mark)).toContainEqual(
      expect.objectContaining({ kind: 'controlChanged', from: 2, to: 0 }),
    );
    g.expect.invariants();
  });

  test('a creature that changes controller this way has not been under the new controller since their turn began (CR 302.6)', () => {
    const g = board(2, [GRAB]);
    const bears = g.object(g.id(BEARS));
    const before = controlledSince(g.state, bears);
    g.act(0).cast(GRAB, { pay: true });
    g.passAll();
    const after = g.object(g.id(BEARS));
    expect(controlledSince(g.state, after)).toBeGreaterThan(before);
    expect(controlledSince(g.state, after)).toBeGreaterThan(
      g.state.seats[0]?.turnStartTimestamp ?? Number.POSITIVE_INFINITY,
    );
  });

  test('it ends when the Aura leaves the battlefield: the creature goes back to its controller (CR 611.3a)', () => {
    const g = board(2, [PURGE]);
    expect(who(g, BEARS)).toBe(2);
    const mark = g.mark();
    g.act(0).cast(PURGE, { targets: [FEALTY], pay: true });
    g.passAll();
    g.expect.zone(FEALTY, 'graveyard', { seat: 0 });
    expect(who(g, BEARS)).toBe(1);
    expect(g.eventsSince(mark)).toContainEqual(
      expect.objectContaining({ kind: 'controlChanged', from: 2, to: 1 }),
    );
  });

  test('it moves with the Aura when it is attached to another creature, and the first creature goes back', () => {
    const g = board(2);
    const aura = g.id(FEALTY);
    const angel = g.id(ANGEL);
    const bears = g.id(BEARS);
    // The Aura is moved to the Angel (stored controller seat 2) and the monarch is seat 0: the Angel is seat 0's, the Bears are seat 1's again.
    const moved: GameState = {
      ...g.state,
      monarch: 0,
      objects: {
        ...g.state.objects,
        [aura]: { ...g.object(aura), attachedTo: angel },
      },
    };
    const angelObject = moved.objects[angel];
    const bearsObject = moved.objects[bears];
    if (angelObject === undefined || bearsObject === undefined) throw new Error('missing');
    expect(controllerOf(moved, angelObject)).toBe(0);
    expect(controllerOf(moved, bearsObject)).toBe(1);
  });

  test('an Aura that lost all its abilities gives nothing (CR 613.1f)', () => {
    const g = board(2);
    const state = {
      ...g.state,
      continuousEffects: [
        ...g.state.continuousEffects,
        {
          id: 'ce-test',
          timestamp: 999,
          objects: [g.id(FEALTY)],
          until: 'permanent' as const,
          change: { kind: 'loseAllAbilities' as const },
        },
      ],
    };
    const bears = state.objects[g.id(BEARS)];
    if (bears === undefined) throw new Error('no Bears');
    expect(controllerOf(state, bears)).toBe(1);
  });
});

describe('layer 2 ordering (CR 613.1b, 613.7)', () => {
  test("a control effect made after the Aura came attached wins, and a new monarch does not change that order (the Aura's timestamp stays)", () => {
    const g = board(2);
    const bears = g.id(BEARS);
    const aura = g.object(g.id(FEALTY));
    const effect = (timestamp: number, seat: 0 | 1 | 2) => ({
      id: `ce-${timestamp}`,
      timestamp,
      objects: [bears],
      until: 'endOfTurn' as const,
      change: { kind: 'control' as const, seat },
    });
    const later = {
      ...g.state,
      continuousEffects: [effect(aura.timestamp + 10, 1)],
    };
    const earlier = {
      ...g.state,
      continuousEffects: [effect(aura.timestamp - 1, 1)],
    };
    const bearsObject = g.object(bears);
    // The monarch is seat 2: the later effect (seat 1) wins over it; the earlier one is overridden by the Aura.
    expect(controllerOf(later, bearsObject)).toBe(1);
    expect(controllerOf(earlier, bearsObject)).toBe(2);
    // Another player becomes the monarch: the order is the same (the ruling of 2023-06-16).
    expect(controllerOf({ ...later, monarch: 0 }, bearsObject)).toBe(1);
    expect(controllerOf({ ...earlier, monarch: 0 }, bearsObject)).toBe(0);
  });

  test('a spell resolved after the Aura entered takes the creature from the monarch, and the creature goes to the monarch when the effect ends', () => {
    const g = scenario({ seats: 3 })
      .define(fealty)
      .seat(0)
      .hand(SNATCH)
      .battlefield('Mountain', 'Mountain', 'Mountain')
      .battlefield(FEALTY, { attachedTo: BEARS })
      .library(...LIBRARY)
      .seat(1)
      .battlefield(BEARS)
      .library(...LIBRARY)
      .seat(2)
      .library(...LIBRARY)
      .at('precombatMain', { monarch: 2 })
      .build();
    expect(who(g, BEARS)).toBe(2);
    g.act(0).cast(SNATCH, { targets: [BEARS], pay: true });
    g.passAll();
    expect(who(g, BEARS)).toBe(0);
    // The monarch changes: the effect of the spell is still later than the Aura's.
    const changed = { ...g.state, monarch: 1 as const };
    const bearsObject = changed.objects[g.id(BEARS)];
    if (bearsObject === undefined) throw new Error('no Bears');
    expect(controllerOf(changed, bearsObject)).toBe(0);
    // It ends with the turn; the creature goes to the monarch.
    g.advanceTo('precombatMain', { turn: 'next' });
    expect(who(g, BEARS)).toBe(2);
  });
});

describe('"Enchanted creature attacks each combat if able and can\'t attack you." (CR 508.1d, 508.1a)', () => {
  /** Seat 2's turn with seat 2 the monarch: the creature is theirs. */
  const attackBoard = () => {
    const g = board(2);
    return { ...g.state, turn: { ...g.state.turn, activeSeat: 2 as const }, id: g.id(BEARS) };
  };

  test('it can attack the other opponent but not the controller of the Aura (CR 508.1a)', () => {
    const { id, ...state } = attackBoard();
    const targets = attackCandidates(state as never, 2).find((c) => c.attacker === id)?.targets;
    expect(targets).toEqual([{ kind: 'player', seat: 1 }]);
  });

  test('it attacks each combat if able (CR 508.1d)', () => {
    const { id, ...state } = attackBoard();
    expect(requiredAttackers(state as never, attackCandidates(state as never, 2))).toContain(id);
  });

  test('it bars only the Aura controller: with another monarch the creature may attack seat 2', () => {
    const g = board(1);
    const state = { ...g.state, turn: { ...g.state.turn, activeSeat: 1 as const } };
    const targets = attackCandidates(state, 1).find((c) => c.attacker === g.id(BEARS))?.targets;
    expect(targets).toEqual([{ kind: 'player', seat: 2 }]);
  });

  test('with no monarch the creature stays with its controller, still barred from the Aura controller and still required', () => {
    const g = board();
    const state = { ...g.state, turn: { ...g.state.turn, activeSeat: 1 as const } };
    const candidates = attackCandidates(state, 1);
    expect(candidates.find((c) => c.attacker === g.id(BEARS))?.targets).toEqual([
      { kind: 'player', seat: 2 },
    ]);
    expect(requiredAttackers(state, candidates)).toContain(g.id(BEARS));
  });

  test('the Aura controller itself, as the monarch, cannot attack itself and is not asked to attack with it', () => {
    const g = board(0);
    const state = { ...g.state, turn: { ...g.state.turn, activeSeat: 0 as const } };
    const candidates = attackCandidates(state, 0);
    const targets = candidates.find((c) => c.attacker === g.id(BEARS))?.targets ?? [];
    expect(targets.some((t) => t.kind === 'player' && t.seat === 0)).toBe(false);
  });
});
