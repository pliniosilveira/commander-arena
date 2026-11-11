// CasualAgent and copies of spells (D-129), on real engine states built with the scenario DSL: a spell that copies a spell is
// cast only onto a spell of its own and aims at it, the question "choose new targets for the copy" is answered like the
// cast of the spell it copies (the opponent's things for a hostile spell), and a Storm spell is cast late in the turn,
// after the other spells worth casting. Every answer is one the engine lists as legal.
import {
  type Action,
  applyAction,
  getLegalActions,
  type PendingDecision,
} from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { CasualAgent, RandomLegalAgent } from '../src/index';
import { CTX } from './helpers';

const TWIN = 'SYNTHETIC Twin Spell'; // {U}{U}: copy target instant or sorcery spell; new targets
const EXACT = 'SYNTHETIC Exact Twin'; // {U}: copy target instant or sorcery spell; same targets
const BOLT = 'SYNTHETIC Copy Bolt'; // {R}: 2 damage to any target
const STORM = 'SYNTHETIC Storm Bolt'; // {R}: storm, 1 damage to any target
const STORM_DRAIN = 'SYNTHETIC Storm Drain'; // {B}: storm, each opponent loses 2 life
const REPLICATE = 'SYNTHETIC Replicate Bolt'; // {R}, replicate {R}: 1 damage to any target
const REPLICATE_X = 'SYNTHETIC Replicate X Burn'; // {X}{R}, replicate {R}: X damage to any target
const LIGHTNING = 'Lightning Bolt';
const SPIDER = 'Giant Spider';
const BEARS = 'Grizzly Bears';

const FILLER = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains'] as const;
type Builder = ReturnType<typeof scenario>;

async function answer(g: ScenarioGame, seat?: number): Promise<Action> {
  const decision = g.state.pending;
  if (decision === null) throw new Error('nothing is pending');
  const view = g.view(seat ?? decision.seat);
  if (view.pending === null) throw new Error('the seat does not see its decision');
  return new CasualAgent({ seed: 1 }).decide(view, view.pending, CTX);
}

function expectLegal(g: ScenarioGame, action: Action) {
  const d = g.state.pending as PendingDecision;
  expect(
    getLegalActions(g.state, d.seat).some((a) => JSON.stringify(a) === JSON.stringify(action)),
  ).toBe(true);
  expect(applyAction(g.state, d.seat, action).ok).toBe(true);
}

function game(configure: (b: Builder) => Builder): ScenarioGame {
  return configure(scenario().seat(0).life(20))
    .seat(0)
    .library(...FILLER)
    .seat(1)
    .life(20)
    .library(...FILLER)
    .build();
}

const resolveTop = (g: ScenarioGame): void => {
  g.pass();
  g.pass();
};

describe('a spell that copies a spell', () => {
  test('is cast onto a spell of its own, and aims at it', async () => {
    const g = game((b) =>
      b.seat(0).hand(BOLT, TWIN).battlefield('Mountain').battlefield('Island', { count: 2 }),
    );
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    const cast = await answer(g);
    expect(cast).toMatchObject({ kind: 'castSpell', object: g.id(TWIN) });
    expectLegal(g, cast);
    g.choose(cast);
    const aim = await answer(g);
    expect(aim).toEqual({
      kind: 'chooseTargets',
      targets: [{ kind: 'object', id: g.id({ name: BOLT, zone: 'stack' }), specId: 't1' }],
    });
    expectLegal(g, aim);
  });

  test("is not cast onto the opponent's spell: a copy without new targets would hurt the agent too", async () => {
    const g = game((b) =>
      b
        .seat(0)
        .hand(EXACT)
        .battlefield('Island', { count: 2 })
        .seat(1)
        .hand(LIGHTNING)
        .battlefield('Mountain'),
    );
    g.pass(0);
    g.act(1).cast(LIGHTNING, { targets: [{ player: 0 }], pay: true });
    g.pass(1);
    // Seat 0 may cast the copier on the opponent's burn (the engine lists it), but the agent passes.
    g.expect.legal(0, { cast: EXACT });
    expect(await answer(g)).toEqual({ kind: 'pass' });
  });

  test('is not cast when the spell on top is an ability', async () => {
    const g = game((b) =>
      b
        .seat(0)
        .hand(BOLT, EXACT)
        .battlefield('SYNTHETIC Prowess Adept')
        .battlefield('Mountain')
        .battlefield('Island'),
    );
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    // The prowess trigger of the bolt is on top, above the bolt: nothing to copy there, so the copier waits.
    expect(g.state.stack.length).toBe(2);
    expect(await answer(g)).toEqual({ kind: 'pass' });
  });
});

describe('the new targets of a copy', () => {
  test("a hostile copy goes on the opponent's creature, never on the agent's own", async () => {
    const g = game((b) =>
      b
        .seat(0)
        .hand(BOLT, TWIN)
        .battlefield('Mountain')
        .battlefield('Island', { count: 2 })
        .battlefield(BEARS)
        .seat(1)
        .battlefield(SPIDER),
    );
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.act(0).cast(TWIN, { targets: [{ name: BOLT, zone: 'stack' }], pay: true });
    resolveTop(g);
    g.expect.pending('targets', 0);
    const aim = await answer(g);
    expect(aim).toEqual({
      kind: 'chooseTargets',
      targets: [{ kind: 'object', id: g.id(SPIDER), specId: 't1' }],
    });
    expectLegal(g, aim);
  });

  test('RandomLegalAgent answers it legally too', async () => {
    const g = game((b) =>
      b.seat(0).hand(BOLT, TWIN).battlefield('Mountain').battlefield('Island', { count: 2 }),
    );
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.act(0).cast(TWIN, { targets: [{ name: BOLT, zone: 'stack' }], pay: true });
    resolveTop(g);
    const view = g.view(0);
    if (view.pending === null) throw new Error('no question');
    const action = await new RandomLegalAgent({ seed: 3 }).decide(view, view.pending, CTX);
    expectLegal(g, action);
  });
});

describe('Storm', () => {
  test('is cast after the other spells worth casting: the others first, the storm spell last', async () => {
    const g = game((b) => b.seat(0).hand(STORM, LIGHTNING).battlefield('Mountain', { count: 3 }));
    const first = await answer(g);
    expect(first).toMatchObject({ kind: 'castSpell', object: g.id(LIGHTNING) });
    g.choose(first);
    g.act(0).chooseTargets({ player: 1 });
    g.act(0).payAuto();
    resolveTop(g);
    const second = await answer(g);
    expect(second).toMatchObject({ kind: 'castSpell', object: g.id(STORM) });
    expectLegal(g, second);
  });

  test('is cast when it is all there is, even with no spell before it', async () => {
    const g = game((b) => b.seat(0).hand(STORM_DRAIN).battlefield('Swamp'));
    expect(await answer(g)).toMatchObject({ kind: 'castSpell', object: g.id(STORM_DRAIN) });
  });

  test('copies of its own spell are aimed at the opponent when it asks', async () => {
    const g = game((b) =>
      b
        .seat(0)
        .hand(STORM, LIGHTNING)
        .battlefield('Mountain', { count: 3 })
        .seat(1)
        .battlefield(SPIDER),
    );
    g.act(0).cast(LIGHTNING, { targets: [{ player: 1 }], pay: true });
    resolveTop(g);
    g.act(0).cast(STORM, { targets: [{ player: 1 }], pay: true });
    resolveTop(g);
    g.expect.pending('targets', 0);
    const aim = await answer(g);
    expectLegal(g, aim);
    // The opposing Spider is the thing to aim at; the agent's own face is never chosen.
    expect(aim).toMatchObject({ kind: 'chooseTargets' });
    expect(JSON.stringify(aim)).not.toContain('"seat":0');
  });
});

describe('Replicate', () => {
  test('pays the replicate cost as many times as it can: every copy is another spell', async () => {
    const g = game((b) => b.seat(0).hand(REPLICATE).battlefield('Mountain', { count: 4 }));
    g.act(0).cast(REPLICATE);
    g.expect.pending('chooseX', 0);
    const count = await answer(g);
    expect(count).toEqual({ kind: 'chooseX', value: 3 });
    expectLegal(g, count);
  });

  test('an {X} spell keeps half of what it could pay for the X, which is asked after the count', async () => {
    const g = game((b) => b.seat(0).hand(REPLICATE_X).battlefield('Mountain', { count: 6 }));
    g.act(0).cast(REPLICATE_X);
    const count = await answer(g);
    // 6 lands: {R} for the spell, so up to 5 replications; it takes 3 and leaves 2 for X.
    expect(count).toEqual({ kind: 'chooseX', value: 3 });
    g.choose(count);
    const x = await answer(g);
    expect(x).toEqual({ kind: 'chooseX', value: 2 });
    expectLegal(g, x);
  });

  test('aims the copies at the opponent', async () => {
    const g = game((b) =>
      b
        .seat(0)
        .hand(REPLICATE)
        .battlefield('Mountain', { count: 3 })
        .seat(1)
        .battlefield(SPIDER)
        .battlefield(BEARS),
    );
    g.act(0).cast(REPLICATE, { replicas: 2, targets: [{ player: 1 }], pay: true });
    resolveTop(g);
    g.expect.pending('targets', 0);
    const aim = await answer(g);
    expectLegal(g, aim);
    expect(JSON.stringify(aim)).not.toContain('"seat":0');
  });
});
