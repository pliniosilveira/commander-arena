// HeuristicAgent attacks (M7c, PRIOR_ART 7.2 heuristics 1, 3 and 9, D-163): the lethal check, the
// crack-back, attacks scored by playing them out, and the attack tax. Real engine states from the
// scenario DSL; each check asserts the answer and the reason.
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { urgency } from '../src/heuristic-attacks';
import { HeuristicAgent } from '../src/index';
import { askHeuristic, creature, lastReason } from './heuristic-helpers';

const BEARS = 'Grizzly Bears'; // 2/2
const SPIDER = 'Giant Spider'; // 2/4 reach
const ANGEL = 'Serra Angel'; // 4/4 flying vigilance
const V1 = 'SYNTHETIC Vanilla 1/1';
const V3 = 'SYNTHETIC Vanilla 3/3';
const V5 = 'SYNTHETIC Vanilla 5/5';
const BERSERKER = 'SYNTHETIC Berserker';

/** Seat 0 (the agent) at the declare-attackers decision with `mine`, seat 1 with `theirs`. */
function attackSetup(
  mine: string[],
  theirs: (string | [string, { tapped: true }])[],
  opts: { oppLife?: number; life?: number } = {},
) {
  let b = scenario().seat(0);
  if (opts.life !== undefined) b = b.life(opts.life);
  b = b
    .battlefield(...mine)
    .library('Island', { count: 4 })
    .seat(1);
  if (opts.oppLife !== undefined) b = b.life(opts.oppLife);
  for (const t of theirs) {
    b = typeof t === 'string' ? b.battlefield(t) : b.battlefield(t[0], t[1]);
  }
  const g = b.library('Island', { count: 4 }).at('precombatMain', { active: 0 }).build();
  g.advanceTo('declareAttackers', { attack: false });
  return g;
}

describe('the lethal check', () => {
  test('the opponent at 5 with two untapped 1/1s, four 3/3s: all four attack', async () => {
    const g = attackSetup([V3, V3, V3, V3], [V1, V1], { oppLife: 5 });
    const agent = new HeuristicAgent({ seed: 1 });
    const action = await askHeuristic(g, agent);
    expect(action.kind === 'declareAttackers' && action.attacks).toHaveLength(4);
    expect(lastReason(agent)).toMatchObject({ decisionKind: 'declareAttackers', reason: 'lethal' });
  });

  test('three blockers stop three of four attackers: the attack is not called lethal', async () => {
    const g = attackSetup([V3, V3, V3, V3], [V1, V1, V1], { oppLife: 5 });
    const agent = new HeuristicAgent({ seed: 1 });
    await askHeuristic(g, agent);
    expect(lastReason(agent)?.reason).not.toBe('lethal');
  });
});

describe('the crack-back', () => {
  test('at 4 life facing two 3/3s that untap, a blocker stays home', async () => {
    const g = attackSetup(
      [SPIDER, SPIDER],
      [
        [V3, { tapped: true }],
        [V3, { tapped: true }],
      ],
      {
        life: 4,
      },
    );
    const agent = new HeuristicAgent({ seed: 1 });
    const action = await askHeuristic(g, agent);
    expect(action.kind === 'declareAttackers' && action.attacks.length).toBeLessThan(2);
    expect(lastReason(agent)?.reason).toBe('crack-back');
  });

  test('with plenty of life and little to fear the same attackers go: nothing can block them', async () => {
    const g = attackSetup(
      [SPIDER, SPIDER],
      [
        [V1, { tapped: true }],
        [V1, { tapped: true }],
      ],
      {
        life: 30,
      },
    );
    const agent = new HeuristicAgent({ seed: 1 });
    const action = await askHeuristic(g, agent);
    expect(action.kind === 'declareAttackers' && action.attacks).toHaveLength(2);
    expect(lastReason(agent)?.reason).toBe('safe-attack');
  });
});

describe('attacks scored by playing them out', () => {
  test('a creature that a blocker would kill stays home', async () => {
    const g = attackSetup([BEARS], [V3]);
    const agent = new HeuristicAgent({ seed: 1 });
    expect(await askHeuristic(g, agent)).toEqual({ kind: 'declareAttackers', attacks: [] });
    expect(lastReason(agent)?.reason).toBe('hold-back');
  });

  test('a flier that nothing can block goes', async () => {
    const g = attackSetup([ANGEL], [V5]);
    const agent = new HeuristicAgent({ seed: 1 });
    const action = await askHeuristic(g, agent);
    expect(action.kind === 'declareAttackers' && action.attacks).toHaveLength(1);
    expect(lastReason(agent)?.reason).toBe('safe-attack');
  });

  test('a creature that attacks each combat is declared even when it loses', async () => {
    const g = attackSetup([BERSERKER], [V5]);
    const agent = new HeuristicAgent({ seed: 1 });
    const action = await askHeuristic(g, agent);
    expect(action.kind === 'declareAttackers' && action.attacks).toHaveLength(1);
    expect(lastReason(agent)?.reason).toBe('must-attack');
  });

  test('a bigger creature attacks into a smaller blocker and trades up', async () => {
    const g = attackSetup([V5], [BEARS], { oppLife: 20 });
    const action = await askHeuristic(g);
    expect(action.kind === 'declareAttackers' && action.attacks).toHaveLength(1);
  });
});

describe('the library clock', () => {
  /** Three 3/3s against three 5/5s, so that every attack is lost to a block, with `mine` and `theirs` cards left in the libraries. */
  function standoff(mine: number, theirs: number) {
    const g = scenario()
      .seat(0)
      .battlefield(V3, V3, V3)
      .library('Island', { count: mine })
      .seat(1)
      .battlefield(V5, V5, V5)
      .library('Island', { count: theirs })
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    return g;
  }

  /** An agent that has seen the opponent block every time it could (so it assumes a sensible opponent). */
  function wary(): HeuristicAgent {
    const agent = new HeuristicAgent({ seed: 1 });
    const seen = scenario()
      .seat(0)
      .battlefield('Grizzly Bears')
      .library('Island', { count: 4 })
      .seat(1)
      .battlefield('Giant Spider')
      .library('Island', { count: 4 })
      .at('precombatMain', { active: 0 })
      .build();
    seen.playCombat({
      attack: ['Grizzly Bears'],
      block: [{ blocker: 'Giant Spider', attacker: 'Grizzly Bears' }],
      until: 'declareBlockers',
    });
    for (let turn = 1; turn <= 8; turn += 1) {
      agent.opponent.observe({ ...seen.view(0), turn });
    }
    return agent;
  }

  test('with plenty of library the agent sits behind a bigger board against a sensible opponent', async () => {
    const agent = wary();
    expect(await askHeuristic(standoff(30, 30), agent)).toEqual({
      kind: 'declareAttackers',
      attacks: [],
    });
    expect(lastReason(agent)?.reason).toBe('hold-back');
  });

  test('urgency: 0 unless the agent decks first, then rising as its library falls', () => {
    const urgencyOf = (mine: number, theirs: number) => urgency(standoff(mine, theirs).view(0));
    // From the agent's own turn the opponent draws next: it fails first when it has no more cards.
    expect(urgencyOf(2, 2)).toBe(0);
    expect(urgencyOf(30, 3)).toBe(0);
    expect(urgencyOf(5, 6)).toBeGreaterThan(0);
    expect(urgencyOf(1, 2)).toBeGreaterThan(0.9);
    expect(urgencyOf(2, 6)).toBeGreaterThan(urgencyOf(8, 12));
    expect(urgencyOf(30, 40)).toBe(0);
  });

  test('the agent that will not deck first is patient however empty the libraries are', async () => {
    const agent = wary();
    expect(await askHeuristic(standoff(2, 2), agent)).toEqual({
      kind: 'declareAttackers',
      attacks: [],
    });
  });

  test('against an opponent that has never blocked, a bigger board is attacked at once', async () => {
    const agent = new HeuristicAgent({ seed: 1 });
    const seen = scenario()
      .seat(0)
      .battlefield('Grizzly Bears')
      .library('Island', { count: 4 })
      .seat(1)
      .battlefield('Giant Spider')
      .library('Island', { count: 4 })
      .at('precombatMain', { active: 0 })
      .build();
    seen.playCombat({ attack: ['Grizzly Bears'], block: [], until: 'declareBlockers' });
    for (let turn = 1; turn <= 8; turn += 1) agent.opponent.observe({ ...seen.view(0), turn });
    expect(agent.opponent.passiveWeight).toBeGreaterThan(0.85);
    // Three 3/3s into three 5/5s that never block: the damage is free, and the crack-back is small.
    const g = scenario()
      .seat(0)
      .battlefield(V3, V3, V3)
      .library('Island', { count: 30 })
      .seat(1)
      .battlefield(V1, V1, V1)
      .library('Island', { count: 30 })
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    const action = await askHeuristic(g, agent);
    expect(action.kind === 'declareAttackers' && action.attacks.length).toBeGreaterThan(0);
  });
});

describe('a commander that a block would kill (issue 73)', () => {
  // The position of the report, with our own cards: a 2/2 flying commander with vigilance and a 3/5
  // flier attack into one untapped 4/4 with reach, and the opponent has two big creatures that are
  // tapped now and will attack back. The blocker stops the 3/5 for nothing, or kills the commander.
  const queen = creature('SYNTHETIC Queen 2/2', 2, 2, ['flying', 'vigilance']);
  const guard = creature('SYNTHETIC Guard 3/5', 3, 5, ['flying']);
  const sentry = creature('SYNTHETIC Sentry 3/4', 3, 4, ['flying']);
  const wall = creature('SYNTHETIC Reach Wall 4/4', 4, 4, ['reach']);
  const brute = creature('SYNTHETIC Brute 4/4', 4, 4);

  function position(life: number, oppLife: number) {
    const g = scenario()
      .define(queen)
      .define(guard)
      .define(sentry)
      .define(wall)
      .define(brute)
      .seat(0)
      .life(life)
      .battlefield(queen.name, { commander: true })
      .battlefield(guard.name)
      .battlefield(sentry.name, { fresh: true })
      .library('Island', { count: 30 })
      .seat(1)
      .life(oppLife)
      .battlefield(wall.name)
      .battlefield(brute.name, { tapped: true })
      .battlefield(V5, { tapped: true })
      .library('Island', { count: 30 })
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    return g;
  }

  test('the commander stays home: the reach blocker would kill it and stop nothing else', async () => {
    const g = position(14, 9);
    const agent = new HeuristicAgent({ seed: 1 });
    const action = await askHeuristic(g, agent);
    const attackers =
      action.kind === 'declareAttackers' ? action.attacks.map((a) => a.attacker) : [];
    expect(attackers).not.toContain(g.id(queen.name));
    expect(lastReason(agent)).toMatchObject({ decisionKind: 'declareAttackers' });
  });
});
