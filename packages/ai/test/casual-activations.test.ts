// CasualAgent and activated abilities (slice S3): the heuristics of src/casual-activations.ts, run
// against real engine states built with the scenario DSL (SYNTHETIC cards), through the same
// handlers the agent uses in a game. Pins: it cycles a surplus land and pumps only when the pump
// changes combat, never loops, never touches abilities it cannot judge.
import type { Action, PriorityDecision } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { pumpOf } from '../src/casual-activations';
import { CasualAgent } from '../src/index';
import { answerFor } from './casual-helpers';

const BEAR = 'SYNTHETIC Pump Bear';
const VANILLA_1 = 'SYNTHETIC Vanilla 1/1';
const VANILLA_3 = 'SYNTHETIC Vanilla 3/3';
const VANILLA_5 = 'SYNTHETIC Vanilla 5/5';

const activates = (a: Action, g: ScenarioGame, name: string): boolean =>
  a.kind === 'activate' && a.object === g.id(name);

/** Seat 0 attacks with the bear, seat 1 blocks with `blocker`; priority is at declare blockers. */
function blockedBear(blocker: string, mana = 1): ScenarioGame {
  const g = scenario()
    .seat(0)
    .battlefield(BEAR)
    .battlefield(...Array.from({ length: mana }, () => 'Forest'))
    .seat(1)
    .battlefield(blocker)
    .build();
  g.playCombat({
    attack: [BEAR],
    block: [{ blocker, attacker: BEAR }],
    until: 'declareBlockers',
  });
  return g;
}

describe('a pump that changes combat is activated', () => {
  test('a 2/2 blocked by a 3/3: +1/+1 lets it kill the blocker', async () => {
    const g = blockedBear(VANILLA_3);
    expect(await answerFor(g)).toEqual({
      kind: 'activate',
      object: g.id(BEAR),
      abilityIndex: 0,
    });
  });

  test('blocked by a 1/1 it already kills it and survives: no pump', async () => {
    expect(await answerFor(blockedBear(VANILLA_1))).toEqual({ kind: 'pass' });
  });

  test('blocked by a 5/5 neither +1/+1 kills it nor saves the bear: no pump', async () => {
    expect(await answerFor(blockedBear(VANILLA_5))).toEqual({ kind: 'pass' });
  });

  test('the same fight with no mana: the engine does not offer it and the agent passes', async () => {
    expect(await answerFor(blockedBear(VANILLA_3, 0))).toEqual({ kind: 'pass' });
  });

  test('as a blocker: a 2/2 blocking a 3/3 attacker pumps to kill it', async () => {
    const g = scenario()
      .seat(0)
      .battlefield(BEAR, 'Forest')
      .seat(1)
      .battlefield(VANILLA_3)
      .at('precombatMain', { active: 1 })
      .build();
    g.playCombat({
      attack: [VANILLA_3],
      block: [{ blocker: BEAR, attacker: VANILLA_3 }],
      until: 'declareBlockers',
    });
    g.act(1).pass(); // the attacker's controller passes; the blocker's controller gets priority
    expect(g.deciding).toBe(0);
    expect(activates(await answerFor(g), g, BEAR)).toBe(true);
  });

  test('an unblocked attacker pumps when the extra power makes the attack lethal', async () => {
    const lethal = scenario().seat(0).battlefield(BEAR, 'Forest').seat(1).life(3).build();
    lethal.playCombat({ attack: [BEAR], until: 'declareBlockers' });
    expect(activates(await answerFor(lethal), lethal, BEAR)).toBe(true);
    const plenty = scenario().seat(0).battlefield(BEAR, 'Forest').seat(1).life(9).build();
    plenty.playCombat({ attack: [BEAR], until: 'declareBlockers' });
    expect(await answerFor(plenty)).toEqual({ kind: 'pass' });
    const dead = scenario().seat(0).battlefield(BEAR, 'Forest').seat(1).life(2).build();
    dead.playCombat({ attack: [BEAR], until: 'declareBlockers' });
    expect(await answerFor(dead)).toEqual({ kind: 'pass' }); // lethal already: no need
  });

  test('never outside the declare blockers step', async () => {
    const g = scenario().seat(0).battlefield(BEAR, 'Forest').seat(1).life(3).build();
    expect(await answerFor(g)).toEqual({ kind: 'pass' }); // main phase
    g.advanceTo('declareAttackers', { attack: false });
  });
});

describe('the loop guard: at most once per object per priority window', () => {
  test('after the pump the agent passes in the same step and pumps again in a later window', async () => {
    const g = blockedBear(VANILLA_3, 3);
    const agent = new CasualAgent({ seed: 1 });
    const first = await answerFor(g, agent);
    expect(activates(first, g, BEAR)).toBe(true);
    g.choose(first);
    g.act(0).payAuto();
    g.passAll(); // the pump resolves; the bear is 3/3 now and still has mana left
    expect(g.state.turn.step).toBe('declareBlockers');
    // Pumped to 3/3 it would no longer need another pump anyway, and more mana is available, but
    // the guard is what makes the second answer a pass even if the fight still looked flippable.
    expect(await answerFor(g, agent)).toEqual({ kind: 'pass' });
  });

  test('the guard is per window: a fresh agent state in a new turn may pump again', async () => {
    const agent = new CasualAgent({ seed: 1 });
    const one = blockedBear(VANILLA_3);
    expect(activates(await answerFor(one, agent), one, BEAR)).toBe(true);
    // Same step, same object ids in another game: the key includes turn and step, so it is the
    // same window and the agent refuses to repeat it.
    const two = blockedBear(VANILLA_3);
    expect(await answerFor(two, agent)).toEqual({ kind: 'pass' });
    // A different turn is a different window.
    const later = scenario()
      .seat(0)
      .battlefield(BEAR)
      .battlefield('Forest')
      .seat(1)
      .battlefield(VANILLA_3)
      .at('precombatMain', { active: 0, turn: 5 })
      .build();
    later.playCombat({
      attack: [BEAR],
      block: [{ blocker: VANILLA_3, attacker: BEAR }],
      until: 'declareBlockers',
    });
    expect(activates(await answerFor(later, agent), later, BEAR)).toBe(true);
  });
});

describe('cycling a surplus land', () => {
  const hand = (lands: number, extra: string[] = []) =>
    scenario()
      .seat(0)
      .hand('SYNTHETIC Cycling Land')
      .hand(...Array.from({ length: lands - 1 }, () => 'Forest'))
      .hand(...extra)
      .battlefield('Forest', 'Forest')
      .landsPlayed(1)
      .library('Plains', 'Plains')
      .seat(1)
      .build();

  test('with four lands in hand the land with Cycling is cycled', async () => {
    const g = hand(4);
    const a = await answerFor(g);
    expect(a).toMatchObject({ kind: 'activate', object: g.id('SYNTHETIC Cycling Land') });
  });

  test('with three lands in hand it is kept', async () => {
    expect(await answerFor(hand(3))).toEqual({ kind: 'pass' });
  });

  test('a spell is cast before anything is cycled', async () => {
    const g = hand(4, ['Grizzly Bears']);
    expect(await answerFor(g)).toEqual({ kind: 'castSpell', object: g.id('Grizzly Bears') });
  });

  test('a creature with Cycling is not cycled by this rule, even with four lands', async () => {
    const g = scenario()
      .seat(0)
      .hand('SYNTHETIC Cycling Bear', 'Forest', 'Forest', 'Forest', 'Forest')
      .battlefield('Forest', 'Forest', 'Forest')
      .landsPlayed(1)
      .library('Plains')
      .seat(1)
      .build();
    // Four lands in hand, so a land would be cycled if one could be; the bear is not a land.
    const a = await answerFor(g);
    expect(a.kind === 'castSpell' || a.kind === 'pass').toBe(true);
    expect(a.kind).not.toBe('activate');
  });
});

describe('abilities the agent cannot judge are left alone', () => {
  test('a sacrifice outlet, a pinger and a life tap are never activated', async () => {
    const g = scenario()
      .seat(0)
      .battlefield(
        'SYNTHETIC Altar',
        'SYNTHETIC Pinger',
        'SYNTHETIC Life Tap',
        'SYNTHETIC Charge Battery',
        'Grizzly Bears',
        'Forest',
        'Forest',
      )
      .landsPlayed(1)
      .library('Plains')
      .seat(1)
      .battlefield('Grizzly Bears')
      .build();
    expect(g.legalActions(0).filter((a) => a.kind === 'activate').length).toBeGreaterThanOrEqual(3);
    expect(await answerFor(g)).toEqual({ kind: 'pass' });
  });
});

describe('pumpOf reads the ability, not the card name', () => {
  const pump = (over: object) =>
    ({
      kind: 'activated',
      cost: [{ kind: 'mana', symbols: ['1'] }],
      effect: {
        kind: 'modifyPt',
        objects: { kind: 'this' },
        power: 2,
        toughness: 1,
        duration: 'untilEndOfTurn',
      },
      ...over,
    }) as Parameters<typeof pumpOf>[0];

  test('a plain pump, with its size', () => {
    expect(pumpOf(pump({}))).toEqual({ power: 2, toughness: 1 });
    expect(pumpOf(pump({ cost: [{ kind: 'tap' }] }))).toEqual({ power: 2, toughness: 1 });
  });

  test('not a pump: a target, a sacrifice or a life cost, another effect, a lasting effect', () => {
    expect(pumpOf(pump({ targets: [{ id: 't1', what: { kind: 'anyTarget' } }] }))).toBeNull();
    expect(pumpOf(pump({ cost: [{ kind: 'sacrifice', what: { kind: 'this' } }] }))).toBeNull();
    expect(pumpOf(pump({ cost: [{ kind: 'payLife', amount: 1 }] }))).toBeNull();
    expect(
      pumpOf(pump({ effect: { kind: 'draw', player: { kind: 'you' }, count: 1 } })),
    ).toBeNull();
    expect(
      pumpOf(
        pump({
          effect: {
            kind: 'modifyPt',
            objects: { kind: 'this' },
            power: 1,
            toughness: 1,
            duration: 'permanent',
          },
        }),
      ),
    ).toBeNull();
  });
});

describe('the decision it answers', () => {
  test('is a priority decision with activate options listed by the engine', () => {
    const g = blockedBear(VANILLA_3);
    const d = g.state.pending as PriorityDecision;
    expect(d.options.some((o) => o.kind === 'activate')).toBe(true);
  });
});
