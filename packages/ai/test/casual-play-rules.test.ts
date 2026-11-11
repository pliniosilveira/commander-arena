// CasualAgent and the play rules of D-125, on real engine states built with the scenario DSL.
// The heuristics (`src/casual-play-rules.ts`): an extra land drop is used the moment the engine lists a land
// again; a permanent that grants one is cast before other spells while a land waits in the hand. Every action
// is one the engine lists.
import { type Action, applyAction } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { CasualAgent, RandomLegalAgent } from '../src/index';
import { CTX } from './helpers';

async function answer(g: ScenarioGame): Promise<Action> {
  const decision = g.state.pending;
  if (decision === null) throw new Error('nothing is pending');
  const view = g.view(decision.seat);
  if (view.pending === null) throw new Error('the seat does not see its decision');
  const action = await new CasualAgent({ seed: 1 }).decide(view, view.pending, CTX);
  // The agent only ever sends what the engine lists.
  expect(JSON.stringify(g.legalActions(decision.seat))).toContain(JSON.stringify(action));
  return action;
}

const PATH = 'SYNTHETIC Wandering Path';

describe('extra land drops', () => {
  test('it plays the second land when the first is down and a source allows it', async () => {
    const g = scenario()
      .seat(0)
      .hand('Forest', { count: 2 })
      .battlefield(PATH)
      .seat(1)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).playLand('Forest[0]');
    expect(await answer(g)).toEqual({ kind: 'playLand', object: g.id('Forest[0]') });
  });

  test('without the source it does not play a second land (the engine does not list one)', async () => {
    const g = scenario().seat(0).hand('Forest', { count: 2 }).seat(1).build();
    g.act(0).playLand('Forest[0]');
    expect(await answer(g)).toEqual({ kind: 'pass' });
  });

  test('a source is cast before a better spell while a land waits in the hand', async () => {
    const g = scenario()
      .seat(0)
      .hand(PATH, 'Giant Spider', 'Forest', 'Forest')
      .battlefield('Forest', { count: 5 })
      .seat(1)
      .build();
    g.act(0).playLand('Forest[0]');
    expect(await answer(g)).toEqual({ kind: 'castSpell', object: g.id(PATH) });
  });

  test('with no land in the hand the source is just another spell: the bigger one goes first', async () => {
    const g = scenario()
      .seat(0)
      .hand(PATH, 'Giant Spider')
      .battlefield('Forest', { count: 6 })
      .seat(1)
      .build();
    expect(await answer(g)).toEqual({ kind: 'castSpell', object: g.id('Giant Spider') });
  });
});

describe('the top card of the library (CR 401.5)', () => {
  const LENS = 'SYNTHETIC Seer Lens';
  const BEAST = 'SYNTHETIC Landcycler Beast';

  /** Seat 0 has only the typecycler in hand, one land out, and `top` as the top card of its library. */
  function typecycleGame(top: string, withLens: boolean) {
    const b = scenario().seat(0).hand(BEAST).battlefield('Forest');
    if (withLens) b.battlefield(LENS);
    return b.library(top).library('Island').seat(1).build();
  }

  test('without a look at the top card it typecycles for a land (the baseline)', async () => {
    const g = typecycleGame('Forest', false);
    expect(await answer(g)).toMatchObject({ kind: 'activate', object: g.id(BEAST) });
  });

  test('it does not typecycle for a land it knows it will draw', async () => {
    const g = typecycleGame('Forest', true);
    expect(g.view(0).seats[0]?.libraryTop?.name).toBe('Forest');
    expect(await answer(g)).toEqual({ kind: 'pass' });
  });

  test('a known spell on top does not stop it: it still typecycles', async () => {
    const g = typecycleGame('Grizzly Bears', true);
    expect(await answer(g)).toMatchObject({ kind: 'activate', object: g.id(BEAST) });
  });

  test('the agent never reads the opponent top card: the view of seat 1 has none', async () => {
    const g = typecycleGame('Forest', true);
    expect(g.view(1).seats[0]?.libraryTop).toBeUndefined();
  });
});

describe('the cost of attacking (CR 508.1h)', () => {
  const GATE = 'SYNTHETIC Tax Gate';
  const WALKER = 'SYNTHETIC Vanilla Planeswalker';
  const BEARS = 'Grizzly Bears';

  /** Seat 0 at its declare attackers decision with the given creatures and lands; seat 1 has the tax and little else. */
  function atAttackers(
    bears: number,
    lands: number,
    extra: string[] = [],
    life = 40,
    walkerLoyalty?: number,
  ) {
    const b = scenario()
      .seat(0)
      .library('Island', { count: 4 })
      .battlefield(
        ...Array.from({ length: bears }, () => BEARS),
        ...Array.from({ length: lands }, () => 'Mountain'),
      );
    const g = b
      .seat(1)
      .life(life)
      .library('Island', { count: 4 })
      .battlefield(GATE, ...extra.filter((name) => name !== WALKER));
    if (extra.includes(WALKER)) {
      g.battlefield(
        WALKER,
        walkerLoyalty === undefined ? {} : { counters: { loyalty: walkerLoyalty } },
      );
    }
    const game = g.at('precombatMain', { active: 0 }).build();
    game.advanceTo('declareAttackers', { attack: false });
    return game;
  }

  async function declared(g: ScenarioGame) {
    // The engine accepts any legal subset; the list holds only some of them, so it is not consulted here.
    const view = g.view(0);
    if (view.pending === null) throw new Error('no decision');
    const a = await new CasualAgent({ seed: 1 }).decide(view, view.pending, CTX);
    if (a.kind !== 'declareAttackers') throw new Error(`expected a declaration, got ${a.kind}`);
    expect(applyAction(g.state, 0, a).ok, JSON.stringify(a)).toBe(true);
    return a;
  }

  test('it attacks with as many creatures as it can pay for', async () => {
    const g = atAttackers(3, 4);
    expect((await declared(g)).attacks).toHaveLength(2);
  });

  test('it attacks with all when it can pay for all, and with none when it cannot pay for one', async () => {
    expect((await declared(atAttackers(3, 6))).attacks).toHaveLength(3);
    expect((await declared(atAttackers(3, 1))).attacks).toEqual([]);
  });

  test('it does not pay more mana than the creature deals damage', async () => {
    const g = scenario()
      .seat(0)
      .library('Island', { count: 4 })
      .battlefield('Llanowar Elves', 'Mountain', 'Mountain', 'Mountain')
      .seat(1)
      .library('Island', { count: 4 })
      .battlefield(GATE)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    expect((await declared(g)).attacks).toEqual([]);
  });

  test('a lethal attack is paid for whatever the creatures deal', async () => {
    const g = scenario()
      .seat(0)
      .library('Island', { count: 4 })
      .battlefield('Llanowar Elves', 'Mountain', 'Mountain')
      .seat(1)
      .life(1)
      .library('Island', { count: 4 })
      .battlefield(GATE)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    expect((await declared(g)).attacks).toHaveLength(1);
  });

  test('a creature it cannot pay for goes at a planeswalker, which costs nothing', async () => {
    // A planeswalker the creatures cannot kill (loyalty 9 against 4 power): the one it can pay for attacks the player, the other goes at the planeswalker.
    const g = atAttackers(2, 2, [WALKER], 40, 9);
    const a = await declared(g);
    expect(a.attacks).toHaveLength(2);
    const targets = a.attacks.map((x) => x.target.kind).sort();
    expect(targets).toEqual(['permanent', 'player']);
  });

  test('a planeswalker the attackers can kill is attacked by enough of them, and costs nothing (D-203)', async () => {
    // 4 power against 4 loyalty: both creatures go at the planeswalker.
    const g = atAttackers(2, 2, [WALKER]);
    const a = await declared(g);
    expect(a.attacks.map((x) => x.target.kind)).toEqual(['permanent', 'permanent']);
  });

  test('the declaration is accepted by the engine and the payment is paid', async () => {
    const g = atAttackers(3, 4);
    const a = await declared(g);
    g.act(0).choose(a);
    g.expect.pending('payMana', 0);
    expect(await answer(g)).toEqual({ kind: 'payAuto' });
    g.act(0).payAuto();
    g.expect.combat({ attackers: a.attacks.map((x) => x.attacker) });
  });

  test('the random agent never declares more than can be paid for, over many seeds', async () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      const g = atAttackers(4, 5, seed % 2 === 0 ? [WALKER] : []);
      const view = g.view(0);
      if (view.pending === null) throw new Error('no decision');
      const action = await new RandomLegalAgent({ seed }).decide(view, view.pending, CTX);
      const r = applyAction(g.state, 0, action);
      expect(r.ok, `seed ${seed}: ${JSON.stringify(action)}`).toBe(true);
    }
  });
});

describe('the optional untap (CR 502.3)', () => {
  test('it untaps everything it may choose not to untap', async () => {
    const g = scenario()
      .seat(0)
      .library('Island', { count: 6 })
      .battlefield('SYNTHETIC Drowsy Giant', { tapped: true })
      .battlefield('SYNTHETIC Drowsy Rod', { tapped: true })
      .seat(1)
      .library('Island', { count: 6 })
      .at('end', { active: 1, turn: 2 })
      .build();
    g.advanceTo('untap', { turn: 'next' });
    const action = await answer(g);
    expect(action).toEqual({
      kind: 'choosePermanents',
      objects: [g.id('SYNTHETIC Drowsy Giant'), g.id('SYNTHETIC Drowsy Rod')],
    });
    g.act(0).choose(action);
    g.expect.tapped('SYNTHETIC Drowsy Giant', false);
    g.expect.tapped('SYNTHETIC Drowsy Rod', false);
  });
});
