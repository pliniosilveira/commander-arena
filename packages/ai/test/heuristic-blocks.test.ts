// HeuristicAgent blocks (M7c, PRIOR_ART 7.2 heuristics 2 and 3, D-163): scenario checks on real engine
// states, each asserting the answer and the reason recorded. The situations are the block cases of
// PRIOR_ART heuristic 2 written in our own words and with our own cards.
import type { CardDefinition } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { HeuristicAgent } from '../src/index';
import { askHeuristic, creature, lastReason } from './heuristic-helpers';

const BEARS = 'Grizzly Bears'; // 2/2
const SPIDER = 'Giant Spider'; // 2/4 reach
const RATS = 'Typhoid Rats'; // 1/1 deathtouch
const V3 = 'SYNTHETIC Vanilla 3/3';
const V5 = 'SYNTHETIC Vanilla 5/5';

/** Seat 1 attacks seat 0 (the agent, at `life`) with `attackers`; seat 0 can block with `blockers`. */
function blockSetup(
  attackers: string[],
  blockers: string[],
  life: number,
  options: { defs?: CardDefinition[]; taken?: [string, number]; commander?: string } = {},
) {
  let b = scenario();
  for (const d of options.defs ?? []) b = b.define(d);
  b = b.seat(0).life(life);
  if (options.taken !== undefined) b = b.commanderDamageTaken(...options.taken);
  b = b
    .battlefield(...blockers)
    .library('Island', { count: 4 })
    .seat(1);
  for (const a of attackers) {
    b = b.battlefield(a, a === options.commander ? { commander: true } : {});
  }
  const g = b.library('Island', { count: 4 }).at('precombatMain', { active: 1 }).build();
  g.advanceTo('declareAttackers');
  g.act(1).attack(attackers);
  g.advanceTo('declareBlockers', { block: false });
  return g;
}

describe('blocks that win or trade well', () => {
  test('a small attacker into a big blocker: block it', async () => {
    const g = blockSetup([BEARS], [SPIDER], 20);
    const agent = new HeuristicAgent({ seed: 1 });
    expect(await askHeuristic(g, agent)).toEqual({
      kind: 'declareBlockers',
      blocks: [{ blocker: g.id(SPIDER), attacker: g.id(BEARS) }],
    });
    expect(lastReason(agent)).toMatchObject({
      decisionKind: 'declareBlockers',
      reason: 'good-block',
    });
  });

  test('an even trade against a more valuable blocker is not made, unless the damage is lethal', async () => {
    const flier = creature('SYNTHETIC Flying Three', 3, 3, ['flying']);
    const calm = blockSetup([V3], [flier.name], 20, { defs: [flier] });
    const agent = new HeuristicAgent({ seed: 1 });
    expect(await askHeuristic(calm, agent)).toEqual({ kind: 'declareBlockers', blocks: [] });
    expect(lastReason(agent)?.reason).toBe('no-block');
    const low = blockSetup([V3], [flier.name], 3, { defs: [flier] });
    const agent2 = new HeuristicAgent({ seed: 1 });
    const action = await askHeuristic(low, agent2);
    expect(action.kind === 'declareBlockers' && action.blocks).toHaveLength(1);
    expect(lastReason(agent2)?.reason).toBe('chump-danger');
  });

  test('a deathtouch blocker kills a big attacker', async () => {
    const g = blockSetup([V5], [RATS], 20);
    const agent = new HeuristicAgent({ seed: 1 });
    expect(await askHeuristic(g, agent)).toEqual({
      kind: 'declareBlockers',
      blocks: [{ blocker: g.id(RATS), attacker: g.id(V5) }],
    });
    expect(lastReason(agent)?.reason).toBe('trade-block');
  });

  test('a menace deathtouch attacker is never blocked by one creature, nor by two that it would both kill', async () => {
    const menaceDt = creature('SYNTHETIC Menace Deathtoucher', 2, 2, ['menace', 'deathtouch']);
    const g = blockSetup([menaceDt.name], [BEARS, BEARS], 20, { defs: [menaceDt] });
    const agent = new HeuristicAgent({ seed: 1 });
    const action = await askHeuristic(g, agent);
    expect(action).toEqual({ kind: 'declareBlockers', blocks: [] });
    expect(lastReason(agent)?.reason).toBe('no-block');
  });

  test('two creatures gang up on an attacker that can kill only one of them', async () => {
    const g = blockSetup([V5], [V3, V3], 30);
    const agent = new HeuristicAgent({ seed: 1 });
    const action = await askHeuristic(g, agent);
    expect(action.kind === 'declareBlockers' && action.blocks).toHaveLength(2);
    expect(lastReason(agent)?.reason).toBe('gang-block');
  });
});

describe('chump blocks only in danger', () => {
  test('an opposing commander at 18 commander damage attacks as a 4/4: the agent at 35 life chump blocks', async () => {
    const boss = creature('SYNTHETIC Boss Commander', 4, 4, [], { cost: ['4'] });
    const g = blockSetup([boss.name], [BEARS], 35, {
      defs: [boss],
      taken: [boss.name, 18],
      commander: boss.name,
    });
    const agent = new HeuristicAgent({ seed: 1 });
    expect(await askHeuristic(g, agent)).toEqual({
      kind: 'declareBlockers',
      blocks: [{ blocker: g.id(BEARS), attacker: g.id(boss.name) }],
    });
    expect(lastReason(agent)?.reason).toBe('chump-danger');
  });

  test('the same commander at 8 commander damage is not chump blocked', async () => {
    const boss = creature('SYNTHETIC Boss Commander', 4, 4, [], { cost: ['4'] });
    const g = blockSetup([boss.name], [BEARS], 35, {
      defs: [boss],
      taken: [boss.name, 8],
      commander: boss.name,
    });
    expect(await askHeuristic(g)).toEqual({ kind: 'declareBlockers', blocks: [] });
  });

  test('at 20 life a 3/3 into a lone 2/2 is not blocked', async () => {
    const g = blockSetup([V3], [BEARS], 20);
    expect(await askHeuristic(g)).toEqual({ kind: 'declareBlockers', blocks: [] });
  });

  test('without a sample the same plans come from the view alone', async () => {
    const g = blockSetup([BEARS], [SPIDER], 20);
    const agent = new HeuristicAgent({ seed: 1 });
    const action = await askHeuristic(g, agent, agent && { withSample: false });
    expect(action.kind === 'declareBlockers' && action.blocks).toHaveLength(1);
    expect(lastReason(agent)?.reason).toBe('good-block');
  });
});

describe('one blocker, two attackers (issue 73)', () => {
  const big = creature('SYNTHETIC Big Flier 3/5', 3, 5, ['flying']);
  const small = creature('SYNTHETIC Small Flier 2/2', 2, 2, ['flying']);
  const wall = creature('SYNTHETIC Reach Wall 4/4', 4, 4, ['reach']);

  test('the blocker goes on the attacker it kills, not on the stronger one it only stops', async () => {
    const g = blockSetup([big.name, small.name], [wall.name], 20, { defs: [big, small, wall] });
    const agent = new HeuristicAgent({ seed: 1 });
    expect(await askHeuristic(g, agent)).toEqual({
      kind: 'declareBlockers',
      blocks: [{ blocker: g.id(wall.name), attacker: g.id(small.name) }],
    });
    expect(lastReason(agent)?.reason).toBe('good-block');
  });

  test('without a sample the same block is taken', async () => {
    const g = blockSetup([big.name, small.name], [wall.name], 20, { defs: [big, small, wall] });
    expect(await askHeuristic(g, new HeuristicAgent({ seed: 1 }), { withSample: false })).toEqual({
      kind: 'declareBlockers',
      blocks: [{ blocker: g.id(wall.name), attacker: g.id(small.name) }],
    });
  });
});

describe('the commander as a blocker', () => {
  const lord = creature('SYNTHETIC Lord 2/2', 2, 2, ['flying']);

  test('at 20 life a commander does not chump block a bigger attacker', async () => {
    const flagged = scenario()
      .define(lord)
      .seat(0)
      .life(20)
      .battlefield(lord.name, { commander: true })
      .library('Island', { count: 4 })
      .seat(1)
      .battlefield(V3)
      .library('Island', { count: 4 })
      .at('precombatMain', { active: 1 })
      .build();
    flagged.advanceTo('declareAttackers');
    flagged.act(1).attack([V3]);
    flagged.advanceTo('declareBlockers', { block: false });
    const agent = new HeuristicAgent({ seed: 1 });
    expect(await askHeuristic(flagged, agent)).toEqual({ kind: 'declareBlockers', blocks: [] });
  });
});
