// CasualAgent and a creature that deals the damage (src/casual-bite.ts, D-131): in "Target creature you control deals
// damage equal to its power to target creature or planeswalker you don't control" the agent's strongest creature is the
// one that deals it, and the other slot goes on the opponent's best creature. The cards are SYNTHETIC
// (src/cards/fixtures/synthetic-player-effects.ts of the engine), in states built with the scenario DSL.
import type { Action } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { isBiteSpell } from '../src/casual-bite';
import { answer } from './casual-helpers';

const GNASH = 'SYNTHETIC Gnash Down';
const GIANT = 'SYNTHETIC Echo Giant'; // 4/4
const BEARS = 'Grizzly Bears'; // 2/2
const ELVES = 'Llanowar Elves'; // 1/1
const SPIDER = 'Giant Spider'; // 2/4

function named(g: ScenarioGame, action: Action): string[] {
  if (action.kind !== 'chooseTargets')
    throw new Error(`expected chooseTargets, got ${action.kind}`);
  return action.targets.map((t) => {
    if (t.kind !== 'object') throw new Error('expected an object target');
    const o = g.view(0).battlefield.find((b) => b.id === t.id);
    if (o === undefined) throw new Error('target not on the battlefield');
    return `${o.name}:${o.controller}`;
  });
}

function game(mine: string[], theirs: string[]) {
  const b = scenario().seat(0).hand(GNASH).battlefield('Forest', { count: 2 });
  for (const name of mine) b.battlefield(name);
  b.seat(1);
  for (const name of theirs) b.battlefield(name);
  return b.build();
}

describe('where a bite goes', () => {
  test('the strongest creature of the agent deals the damage, to the best creature of the opponent', async () => {
    const g = game([ELVES, GIANT, BEARS], [ELVES, SPIDER]);
    g.act(0).cast(GNASH);
    expect(named(g, await answer(g))).toEqual([`${GIANT}:0`, `${SPIDER}:1`]);
  });

  test('with one creature of its own, that one deals it', async () => {
    const g = game([BEARS], [SPIDER]);
    g.act(0).cast(GNASH);
    expect(named(g, await answer(g))).toEqual([`${BEARS}:0`, `${SPIDER}:1`]);
  });

  test('the text of the spell is what says it is a bite', () => {
    const g = game([BEARS], [SPIDER]);
    g.act(0).cast(GNASH);
    const view = g.view(0);
    const decision = view.pending;
    if (decision?.kind !== 'targets') throw new Error('expected targets');
    expect(isBiteSpell(view, decision)).toBe(true);
  });
});
