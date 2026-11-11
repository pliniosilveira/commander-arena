// CasualAgent and a division announced with the targets (src/casual-divide.ts, D-145, CR 601.2d): "deals X damage divided as you choose
// among any number of target creatures". The cards are SYNTHETIC (src/cards/fixtures/synthetic-divide.ts of the engine), in states built with
// the scenario DSL. Every answer is also applied to the engine, which refuses a division that is not exact.
import type { Action, ChosenTarget } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { answer } from './casual-helpers';

const RAMPAGE = 'SYNTHETIC Divided Rampage';
const VOLLEY = 'SYNTHETIC Arc Volley';
const V22 = 'SYNTHETIC Vanilla 2/2';
const V33 = 'SYNTHETIC Vanilla 3/3';
const V55 = 'SYNTHETIC Vanilla 5/5';

const shares = (g: ScenarioGame, action: Action): [string, number | undefined][] => {
  if (action.kind !== 'chooseTargets')
    throw new Error(`expected chooseTargets, got ${action.kind}`);
  return action.targets.map((t: ChosenTarget) => {
    if (t.kind === 'player') return [`player ${t.seat}`, t.share];
    const o = g.view(0).battlefield.find((b) => b.id === t.id);
    return [`${o?.name}:${o?.controller}`, t.share];
  });
};

const game = (mine: readonly string[], theirs: readonly string[], card = RAMPAGE) => {
  const b = scenario().seat(0).hand(card).battlefield('Mountain', { count: 3 });
  for (const name of mine) b.battlefield(name);
  b.seat(1).life(20);
  for (const name of theirs) b.battlefield(name);
  return b.build();
};

describe('the agent divides damage among the things it can kill', () => {
  test('X = 5: the cheapest to kill first, the rest on the last', async () => {
    const g = game([V55], [V33, V22, V55]);
    g.act(0).cast(RAMPAGE);
    const action = await answer(g);
    // The 2/2 takes 2, the 3/3 takes the other 3: both die; the 5/5 is left alone.
    expect(shares(g, action)).toEqual([
      [`${V22}:1`, 2],
      [`${V33}:1`, 3],
    ]);
    g.act(0).choose(action).payAuto();
    g.passAll();
    g.expect.zone(V22, 'graveyard', { seat: 1 });
    g.expect.zone(V33, 'graveyard', { seat: 1 });
  });

  test('what is left over goes on the last target, so all of X is given out', async () => {
    const g = game([V55], [V22]);
    g.act(0).cast(RAMPAGE);
    expect(shares(g, await answer(g))).toEqual([[`${V22}:1`, 5]]);
  });

  test('never at its own creatures: without an opposing creature it chooses none', async () => {
    const g = game([V55, V22], []);
    g.act(0).cast(RAMPAGE);
    expect(shares(g, await answer(g))).toEqual([]);
  });

  test('a slot that needs a target gets one even when nothing is hostile: the opponent, never its own side first', async () => {
    const g = game([], [], VOLLEY);
    g.act(0).cast(VOLLEY);
    // Only the opponent can be a hostile target; all 3 go there.
    expect(shares(g, await answer(g))).toEqual([['player 1', 3]]);
  });

  test('any target: the creatures it can kill first, the rest at the opponent', async () => {
    const g = game([], [V22], VOLLEY);
    g.act(0).cast(VOLLEY);
    const action = await answer(g);
    expect(shares(g, action)).toEqual([
      [`${V22}:1`, 2],
      ['player 1', 1],
    ]);
    g.act(0).choose(action).payAuto();
    g.passAll();
    g.expect.zone(V22, 'graveyard', { seat: 1 });
    g.expect.life(1, 19);
  });
});
