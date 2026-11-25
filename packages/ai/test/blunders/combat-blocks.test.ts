// Blunder suite (issue 624), blocks: seat 1 attacks and the HeuristicAgent (seat 0) declares blockers in
// positions where one block is clearly wrong or clearly right. A human would never chump with the best
// creature at high life, take lethal damage with a blocker at home, or pass up a vanilla 2-drop for the
// opposing commander. The attacker has no cards in hand and no lands, so no trick can change a fight.
//
// Convention of the blunder suite: a case the agent gets right today is a plain `test`; a case it gets
// wrong today is `test.fails` with a one-line comment saying what it does instead. Those are the known
// blunders later phases must fix: when one starts passing, vitest reports it, and it becomes a plain test.
// A case is never weakened to make it pass. Each case is a blunder in its own position, never a general
// rule: a move a strong player could defend there does not belong here. Its comment says in one line why.
import type { Action, CardDefinition } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { askHeuristic, creature } from '../heuristic-helpers';
import { blunderAgent, nameOf } from './drive';

const V1 = 'SYNTHETIC Vanilla 1/1';
const V3 = 'SYNTHETIC Vanilla 3/3';
const V5 = 'SYNTHETIC Vanilla 5/5';
const TRAMPLER = 'SYNTHETIC Trampler 4/4';
const ANGEL = 'Serra Angel'; // 4/4 flying vigilance
const BEARS = 'Grizzly Bears'; // 2/2
const SPIDER = 'Giant Spider'; // 2/4 reach
const RATS = 'Typhoid Rats'; // 1/1 deathtouch

/** Seat 1 attacks seat 0 (the agent, at `life`) with `attackers`; seat 0 holds `blockers`. */
function blockSetup(
  attackers: string[],
  blockers: string[],
  life: number,
  opts: { defs?: CardDefinition[]; theirCommander?: string; myCommander?: string } = {},
) {
  let b = scenario();
  for (const d of opts.defs ?? []) b = b.define(d);
  b = b.seat(0).life(life);
  if (opts.myCommander !== undefined) b = b.battlefield(opts.myCommander, { commander: true });
  b = b
    .battlefield(...blockers)
    .library('Island', { count: 10 })
    .seat(1);
  for (const a of attackers) {
    b = b.battlefield(a, a === opts.theirCommander ? { commander: true } : {});
  }
  const g = b.library('Island', { count: 10 }).at('precombatMain', { active: 1 }).build();
  g.advanceTo('declareAttackers');
  const seen = new Map<string, number>();
  const refs = attackers.map((name) => {
    const nth = seen.get(name) ?? 0;
    seen.set(name, nth + 1);
    return { name, seat: 1 as const, zone: 'battlefield' as const, nth };
  });
  g.act(1).attack(refs);
  g.advanceTo('declareBlockers', { block: false });
  return g;
}

/** The blocks of the agent's answer as [blocker name, attacker name] pairs. */
async function blocks(g: ReturnType<typeof blockSetup>): Promise<[string, string][]> {
  const action: Action = await askHeuristic(g, blunderAgent());
  if (action.kind !== 'declareBlockers')
    throw new Error(`declareBlockers expected: ${action.kind}`);
  return action.blocks.map((x) => [nameOf(g, x.blocker), nameOf(g, x.attacker)]);
}

describe('do not throw away the best creature', () => {
  test('at 30 life, the Angel does not chump a 5/5', async () => {
    // Wrong here: the Angel dies without killing the 5/5, to save 5 life out of 30.
    const g = blockSetup([V5], [ANGEL, BEARS], 30);
    expect((await blocks(g)).map(([blocker]) => blocker)).not.toContain(ANGEL);
  });

  test('at 20 life, a 1/1 does not chump a 4/4 trampler: it saves 1 damage', async () => {
    // Wrong here: trample sends 3 of the 4 damage through anyway, so the 1/1 dies to save 1 life out of 20.
    const g = blockSetup([TRAMPLER], [V1], 20);
    expect(await blocks(g)).toEqual([]);
  });

  test('at 20 life, the commander does not block a deathtouch 1/1', async () => {
    // Wrong here: the commander dies to deathtouch to save 1 life out of 20.
    const lord = creature('SYNTHETIC Lord 4/4', 4, 4, [], { cost: ['4'] });
    const g = blockSetup([RATS], [], 20, { defs: [lord], myCommander: lord.name });
    expect(await blocks(g)).toEqual([]);
  });
});

describe('never take lethal with a blocker at home', () => {
  test('at 5 life against two 3/3s, the lone 2/2 blocks one of them', async () => {
    // Wrong not to block here: 6 damage is lethal at 5 life, and one block brings it down to 3.
    const g = blockSetup([V3, V3], [BEARS], 5);
    expect(await blocks(g)).toHaveLength(1);
  });

  test('at 4 life against three 3/3s, enough blockers stop the damage below 4', async () => {
    const g = blockSetup([V3, V3, V3], [BEARS, BEARS, SPIDER], 4);
    const action = await askHeuristic(g, blunderAgent());
    const blocked = action.kind === 'declareBlockers' ? action.blocks.map((x) => x.attacker) : [];
    const unblocked = 3 - new Set(blocked).size;
    // Wrong to leave two unblocked here: 6 damage is lethal at 4; two blocks or more leave 3 through, alive at 1.
    expect(unblocked).toBeLessThanOrEqual(1);
  });
});

describe('take the good trades', () => {
  // Wrong not to block here: a vanilla 2-drop for the commander, which comes back only at +2 tax; nothing else is at stake.
  // Today: no block; at 20 life the even trade is not scored above taking 2, even for a commander.
  test.fails('a 2/2 trades with the opposing 2/2 commander', async () => {
    const boss = creature('SYNTHETIC Boss 2/2', 2, 2, [], { cost: ['3'] });
    const g = blockSetup([boss.name], [BEARS], 20, { defs: [boss], theirCommander: boss.name });
    expect(await blocks(g)).toEqual([[BEARS, boss.name]]);
  });
});
