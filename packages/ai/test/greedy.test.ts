// GreedyAgent (M7b, SPEC 17.3 A11, D-162): one scenario check per rule, on real engine states built
// with the scenario DSL. Each check asserts the action and the reason the agent recorded for it.
import {
  type Action,
  applyAction,
  DECISION_KINDS,
  type PendingDecision,
} from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { GreedyAgent } from '../src/index';
import { CTX } from './helpers';

const BEARS = 'Grizzly Bears'; // 2/2, 1G
const SPIDER = 'Giant Spider'; // 2/4 reach, 3G
const ANGEL = 'Serra Angel'; // 4/4 flying vigilance, 3WW
const RATS = 'Typhoid Rats'; // 1/1 deathtouch, B
const V3 = 'SYNTHETIC Vanilla 3/3';
const V5 = 'SYNTHETIC Vanilla 5/5';
const MENACE = 'SYNTHETIC Menace 2/2';
const BERSERKER = 'SYNTHETIC Berserker'; // 3/3, attacks each combat if able

async function ask(g: ScenarioGame, agent = new GreedyAgent({ seed: 1 })): Promise<Action> {
  const seat = g.deciding;
  const view = g.view(seat);
  if (view.pending === null) throw new Error('no decision');
  const action = await agent.decide(view, view.pending, CTX);
  expect(applyAction(g.state, seat, action).ok).toBe(true);
  return action;
}

const lastReason = (agent: GreedyAgent) => agent.reasons[agent.reasons.length - 1];

/** Seat 0 at precombat main with `mine`, seat 1 with `theirs`, at the declare-attackers decision. */
function attackSetup(mine: string[], theirs: string[], opts: { oppLife?: number } = {}) {
  const b = scenario()
    .seat(0)
    .battlefield(...mine)
    .library('Island', { count: 4 })
    .seat(1)
    .battlefield(...theirs)
    .library('Island', { count: 4 });
  const built = (opts.oppLife === undefined ? b : b.life(opts.oppLife))
    .at('precombatMain', { active: 0 })
    .build();
  built.advanceTo('declareAttackers', { attack: false });
  return built;
}

describe('priority: a land every turn, then the most expensive castable spell', () => {
  test('plays a land before anything else', async () => {
    const g = scenario()
      .seat(0)
      .hand('Forest', BEARS)
      .battlefield('Forest', 'Forest')
      .library('Island', { count: 4 })
      .at('precombatMain', { active: 0 })
      .build();
    const agent = new GreedyAgent({ seed: 1 });
    const action = await ask(g, agent);
    expect(action.kind).toBe('playLand');
    expect(lastReason(agent)).toMatchObject({ decisionKind: 'priority', reason: 'land' });
  });

  test('casts the most expensive spell it can afford, not the cheapest', async () => {
    const g = scenario()
      .seat(0)
      .hand(BEARS, SPIDER)
      .battlefield('Forest', 'Forest', 'Forest', 'Forest')
      .library('Island', { count: 4 })
      .at('precombatMain', { active: 0 })
      .build();
    const agent = new GreedyAgent({ seed: 1 });
    const action = await ask(g, agent);
    expect(action).toMatchObject({ kind: 'castSpell', object: g.id(SPIDER) });
    expect(lastReason(agent)?.reason).toBe('curve');
    expect(lastReason(agent)?.action).toBe(`castSpell ${SPIDER}`);
  });

  test('with less mana it casts the dearest spell that is affordable', async () => {
    const g = scenario()
      .seat(0)
      .hand(BEARS, SPIDER)
      .battlefield('Forest', 'Forest')
      .library('Island', { count: 4 })
      .at('precombatMain', { active: 0 })
      .build();
    expect(await ask(g)).toMatchObject({ kind: 'castSpell', object: g.id(BEARS) });
  });

  test('passes, with the reason no-play, when there is nothing to do; never activates or concedes', async () => {
    const g = scenario()
      .seat(0)
      .hand(SPIDER)
      .battlefield('Forest')
      .library('Island', { count: 4 })
      .at('precombatMain', { active: 0 })
      .build();
    const agent = new GreedyAgent({ seed: 1 });
    expect(await ask(g, agent)).toEqual({ kind: 'pass' });
    expect(lastReason(agent)?.reason).toBe('no-play');
  });

  test('pays with payAuto', async () => {
    const g = scenario().seat(0).battlefield('Forest').library('Island', { count: 4 }).build();
    const view = g.view(0);
    const pay = {
      id: 'd1',
      seat: 0,
      kind: 'payMana',
      source: 'o1',
      totalCost: ['1'],
      manaSources: [],
    };
    const agent = new GreedyAgent({ seed: 1 });
    expect(await agent.decide(view, pay as unknown as PendingDecision, CTX)).toEqual({
      kind: 'payAuto',
    });
    expect(lastReason(agent)).toMatchObject({ decisionKind: 'payMana', reason: 'delegated' });
  });
});

describe('attacks: every creature that survives the attack', () => {
  test('attacks when no blocker can kill the creature', async () => {
    const g = attackSetup([SPIDER], [BEARS]); // a 2/4 into a 2/2
    const agent = new GreedyAgent({ seed: 1 });
    const action = await ask(g, agent);
    expect(action).toEqual({
      kind: 'declareAttackers',
      attacks: [{ attacker: g.id(SPIDER), target: { kind: 'player', seat: 1 } }],
    });
    expect(lastReason(agent)).toMatchObject({
      decisionKind: 'declareAttackers',
      reason: 'safe-attack',
    });
  });

  test('holds back a creature that a blocker would kill, even in an even trade', async () => {
    const g = attackSetup([BEARS], [BEARS]);
    const agent = new GreedyAgent({ seed: 1 });
    expect(await ask(g, agent)).toEqual({ kind: 'declareAttackers', attacks: [] });
    expect(lastReason(agent)?.reason).toBe('hold-back');
  });

  test('a deathtouch blocker makes any attacker unsafe', async () => {
    const g = attackSetup([V5], [RATS]);
    expect(await ask(g)).toEqual({ kind: 'declareAttackers', attacks: [] });
  });

  test('a tapped creature is not a potential blocker', async () => {
    const b = scenario()
      .seat(0)
      .battlefield(BEARS)
      .library('Island', { count: 4 })
      .seat(1)
      .battlefield(V3, { tapped: true })
      .library('Island', { count: 4 })
      .at('precombatMain', { active: 0 })
      .build();
    b.advanceTo('declareAttackers', { attack: false });
    const action = await ask(b);
    expect(action).toMatchObject({ kind: 'declareAttackers' });
    expect(action.kind === 'declareAttackers' && action.attacks).toHaveLength(1);
  });

  test('a flier is safe against blockers without flying or reach', async () => {
    const g = attackSetup([ANGEL], [V5]);
    const action = await ask(g);
    expect(action.kind === 'declareAttackers' && action.attacks).toHaveLength(1);
  });

  test('a flier is not safe against a reach creature that kills it', async () => {
    const g = attackSetup(['SYNTHETIC Flier 1/1'], [SPIDER]);
    expect(await ask(g)).toEqual({ kind: 'declareAttackers', attacks: [] });
  });

  test('a menace creature cannot be blocked by one creature, so it is safe against one blocker', async () => {
    const g = attackSetup([MENACE], [V5]);
    const action = await ask(g);
    expect(action.kind === 'declareAttackers' && action.attacks).toHaveLength(1);
  });

  test('a menace creature is held back when two blockers could kill it together', async () => {
    const g = attackSetup([MENACE], [V3, V3]);
    expect(await ask(g)).toEqual({ kind: 'declareAttackers', attacks: [] });
  });

  test('a creature that attacks each combat is declared even when it is unsafe', async () => {
    const g = attackSetup([BERSERKER], [V5]);
    const action = await ask(g);
    expect(action.kind === 'declareAttackers' && action.attacks).toHaveLength(1);
  });

  test('an all-out attack when the opponent cannot block enough to survive (lethal)', async () => {
    // Three 2/2s and an opponent at 4 with one 5/5: one blocker stops one attacker, two get through.
    const g = attackSetup([BEARS, BEARS, BEARS], [V5], { oppLife: 4 });
    const agent = new GreedyAgent({ seed: 1 });
    const action = await ask(g, agent);
    expect(action.kind === 'declareAttackers' && action.attacks).toHaveLength(3);
    expect(lastReason(agent)?.reason).toBe('lethal');
  });

  test('no all-out attack when the blockers can stop enough damage', async () => {
    const g = attackSetup([BEARS, BEARS], [V5], { oppLife: 4 });
    const agent = new GreedyAgent({ seed: 1 });
    expect(await ask(g, agent)).toEqual({ kind: 'declareAttackers', attacks: [] });
    expect(lastReason(agent)?.reason).toBe('hold-back');
  });

  test('lethal counts the commander clock: the commander that gets through brings the opponent to 21', async () => {
    // The 5/5 blocks the 9/3, the commander 2/2 gets through: 19 + 2 = 21 commander damage.
    const at = async (taken: number) => {
      const g = scenario()
        .seat(0)
        .battlefield('Isamaru, Hound of Konda', { commander: true })
        .battlefield('Yargle, Glutton of Urborg')
        .library('Island', { count: 4 })
        .seat(1)
        .life(40)
        .commanderDamageTaken('Isamaru, Hound of Konda', taken)
        .battlefield(V5)
        .library('Island', { count: 4 })
        .at('precombatMain', { active: 0 })
        .build();
      g.advanceTo('declareAttackers', { attack: false });
      const agent = new GreedyAgent({ seed: 1 });
      const action = await ask(g, agent);
      return { action, reason: lastReason(agent)?.reason };
    };
    const lethal = await at(19);
    expect(lethal.reason).toBe('lethal');
    expect(lethal.action.kind === 'declareAttackers' && lethal.action.attacks).toHaveLength(2);
    const short = await at(15);
    expect(short.action).toEqual({ kind: 'declareAttackers', attacks: [] });
  });
});

/** Seat 1 attacks seat 0 (the agent) with `attackers`; seat 0 has `blockers`; returns the blocking decision. */
function blockSetup(attackers: string[], blockers: string[], life: number) {
  const g = scenario()
    .seat(0)
    .life(life)
    .battlefield(...blockers)
    .library('Island', { count: 4 })
    .seat(1)
    .battlefield(...attackers)
    .library('Island', { count: 4 })
    .at('precombatMain', { active: 1 })
    .build();
  g.advanceTo('declareAttackers');
  g.act(1).attack(attackers);
  g.advanceTo('declareBlockers', { block: false });
  return g;
}

describe('blocks: only to prevent lethal damage', () => {
  test('does not block when the damage is not lethal, even a block that would win', async () => {
    const g = blockSetup([BEARS], [SPIDER], 20);
    const agent = new GreedyAgent({ seed: 1 });
    expect(await ask(g, agent)).toEqual({ kind: 'declareBlockers', blocks: [] });
    expect(lastReason(agent)).toMatchObject({
      decisionKind: 'declareBlockers',
      reason: 'no-block',
    });
  });

  test('chump blocks when the unblocked damage would be lethal', async () => {
    const g = blockSetup([V3], [BEARS], 3);
    const agent = new GreedyAgent({ seed: 1 });
    expect(await ask(g, agent)).toEqual({
      kind: 'declareBlockers',
      blocks: [{ blocker: g.id(BEARS), attacker: g.id(V3) }],
    });
    expect(lastReason(agent)?.reason).toBe('chump-danger');
  });

  test('blocks just enough: the biggest attacker first, and stops when the rest is survivable', async () => {
    const g = blockSetup([V3, BEARS], [BEARS, SPIDER], 4);
    // 3 + 2 = 5 >= 4 is lethal; blocking the 3/3 leaves 2 < 4, so only one block.
    const action = await ask(g);
    expect(action.kind === 'declareBlockers' && action.blocks).toHaveLength(1);
    expect(action.kind === 'declareBlockers' && action.blocks[0]?.attacker).toBe(g.id(V3));
  });

  test('uses the cheapest creature that can block', async () => {
    const g = blockSetup([V3], [SPIDER, RATS], 3);
    const action = await ask(g);
    expect(action.kind === 'declareBlockers' && action.blocks[0]?.blocker).toBe(g.id(RATS));
  });

  test('blocks when poison would be lethal', async () => {
    const g = scenario()
      .seat(0)
      .poison(9)
      .battlefield(BEARS)
      .library('Island', { count: 4 })
      .seat(1)
      .battlefield('SYNTHETIC Toxic Rat')
      .library('Island', { count: 4 })
      .at('precombatMain', { active: 1 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(1).attack('SYNTHETIC Toxic Rat');
    g.advanceTo('declareBlockers', { block: false });
    const action = await ask(g);
    expect(action.kind === 'declareBlockers' && action.blocks).toHaveLength(1);
  });

  test('blocks a commander that would bring it to 21 commander damage', async () => {
    const g = scenario()
      .seat(0)
      .commanderDamageTaken('Yargle, Glutton of Urborg', 15)
      .battlefield(BEARS)
      .library('Island', { count: 4 })
      .seat(1)
      .battlefield('Yargle, Glutton of Urborg', { commander: true })
      .library('Island', { count: 4 })
      .at('precombatMain', { active: 1 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(1).attack('Yargle, Glutton of Urborg');
    g.advanceTo('declareBlockers', { block: false });
    const action = await ask(g);
    expect(action.kind === 'declareBlockers' && action.blocks).toHaveLength(1);
  });
});

describe('the rest is the casual handlers', () => {
  test('a handler for every decision kind, through the casual ones', () => {
    const view = scenario().seat(0).library('Island', { count: 4 }).build().view(0);
    const agent = new GreedyAgent({ seed: 1 });
    expect(Object.keys(agent.decisionHandlers(view)).sort()).toEqual([...DECISION_KINDS].sort());
  });

  test('a throwing handler falls back to a safe legal action and the fallback is recorded', async () => {
    const g = scenario().seat(0).battlefield('Forest').library('Island', { count: 4 }).build();
    const view = g.view(0);
    if (view.pending === null) throw new Error('no decision');
    const agent = new GreedyAgent({
      seed: 1,
      handlerOverrides: {
        priority: () => {
          throw new Error('boom');
        },
      },
    });
    const action = await agent.decide(view, view.pending, CTX);
    expect(applyAction(g.state, 0, action).ok).toBe(true);
    expect(agent.fallbacks).toEqual([{ decisionKind: 'priority', message: 'boom' }]);
  });

  test('every decision is recorded, one record per decision', async () => {
    const g = scenario().seat(0).battlefield('Forest').library('Island', { count: 4 }).build();
    const view = g.view(0);
    if (view.pending === null) throw new Error('no decision');
    const agent = new GreedyAgent({ seed: 1 });
    await agent.decide(view, view.pending, CTX);
    await agent.decide(view, view.pending, CTX);
    expect(agent.reasons).toHaveLength(2);
  });
});
