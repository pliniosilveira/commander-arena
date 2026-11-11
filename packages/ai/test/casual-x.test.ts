// CasualAgent and X (D-103) on real engine states built with the scenario DSL. The policy: for "deals X
// damage" enough to kill the opponent when that is within reach, else enough to kill the opposing
// creature with the most power that it could kill, never more, else everything at the opponent's face;
// for "draw X cards" everything but the last card of its library; for "pay X life" no more than leaves
// it above 10 life; otherwise everything. It never casts an instant or sorcery with an {X} for X = 0, and
// the targets of an X damage spell follow the announced X. Every answer is one the engine lists.
import { type Action, applyAction, getLegalActions } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { CasualAgent, GreedyAgent, HeuristicAgent } from '../src/index';
import { CTX } from './helpers';

const BURN = 'SYNTHETIC X Burn';
const DRAW = 'SYNTHETIC X Draw';
const PUMP = 'SYNTHETIC X Pump';
const HYDRA = 'SYNTHETIC Hydra Cub';
const BLOOD = 'SYNTHETIC Blood Burn';
const FREE = 'SYNTHETIC Free X Burn';
const ZERO = 'SYNTHETIC Hydra Zero'; // 0/0, {X}{G}, "enters with X +1/+1 counters" (a Shivan Devastator)

async function answer(g: ScenarioGame, seat = 0): Promise<Action> {
  const view = g.view(seat);
  if (view.pending === null) throw new Error('the seat does not see its decision');
  const action = await new CasualAgent({ seed: 1 }).decide(view, view.pending, CTX);
  // Whatever the agent answers, the engine lists it and accepts it.
  expect(
    getLegalActions(g.state, seat).some((a) => JSON.stringify(a) === JSON.stringify(action)),
    JSON.stringify(action),
  ).toBe(true);
  expect(applyAction(g.state, seat, action).ok).toBe(true);
  return action;
}

const burnGame = (mountains: number, setup?: (b: ReturnType<typeof scenario>) => void) => {
  const b = scenario().seat(0).hand(BURN).battlefield('Mountain', { count: mountains });
  const s = b.seat(1);
  setup?.(s);
  return s.build();
};

describe('"deals X damage"', () => {
  test('enough to kill the creature it would aim at, not more; and it aims there', async () => {
    const g = burnGame(7, (b) => b.battlefield('Giant Spider'));
    g.act(0).cast(BURN);
    g.expect.pending('chooseX', 0);
    expect(await answer(g)).toEqual({ kind: 'chooseX', value: 4 });
    g.act(0).chooseX(4);
    const targets = await answer(g);
    expect(targets).toMatchObject({ kind: 'chooseTargets', targets: [{ kind: 'object' }] });
    g.choose(targets);
    g.act(0).payAuto();
    g.passAll();
    g.expect.zone('Giant Spider', 'graveyard', { seat: 1 });
  });

  test('the creature with the most power among those it can kill', async () => {
    const g = burnGame(7, (b) => b.battlefield('Grizzly Bears', 'Serra Angel', 'Giant Spider'));
    g.act(0).cast(BURN);
    // Mana for X = 6: the Angel (4/4, power 4) and the Spider (2/4) both die to 4; the Bears to 2.
    expect(await answer(g)).toEqual({ kind: 'chooseX', value: 4 });
    g.act(0).chooseX(4);
    g.choose(await answer(g));
    g.act(0).payAuto();
    g.passAll();
    g.expect.zone('Serra Angel', 'graveyard', { seat: 1 });
    g.expect.zone('Giant Spider', 'battlefield', { seat: 1 });
  });

  test('lethal to the opponent comes first, and the damage goes to their face', async () => {
    const g = scenario()
      .seat(0)
      .hand(BURN)
      .battlefield('Mountain', { count: 6 })
      .seat(1)
      .life(4)
      .battlefield('Giant Spider')
      .build();
    g.act(0).cast(BURN);
    expect(await answer(g)).toEqual({ kind: 'chooseX', value: 4 });
    g.act(0).chooseX(4);
    expect(await answer(g)).toEqual({
      kind: 'chooseTargets',
      targets: [{ kind: 'player', seat: 1, specId: 't1' }],
    });
  });

  test('with nothing it can kill it spends everything on the opponent', async () => {
    const g = burnGame(3, (b) => b.battlefield('Giant Spider'));
    g.act(0).cast(BURN);
    // X can be 2 at most: the Spider (toughness 4) lives, so the damage goes to the face.
    expect(await answer(g)).toEqual({ kind: 'chooseX', value: 2 });
    g.act(0).chooseX(2);
    expect(await answer(g)).toMatchObject({ kind: 'chooseTargets', targets: [{ kind: 'player' }] });
  });
});

describe('other X', () => {
  test('"draw X cards": all of it, but not the last card of its library', async () => {
    const g = scenario()
      .seat(0)
      .hand(DRAW)
      .battlefield('Island', { count: 6 })
      .library('Plains', 'Plains', 'Plains')
      .seat(1)
      .build();
    g.act(0).cast(DRAW);
    expect(await answer(g)).toEqual({ kind: 'chooseX', value: 2 });
    const roomy = scenario()
      .seat(0)
      .hand(DRAW)
      .battlefield('Island', { count: 4 })
      .library('Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains')
      .seat(1)
      .build();
    roomy.act(0).cast(DRAW);
    expect(await answer(roomy)).toEqual({ kind: 'chooseX', value: 3 });
  });

  test('"X +1/+1 counters on target creature": all of it, on its own creature', async () => {
    const g = scenario()
      .seat(0)
      .hand(PUMP)
      .battlefield('Forest', { count: 4 })
      .battlefield('Grizzly Bears')
      .seat(1)
      .battlefield('Serra Angel')
      .build();
    g.act(0).cast(PUMP);
    expect(await answer(g)).toEqual({ kind: 'chooseX', value: 3 });
    g.act(0).chooseX(3);
    const targets = await answer(g);
    g.choose(targets);
    g.act(0).payAuto();
    g.passAll();
    g.expect.counters('Grizzly Bears', { '+1/+1': 3 });
  });

  test('"enters with X counters": all of it', async () => {
    const g = scenario().seat(0).hand(HYDRA).battlefield('Forest', { count: 5 }).seat(1).build();
    g.act(0).cast(HYDRA);
    expect(await answer(g)).toEqual({ kind: 'chooseX', value: 4 });
  });

  test('"pay X life": no more than leaves it above 10 life', async () => {
    const cast = (life: number) => {
      const g = scenario().seat(0).life(life).hand(BLOOD).battlefield('Mountain').seat(1).build();
      g.act(0).cast(BLOOD);
      return g;
    };
    // 14 life: 3 to pay leaves 11. At 11 it may pay none, but the engine still asks (max is 10).
    expect(await answer(cast(14))).toEqual({ kind: 'chooseX', value: 3 });
    expect(await answer(cast(30))).toEqual({ kind: 'chooseX', value: 19 });
    expect(await answer(cast(11))).toEqual({ kind: 'chooseX', value: 0 });
  });
});

describe('which X spells it casts', () => {
  const chooses = async (g: ScenarioGame): Promise<Action> => {
    const view = g.view(0);
    if (view.pending === null) throw new Error('no decision');
    return new CasualAgent({ seed: 1 }).decide(view, view.pending, CTX);
  };

  test('an instant with an {X} only when it has mana to spend on X', async () => {
    const without = scenario().seat(0).hand(BURN).battlefield('Mountain').seat(1).build();
    expect(await chooses(without)).toEqual({ kind: 'pass' });
    const withMana = scenario()
      .seat(0)
      .hand(BURN)
      .battlefield('Mountain', { count: 2 })
      .seat(1)
      .build();
    expect(await chooses(withMana)).toMatchObject({ kind: 'castSpell' });
  });

  test('never for free: X is 0 then (CR 107.3b), the paid option is the one it casts', async () => {
    const g = scenario().seat(0).hand(FREE).battlefield('Mountain', { count: 3 }).seat(1).build();
    const action = await chooses(g);
    expect(action).toMatchObject({ kind: 'castSpell' });
    expect(action).not.toHaveProperty('alternative');
    const broke = scenario().seat(0).hand(FREE).seat(1).build();
    broke.expect.legal(0, { cast: FREE, alternative: 'free' });
    expect(await chooses(broke)).toEqual({ kind: 'pass' });
  });

  test('a permanent with X is cast whatever X can be', async () => {
    const g = scenario().seat(0).hand(HYDRA).battlefield('Forest').seat(1).build();
    expect(await chooses(g)).toMatchObject({ kind: 'castSpell' });
  });
});

// Issue 131: a 0/0 creature that enters with X +1/+1 counters is dead on arrival at X = 0 (CR 704.5f), and the
// agent cast one that way. It is cast only when X can be at least 1, and then with the mana it has.
describe('a creature that X sizes (issue 131)', () => {
  const decide = async (agent: CasualAgent | GreedyAgent | HeuristicAgent, g: ScenarioGame) => {
    const view = g.view(0);
    if (view.pending === null) throw new Error('no decision');
    return agent.decide(view, view.pending, CTX);
  };
  const agents = {
    casual: () => new CasualAgent({ seed: 1 }),
    greedy: () => new GreedyAgent({ seed: 1 }),
    heuristic: () => new HeuristicAgent({ seed: 1 }),
  };

  for (const [name, make] of Object.entries(agents)) {
    test(`${name}: with only the mana for X = 0 it does not cast it`, async () => {
      const g = scenario().seat(0).hand(ZERO).battlefield('Forest').seat(1).build();
      // The engine does offer the cast, with X = 0 as the only value.
      g.expect.legal(0, { cast: ZERO });
      expect(await decide(make(), g)).toEqual({ kind: 'pass' });
    });

    test(`${name}: with mana for X above 0 it casts it, and never for X = 0`, async () => {
      const g = scenario().seat(0).hand(ZERO).battlefield('Forest', { count: 2 }).seat(1).build();
      expect(await decide(make(), g)).toMatchObject({ kind: 'castSpell' });
    });
  }

  test('it spends the mana it has on X, and the creature survives', async () => {
    const g = scenario().seat(0).hand(ZERO).battlefield('Forest', { count: 4 }).seat(1).build();
    g.act(0).cast(ZERO);
    g.expect.pending('chooseX', 0);
    expect(await answer(g)).toEqual({ kind: 'chooseX', value: 3 });
    g.act(0).chooseX(3);
    g.act(0).payAuto();
    g.passAll();
    g.expect.zone(ZERO, 'battlefield');
  });

  test('the X answer is never below what keeps the creature alive', async () => {
    // Life paid for X would otherwise bring the answer below that; here the pending decision itself.
    const g = scenario().seat(0).hand(ZERO).battlefield('Forest', { count: 2 }).seat(1).build();
    g.act(0).cast(ZERO);
    const action = await answer(g);
    expect(action).toEqual({ kind: 'chooseX', value: 1 });
  });

  test('a creature with a body that survives X = 0 is still cast', async () => {
    const g = scenario().seat(0).hand(HYDRA).battlefield('Forest').seat(1).build();
    expect(await decide(new CasualAgent({ seed: 1 }), g)).toMatchObject({ kind: 'castSpell' });
  });
});
