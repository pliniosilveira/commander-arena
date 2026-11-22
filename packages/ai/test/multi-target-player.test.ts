// More opponents (issue 481): a "target player" choice goes at the opponent with the least life,
// not at the first listed opponent. Real three-seat engine states from the scenario DSL.
import type { Action } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { CasualAgent } from '../src/index';
import { ctxFor } from './heuristic-helpers';

function bolt(lifes: [number, number]) {
  const g = scenario({ seats: 3 })
    .seat(0)
    .hand('Lightning Bolt')
    .battlefield('Mountain')
    .library('Island', { count: 4 })
    .seat(1)
    .life(lifes[0])
    .library('Island', { count: 4 })
    .seat(2)
    .life(lifes[1])
    .library('Island', { count: 4 })
    .at('precombatMain', { active: 0 })
    .build();
  g.act(0).cast('Lightning Bolt');
  return g;
}

async function aimed(g: ReturnType<typeof bolt>): Promise<number[]> {
  const view = g.view(0);
  if (view.pending === null) throw new Error('no decision');
  const a: Action = await new CasualAgent({ seed: 1 }).decide(view, view.pending, ctxFor(g));
  if (a.kind !== 'chooseTargets') throw new Error(`expected chooseTargets, got ${a.kind}`);
  return a.targets.map((t) => (t.kind === 'player' ? t.seat : -1));
}

describe('player-targeted spells with three seats', () => {
  test('the opponent at 3 life (lethal) is aimed at, not seat 1 at 40', async () => {
    expect(await aimed(bolt([40, 3]))).toEqual([2]);
  });
  test('otherwise the opponent with the least life; equal life keeps the lowest seat', async () => {
    expect(await aimed(bolt([20, 12]))).toEqual([2]);
    expect(await aimed(bolt([15, 15]))).toEqual([1]);
  });
});
