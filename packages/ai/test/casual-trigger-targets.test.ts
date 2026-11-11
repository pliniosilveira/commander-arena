// CasualAgent and the targets of triggered abilities (src/casual-triggers.ts, CR 603.3d): what the
// ability does decides the side. A harmful one (destroy, damage) goes on the opponent's best
// creature, damage on a creature only if it kills it and otherwise on the player; a helpful one
// (a +1/+1 counter) on the agent's own best creature; a bounce of "a creature you control" on its
// weakest; "up to one" is left empty when only the agent's own object is legal. The cards are the
// SYNTHETIC ones of src/cards/fixtures/synthetic-trigger-targets.ts in states built with the
// scenario DSL, answered through the same decision handling the agent uses in a game.
import type { Action } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { answer } from './casual-helpers';

const REAPER = 'SYNTHETIC Reaper Imp';
const PINGER = 'SYNTHETIC Pinger Imp';
const MENTOR = 'SYNTHETIC Mentor Imp';
const BOUNCE = 'SYNTHETIC Bounce Imp';
const TINKER = 'SYNTHETIC Tinker Imp';
const SMALL = 'SYNTHETIC Vanilla 2/2';
const MID = 'SYNTHETIC Vanilla 3/3';
const BIG = 'SYNTHETIC Vanilla 5/5';
const ONE = 'SYNTHETIC Vanilla 1/1';
const SWAMPS = ['Swamp', 'Swamp', 'Swamp'] as const;

/** Names of the chosen targets: a creature's name, or `player N`. */
function names(g: ScenarioGame, action: Action): string[] {
  if (action.kind !== 'chooseTargets')
    throw new Error(`expected chooseTargets, got ${action.kind}`);
  return action.targets.map((t) => {
    if (t.kind === 'player') return `player ${t.seat}`;
    const o = g.view(0).battlefield.find((b) => b.id === t.id);
    if (o === undefined) throw new Error('target not on the battlefield');
    return `${o.name}@${o.controller}`;
  });
}

function entering(imp: string, mine: string[], theirs: string[]): ScenarioGame {
  const b = scenario()
    .seat(0)
    .hand(imp)
    .battlefield(...SWAMPS);
  for (const name of mine) b.battlefield(name);
  b.seat(1);
  for (const name of theirs) b.battlefield(name);
  const g = b.build();
  g.act(0).cast(imp, { pay: true });
  g.pass();
  g.pass();
  return g;
}

describe('a harmful trigger (destroy target creature an opponent controls)', () => {
  test('goes on the opponent best creature', async () => {
    const g = entering(REAPER, [BIG], [SMALL, BIG, MID]);
    g.expect.pending('targets', 0);
    const picked = names(g, await answer(g));
    expect(picked).toEqual([`${BIG}@1`]);
  });
});

describe('damage from a trigger (any target)', () => {
  const attack = (mine: string[], theirs: string[]) => {
    const b = scenario().seat(0).battlefield(PINGER);
    for (const name of mine) b.battlefield(name);
    b.seat(1);
    for (const name of theirs) b.battlefield(name);
    const g = b.build();
    g.advanceTo('declareAttackers');
    g.act(0).attack(PINGER);
    return g;
  };

  test('kills a creature it can kill', async () => {
    const g = attack([], [ONE, BIG]);
    g.expect.pending('targets', 0);
    expect(names(g, await answer(g))).toEqual([`${ONE}@1`]);
  });

  test('goes to the opponent when no creature would die', async () => {
    const g = attack([], [BIG, MID]);
    g.expect.pending('targets', 0);
    expect(names(g, await answer(g))).toEqual(['player 1']);
  });
});

describe('a helpful trigger (a +1/+1 counter on target creature you control)', () => {
  test('goes on the agent own best creature, never on the opponent', async () => {
    const b = scenario().seat(0).battlefield(MENTOR).battlefield(SMALL).battlefield(MID);
    const g = b.seat(1).battlefield(BIG).build();
    g.advanceTo('declareAttackers');
    g.act(0).attack(MENTOR);
    g.expect.pending('targets', 0);
    expect(names(g, await answer(g))).toEqual([`${MID}@0`]);
  });
});

describe('when only the wrong side is legal', () => {
  test('a bounce of "a creature you control" takes the weakest of them', async () => {
    const g = entering(BOUNCE, [BIG, SMALL], [MID]);
    g.expect.pending('targets', 0);
    const picked = names(g, await answer(g));
    // The Imp itself (2/2) and the 2/2 are the weakest; the 5/5 stays.
    expect(picked).toHaveLength(1);
    expect(picked[0]).not.toBe(`${BIG}@0`);
  });

  test('"up to one" harmful target is left empty when only its own artifact is legal', async () => {
    const g = entering(TINKER, ['Sol Ring'], []);
    g.expect.pending('targets', 0);
    const action = await answer(g);
    expect(action).toEqual({ kind: 'chooseTargets', targets: [] });
  });

  test('"up to one" harmful target is the opponent artifact when one is legal', async () => {
    const g = entering(TINKER, ['Sol Ring'], ['Sol Ring']);
    g.expect.pending('targets', 0);
    const action = await answer(g);
    if (action.kind !== 'chooseTargets') throw new Error('expected chooseTargets');
    expect(action.targets).toHaveLength(1);
    const first = action.targets[0];
    expect(
      first?.kind === 'object' && g.view(0).battlefield.find((o) => o.id === first.id)?.controller,
    ).toBe(1);
  });
});
