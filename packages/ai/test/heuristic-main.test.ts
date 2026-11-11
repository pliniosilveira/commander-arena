// HeuristicAgent main phase and windows (M7c, PRIOR_ART 7.2 heuristics 5, 6, 8 and 9, D-163): lands,
// the set of spells that uses the most mana, the commander tax, removal targets, instant-speed plays held
// for a window and the mulligan. Real engine states from the scenario DSL; each check asserts the action
// and the reason the agent recorded.
import { applyAction, type CardDefinition } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { HeuristicAgent } from '../src/index';
import { askHeuristic, creature, lastReason } from './heuristic-helpers';

const BEARS = 'Grizzly Bears';
const SPIDER = 'Giant Spider'; // 3G
const V2 = 'SYNTHETIC Vanilla 2/2';
const V3 = 'SYNTHETIC Vanilla 3/3';
const V5 = 'SYNTHETIC Vanilla 5/5';
const TARN = 'SYNTHETIC Sulking Tarn'; // enters tapped, U
const SPURT = 'SYNTHETIC Growth Spurt'; // G instant, +3/+3

function main(
  setup: (b: ReturnType<typeof scenario>) => ReturnType<typeof scenario>,
): ScenarioGame {
  return setup(scenario()).at('precombatMain', { active: 0 }).build();
}

describe('lands', () => {
  test('the land that lets the best spell be cast this turn: the basic, not the tapped land', async () => {
    const g = main((b) =>
      b.seat(0).hand('Island', TARN, V2).battlefield('Island').library('Island', { count: 4 }),
    );
    const agent = new HeuristicAgent({ seed: 1 });
    expect(await askHeuristic(g, agent)).toMatchObject({
      kind: 'playLand',
      object: g.id({ name: 'Island', zone: 'hand' }),
    });
    expect(lastReason(agent)?.reason).toBe('land-fix');
  });

  test('with nothing to cast this turn the tapped land is played first', async () => {
    const g = main((b) =>
      b.seat(0).hand('Island', TARN, V5).battlefield('Island').library('Island', { count: 4 }),
    );
    const agent = new HeuristicAgent({ seed: 1 });
    expect(await askHeuristic(g, agent)).toMatchObject({ kind: 'playLand', object: g.id(TARN) });
  });

  test('a land nothing needs waits for the second main phase when a creature can attack', async () => {
    const g = main((b) =>
      b.seat(0).hand('Island').battlefield(BEARS, 'Island').library('Island', { count: 4 }),
    );
    const agent = new HeuristicAgent({ seed: 1 });
    expect(await askHeuristic(g, agent)).toEqual({ kind: 'pass' });
    expect(lastReason(agent)?.reason).toBe('hold');
    g.advanceTo('postcombatMain');
    const late = await askHeuristic(g, agent);
    expect(late.kind).toBe('playLand');
    expect(lastReason(agent)?.reason).toBe('land-late');
  });

  test('a land that is needed is played first, even with a creature ready to attack', async () => {
    const g = main((b) =>
      b.seat(0).hand('Island', V2).battlefield(BEARS, 'Island').library('Island', { count: 4 }),
    );
    expect((await askHeuristic(g)).kind).toBe('playLand');
  });
});

describe('the set of spells that uses the most mana', () => {
  test('5 mana, a 4-drop, a 3-drop and a 2-drop: the 3 and the 2, not the dearest', async () => {
    const g = main((b) =>
      b
        .seat(0)
        .hand(SPIDER, V3, V2)
        .battlefield('Forest', 'Forest', 'Forest', 'Forest', 'Forest')
        .landsPlayed(1)
        .library('Island', { count: 4 }),
    );
    const agent = new HeuristicAgent({ seed: 1 });
    const first = await askHeuristic(g, agent);
    expect(first).toMatchObject({ kind: 'castSpell', object: g.id(V3) });
    expect(lastReason(agent)?.reason).toBe('curve');
  });

  test('colours are counted: a spell the lands cannot pay for is not planned', async () => {
    // Two Forests cannot pay for Serra Angel (3WW); the 2-drop is the play.
    const g = main((b) =>
      b
        .seat(0)
        .hand('Serra Angel', V2)
        .battlefield('Forest', 'Forest', 'Forest', 'Forest', 'Forest')
        .landsPlayed(1)
        .library('Island', { count: 4 }),
    );
    expect(await askHeuristic(g)).toMatchObject({ kind: 'castSpell', object: g.id(V2) });
  });

  test('the commander is cast when it is the best use of the mana', async () => {
    const g = main((b) =>
      b
        .seat(0)
        .commander('Yargle, Glutton of Urborg')
        .hand(V2)
        .battlefield('Swamp', 'Swamp', 'Swamp', 'Swamp', 'Swamp')
        .landsPlayed(1)
        .library('Island', { count: 4 }),
    );
    const agent = new HeuristicAgent({ seed: 1 });
    const action = await askHeuristic(g, agent);
    expect(action).toMatchObject({ kind: 'castSpell' });
    expect(lastReason(agent)?.reason).toBe('commander');
  });

  test('a commander at a high tax stays in the command zone when other spells use half the mana or more', async () => {
    // Isamaru costs W; three casts before makes the tax 6 and the cost 7. Eight lands, a 3 and a 1: 4 of 8 mana.
    const lands = Array.from({ length: 8 }, () => 'Plains');
    const g = main((b) =>
      b
        .seat(0)
        .commander('Isamaru, Hound of Konda', { casts: 3 })
        .hand(V3, 'SYNTHETIC Vanilla 1/1')
        .battlefield(...lands)
        .landsPlayed(1)
        .library('Island', { count: 4 }),
    );
    const agent = new HeuristicAgent({ seed: 1 });
    const action = await askHeuristic(g, agent);
    expect(action).toMatchObject({ kind: 'castSpell', object: g.id(V3) });
    // The same commander with no tax is cast.
    const cheap = main((b) =>
      b
        .seat(0)
        .commander('Isamaru, Hound of Konda')
        .hand(V3)
        .battlefield('Plains', 'Plains')
        .landsPlayed(1)
        .library('Island', { count: 4 }),
    );
    expect(await askHeuristic(cheap)).toMatchObject({
      kind: 'castSpell',
      object: cheap.id('Isamaru, Hound of Konda'),
    });
  });
});

describe('removal goes where it is not wasted', () => {
  const persist = creature('SYNTHETIC Persist Four', 4, 4, ['persist'], { cost: ['4'] });
  const boss: CardDefinition = creature('SYNTHETIC Boss Commander', 3, 3, [], { cost: ['3'] });

  function murderSetup(theirs: [string, Record<string, unknown>?][]) {
    let b = scenario()
      .define(persist)
      .define(boss)
      .seat(0)
      .hand('Murder')
      .battlefield('Swamp', 'Swamp', 'Swamp');
    b = b.library('Island', { count: 4 }).seat(1).library('Island', { count: 4 });
    for (const [name, options] of theirs) b = b.battlefield(name, options ?? {});
    return b.at('precombatMain', { active: 0 }).build();
  }

  test('a destroy spell goes to the commander over a persist 4/4', async () => {
    const g = murderSetup([[persist.name], [boss.name, { commander: true }]]);
    const agent = new HeuristicAgent({ seed: 1 });
    const cast = await askHeuristic(g, agent);
    expect(cast).toMatchObject({ kind: 'castSpell', object: g.id('Murder') });
    expect(lastReason(agent)?.reason).toBe('removal');
    g.choose(cast);
    const picked = await askHeuristic(g, agent);
    expect(picked).toEqual({
      kind: 'chooseTargets',
      targets: [{ kind: 'object', id: g.id(boss.name), specId: 't1' }],
    });
    expect(lastReason(agent)?.reason).toBe('target-commander');
  });

  test('a creature with a persist counter already is a fine target (it will not come back)', async () => {
    const g = murderSetup([[persist.name, { counters: { '-1/-1': 1 } }], [BEARS]]);
    const agent = new HeuristicAgent({ seed: 1 });
    g.choose(await askHeuristic(g, agent));
    const picked = await askHeuristic(g, agent);
    expect(picked).toMatchObject({ targets: [{ id: g.id(persist.name) }] });
  });

  test('with only a persist creature to aim at, the removal spell is not cast', async () => {
    const g = murderSetup([[persist.name]]);
    const agent = new HeuristicAgent({ seed: 1 });
    expect(await askHeuristic(g, agent)).toEqual({ kind: 'pass' });
  });

  test('an indestructible creature is not a target of a destroy spell', async () => {
    const g = murderSetup([['SYNTHETIC Indestructible 2/2'], [BEARS]]);
    const agent = new HeuristicAgent({ seed: 1 });
    g.choose(await askHeuristic(g, agent));
    const picked = await askHeuristic(g, agent);
    expect(picked).toMatchObject({ targets: [{ id: g.id(BEARS) }] });
  });

  test('a creature already named by a removal spell on the stack is not targeted again', async () => {
    // Seat 1 has two creatures; one is already the target of the agent's own Murder on the stack.
    const g = scenario()
      .seat(0)
      .hand('Murder', 'Murder')
      .battlefield('Swamp', 'Swamp', 'Swamp', 'Swamp', 'Swamp', 'Swamp')
      .library('Island', { count: 4 })
      .seat(1)
      .battlefield(V5, V2)
      .library('Island', { count: 4 })
      .at('precombatMain', { active: 0 })
      .build();
    const agent = new HeuristicAgent({ seed: 1 });
    g.choose(await askHeuristic(g, agent));
    g.choose(await askHeuristic(g, agent)); // targets the 5/5
    g.choose(await askHeuristic(g, agent)); // pays
    // The first Murder is on the stack; the agent holds priority and casts the second: not at the 5/5.
    const second = await askHeuristic(g, agent);
    if (second.kind === 'castSpell') {
      g.choose(second);
      const picked = await askHeuristic(g, agent);
      expect(picked).toMatchObject({ targets: [{ id: g.id(V2) }] });
    } else {
      expect(second.kind).toBe('pass');
    }
  });
});

describe('instant-speed plays wait for their window', () => {
  /** The agent (seat 0) attacks with `BEARS` into seat 1's Spider, which blocks; the decision is at priority after blocks. */
  function afterBlocks(blocked: boolean) {
    const g = scenario()
      .seat(0)
      .hand(SPURT)
      .battlefield(BEARS, 'Forest', 'Forest')
      .library('Island', { count: 4 })
      .seat(1)
      .battlefield(SPIDER)
      .library('Island', { count: 4 })
      .at('precombatMain', { active: 0 })
      .build();
    g.playCombat({
      attack: [BEARS],
      block: blocked ? [{ blocker: SPIDER, attacker: BEARS }] : [],
      until: 'declareBlockers',
    });
    return g;
  }

  test('a pump is not cast in the main phase', async () => {
    const g = scenario()
      .seat(0)
      .hand(SPURT)
      .battlefield(BEARS, 'Forest', 'Forest')
      .library('Island', { count: 4 })
      .at('precombatMain', { active: 0 })
      .build();
    const agent = new HeuristicAgent({ seed: 1 });
    expect(await askHeuristic(g, agent)).toEqual({ kind: 'pass' });
  });

  test('a pump is cast after blockers when it turns a lost fight into a won one', async () => {
    const g = afterBlocks(true);
    const agent = new HeuristicAgent({ seed: 1 });
    const action = await askHeuristic(g, agent);
    expect(action).toMatchObject({ kind: 'castSpell', object: g.id(SPURT) });
    expect(lastReason(agent)?.reason).toBe('trick');
  });

  test('a pump is held when the result does not change (nothing blocked)', async () => {
    const g = afterBlocks(false);
    const agent = new HeuristicAgent({ seed: 1 });
    expect(await askHeuristic(g, agent)).toEqual({ kind: 'pass' });
  });

  test('a flash creature is cast in the opponent end step, with the reason end-step', async () => {
    const g = scenario()
      .seat(0)
      .hand('SYNTHETIC Flash Bear')
      .battlefield('Forest', 'Forest')
      .library('Island', { count: 4 })
      .seat(1)
      .library('Island', { count: 4 })
      .at('end', { active: 1 })
      .build();
    g.act(1).pass();
    const agent = new HeuristicAgent({ seed: 1 });
    const action = await askHeuristic(g, agent);
    expect(action).toMatchObject({ kind: 'castSpell', object: g.id('SYNTHETIC Flash Bear') });
    expect(lastReason(agent)?.reason).toBe('end-step');
  });

  test('a counterspell answers the opponent spell on the stack', async () => {
    const g = scenario()
      .seat(0)
      .hand('Counterspell')
      .battlefield('Island', 'Island')
      .library('Island', { count: 4 })
      .seat(1)
      .hand(V3)
      .battlefield('Forest', 'Forest', 'Forest')
      .library('Island', { count: 4 })
      .at('precombatMain', { active: 1 })
      .build();
    g.act(1).cast(V3).pay().pass();
    const agent = new HeuristicAgent({ seed: 1 });
    const action = await askHeuristic(g, agent);
    expect(action).toMatchObject({ kind: 'castSpell', object: g.id('Counterspell') });
    expect(lastReason(agent)?.reason).toBe('counter');
  });
});

describe('the mulligan', () => {
  async function mulliganOf(hand: string[], mulligans = 0) {
    const g = scenario()
      .seat(0)
      .hand(...hand)
      .library('Island', { count: 20 })
      .seat(1)
      .library('Island', { count: 20 })
      .build();
    const view = g.view(0);
    const fake = {
      kind: 'mulligan',
      id: 'd1',
      seat: 0,
      hand: view.seats[0]?.hand?.map((o) => o.id) ?? [],
      bottomCount: mulligans,
      canMulligan: true,
    };
    const agent = new HeuristicAgent({ seed: 1 });
    const action = await agent.decide(view, fake as never, { budgetMs: 1000, now: () => 0 });
    return { action, reason: lastReason(agent)?.reason };
  }

  test('keeps 2 to 5 lands with a spell it can cast', async () => {
    const r = await mulliganOf(['Forest', 'Forest', 'Forest', BEARS, V2, V3, SPIDER]);
    expect(r).toEqual({ action: { kind: 'keepHand' }, reason: 'keep' });
  });

  test('sends back 0, 1 or 6 lands', async () => {
    expect((await mulliganOf([BEARS, V2, V3, SPIDER, V5, V2, V3])).action.kind).toBe(
      'takeMulligan',
    );
    expect((await mulliganOf(['Forest', BEARS, V2, V3, SPIDER, V5, V2])).action.kind).toBe(
      'takeMulligan',
    );
    expect(
      (await mulliganOf(['Forest', 'Forest', 'Forest', 'Forest', 'Forest', 'Forest', V2])).action
        .kind,
    ).toBe('takeMulligan');
  });

  test('sends back a hand with lands and nothing castable by the curve', async () => {
    const r = await mulliganOf(['Forest', 'Forest', V5, V5, V5, V5, V5]);
    expect(r.action.kind).toBe('takeMulligan');
  });

  test('keeps at the minimum size whatever the hand is', async () => {
    // Two mulligans already: keeping now means 5 cards, the minimum.
    const r = await mulliganOf([BEARS, V2, V3, SPIDER, V5, V2, V3], 2);
    expect(r.action.kind).toBe('keepHand');
  });
});

describe('every answer is legal', () => {
  test('the engine accepts what the agent plays for a priority decision with options', async () => {
    const g = main((b) =>
      b
        .seat(0)
        .hand('Forest', BEARS)
        .battlefield('Forest', 'Forest')
        .library('Island', { count: 4 }),
    );
    const action = await askHeuristic(g);
    expect(applyAction(g.state, 0, action).ok).toBe(true);
  });
});
