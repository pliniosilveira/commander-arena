// Blunder suite (issue 624), removal: the HeuristicAgent (seat 0) holds a removal spell in its main phase
// and chooses whether to cast it and at what. Removal on a small creature is not a blunder in general (it
// can be the opponent's key piece); each case here is wrong or right because of its position: a much bigger
// threat beside it, a commander about to deal lethal commander damage, a target the spell cannot kill, a
// blocker that combat already kills, lethal damage to the player.
//
// Convention of the blunder suite: a case the agent gets right today is a plain `test`; a case it gets
// wrong today is `test.fails` with a one-line comment saying what it does instead. Those are the known
// blunders later phases must fix: when one starts passing, vitest reports it, and it becomes a plain test.
// A case is never weakened to make it pass. Each case is a blunder in its own position, never a general
// rule: a move a strong player could defend there does not belong here. Its comment says in one line why.
import type { CardDefinition, ChosenTarget } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { HeuristicAgent } from '../../src/index';
import { askHeuristic, creature } from '../heuristic-helpers';
import { nameOf, playUntilPass } from './drive';

const V1 = 'SYNTHETIC Vanilla 1/1';
const V5 = 'SYNTHETIC Vanilla 5/5';
const BEARS = 'Grizzly Bears'; // 2/2
const ANGEL = 'Serra Angel'; // 4/4 flying vigilance

type Permanent = string | [string, { commander: true }];

/** Seat 0 in its main phase with `spell` in hand, `lands`, and `mine`; seat 1 with `theirs`. */
function removalSetup(
  spell: string,
  lands: string[],
  mine: string[],
  theirs: Permanent[],
  opts: { defs?: CardDefinition[]; oppLife?: number; taken?: [string, number] } = {},
) {
  let b = scenario();
  for (const d of opts.defs ?? []) b = b.define(d);
  b = b.seat(0);
  if (opts.taken !== undefined) b = b.commanderDamageTaken(...opts.taken);
  b = b
    .hand(spell)
    .battlefield(...lands, ...mine)
    .landsPlayed(1)
    .library('Island', { count: 10 })
    .seat(1)
    .life(opts.oppLife ?? 20)
    .library('Island', { count: 10 });
  for (const t of theirs) b = typeof t === 'string' ? b.battlefield(t) : b.battlefield(t[0], t[1]);
  return b.at('precombatMain', { active: 0 }).build();
}

/** Casts with the agent and returns the targets it picked, or null when it does not cast the spell. */
async function targetsOf(
  g: ReturnType<typeof removalSetup>,
  spell: string,
): Promise<ChosenTarget[] | null> {
  const agent = new HeuristicAgent({ seed: 1 });
  const cast = await askHeuristic(g, agent);
  if (cast.kind !== 'castSpell' || cast.object !== g.id(spell)) return null;
  g.choose(cast);
  const picked = await askHeuristic(g, agent);
  if (picked.kind !== 'chooseTargets') throw new Error(`chooseTargets expected: ${picked.kind}`);
  return [...picked.targets];
}

const targetName = (g: ReturnType<typeof removalSetup>, t: ChosenTarget | undefined): string =>
  t === undefined ? 'none' : t.kind === 'object' ? nameOf(g, t.id) : `player ${t.seat}`;

const SWAMPS = ['Swamp', 'Swamp', 'Swamp'];

describe('removal goes at the real threat', () => {
  test('Murder goes at the 5/5, not the 1/1', async () => {
    // Wrong to hit the 1/1 here: both are vanilla, the 5/5 is five times the damage and the only blocker that matters.
    const g = removalSetup('Murder', SWAMPS, [], [V1, V5]);
    const targets = await targetsOf(g, 'Murder');
    expect(targetName(g, targets?.[0])).toBe(V5);
  });

  test('Murder goes at the opposing commander, not the 1/1 beside it', async () => {
    // Wrong to hit the 1/1 here: it is vanilla, and the commander is bigger and the opponent's recurring threat.
    const boss = creature('SYNTHETIC Boss 3/3', 3, 3, [], { cost: ['3'] });
    const g = removalSetup('Murder', SWAMPS, [], [V1, [boss.name, { commander: true }]], {
      defs: [boss],
    });
    const targets = await targetsOf(g, 'Murder');
    expect(targetName(g, targets?.[0])).toBe(boss.name);
  });

  // Today: it aims at the 5/5; target ranking weighs creature value, not commander damage already taken.
  test.fails('Murder goes at the 2/2 commander that has dealt 20 commander damage, not the 5/5', async () => {
    // Wrong to hit the 5/5 here: the 2/2 commander kills the agent with its next hit (21 commander damage), the 5/5 does not.
    const boss = creature('SYNTHETIC Boss 2/2', 2, 2, [], { cost: ['2'] });
    const g = removalSetup('Murder', SWAMPS, [], [V5, [boss.name, { commander: true }]], {
      defs: [boss],
      taken: [boss.name, 20],
    });
    const targets = await targetsOf(g, 'Murder');
    expect(targetName(g, targets?.[0])).toBe(boss.name);
  });

  test('Unsummon goes at the Serra Angel, not the Grizzly Bears', async () => {
    const g = removalSetup('Unsummon', ['Island'], [], [BEARS, ANGEL]);
    const targets = await targetsOf(g, 'Unsummon');
    // Wrong to bounce the Bears here: re-casting a 2-drop costs the opponent nothing; holding Unsummon is fine.
    if (targets !== null) expect(targetName(g, targets[0])).toBe(ANGEL);
  });
});

describe('removal is not wasted', () => {
  test('Murder is not aimed at its own creature', async () => {
    // Wrong here: killing its own 5/5 or Angel only helps the opponent; holding Murder is fine.
    const g = removalSetup('Murder', SWAMPS, [V5, ANGEL], [V1]);
    const targets = await targetsOf(g, 'Murder');
    if (targets !== null) expect(targetName(g, targets[0])).toBe(V1);
  });

  test('Lightning Bolt does not go at a 5/5 it cannot kill', async () => {
    // Wrong here: 3 damage does not kill a 5/5, so the card is spent for nothing.
    const g = removalSetup('Lightning Bolt', ['Mountain'], [], [V5, BEARS]);
    const targets = await targetsOf(g, 'Lightning Bolt');
    if (targets !== null) expect(targetName(g, targets[0])).not.toBe(V5);
  });

  test('Lightning Bolt goes at the face of an opponent at 3 life', async () => {
    // Wrong to aim anywhere else here: 3 damage to an opponent at 3 wins the game.
    const g = removalSetup('Lightning Bolt', ['Mountain'], [], [BEARS], { oppLife: 3 });
    const targets = await targetsOf(g, 'Lightning Bolt');
    expect(targetName(g, targets?.[0])).toBe('player 1');
  });

  test('Murder is not spent on a blocker that its own 5/5 is already killing', async () => {
    // Wrong here: the Bears die in combat damage anyway, so Murder buys nothing.
    const g = scenario()
      .seat(0)
      .hand('Murder')
      .battlefield(...SWAMPS, V5)
      .library('Island', { count: 10 })
      .seat(1)
      .battlefield(BEARS)
      .library('Island', { count: 10 })
      .at('precombatMain', { active: 0 })
      .build();
    g.playCombat({
      attack: [V5],
      block: [{ blocker: BEARS, attacker: V5 }],
      until: 'declareBlockers',
    });
    const { cast } = await playUntilPass(g, 0);
    expect(cast).not.toContain('Murder');
  });
});
