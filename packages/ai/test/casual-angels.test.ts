// CasualAgent and the decisions of the Angels slice (D-149), on real engine states built with the scenario DSL: the alternative cost that
// taps creatures (chosen when the ordinary cast cannot be paid), blocking under a tax (only as many blockers as can be paid for), proliferate
// (own good counters and the opponent's bad ones, never its own poison) and what an Aura that enters by an effect enchants (the opponent's
// best creature for a hostile Aura, its own for any other). Every answer is one the engine lists.
import type { Action } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { chooseProliferate } from '../src/casual-counters';
import { CasualAgent, RandomLegalAgent } from '../src/index';
import { CTX } from './helpers';

/**
 * The answer of an agent to the decision pending. It is one the engine lists, except where `listed` is false: a decision that takes any subset
 * of its candidates (proliferate) lists only none, all and each one, and the engine takes any other subset, which `g.choose` then shows.
 */
async function answer(
  g: ScenarioGame,
  agent: 'casual' | 'random' = 'casual',
  listed = true,
): Promise<Action> {
  const decision = g.state.pending;
  if (decision === null) throw new Error('nothing is pending');
  const view = g.view(decision.seat);
  if (view.pending === null) throw new Error('the seat does not see its decision');
  const action = await (agent === 'casual'
    ? new CasualAgent({ seed: 1 })
    : new RandomLegalAgent({ seed: 1 })
  ).decide(view, view.pending, CTX);
  // The agent only ever sends what the engine lists.
  if (listed)
    expect(JSON.stringify(g.legalActions(decision.seat))).toContain(JSON.stringify(action));
  return action;
}

const BLADE = 'SYNTHETIC Sky Blade Angel';
const TITHE = 'SYNTHETIC Tithe Angel';
const GROWTH = 'SYNTHETIC Spreading Growth';
const RISE = 'SYNTHETIC Rise Again';
const MIGHTY = 'SYNTHETIC Mighty Aura';
const CURSE = 'SYNTHETIC Curse Aura';
const HAWK = "Healer's Hawk";
const BEARS = 'Grizzly Bears';
const SPIDER = 'Giant Spider';
const LIBRARY = Array.from({ length: 12 }, () => 'Plains');

describe('the alternative cost that taps creatures', () => {
  test('cast for it when the ordinary cast cannot be paid', async () => {
    const g = scenario()
      .seat(0)
      .hand(BLADE)
      .battlefield('Plains')
      .battlefield(HAWK, { count: 4 })
      .seat(1)
      .build();
    expect(await answer(g)).toEqual({
      kind: 'castSpell',
      object: g.id(BLADE),
      alternative: 'tapPermanents',
    });
  });

  test('the ordinary cast when it can be paid', async () => {
    const g = scenario()
      .seat(0)
      .hand(BLADE)
      .battlefield('Plains', { count: 7 })
      .battlefield(HAWK, { count: 4 })
      .seat(1)
      .build();
    expect(await answer(g)).toEqual({ kind: 'castSpell', object: g.id(BLADE) });
  });

  test('with five fliers it taps four of them and answers the question with exactly four', async () => {
    const g = scenario()
      .seat(0)
      .hand(BLADE)
      .battlefield('Plains')
      .battlefield(HAWK, { count: 5 })
      .seat(1)
      .build();
    g.act(0).cast(BLADE, { alternative: 'tapPermanents', pay: true });
    const d = g.state.pending;
    if (d?.kind !== 'choosePermanent') throw new Error(`expected choosePermanent, got ${d?.kind}`);
    const action = await answer(g);
    expect(action.kind).toBe('choosePermanents');
    if (action.kind === 'choosePermanents') expect(action.objects).toHaveLength(4);
    g.choose(action);
    g.expect.stack([BLADE]);
  });
});

describe('blocking under a tax', () => {
  const blocked = () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(TITHE)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(SPIDER, { count: 3 })
      .battlefield('Plains')
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack([TITHE]);
    g.advanceTo('declareBlockers');
    return g;
  };

  test('the casual agent blocks with no more creatures than it can pay for', async () => {
    const g = blocked();
    const d = g.state.pending;
    if (d?.kind !== 'declareBlockers') throw new Error(`expected declareBlockers, got ${d?.kind}`);
    expect(d.blockCost?.affordable).toBe(1);
    const action = await answer(g);
    expect(action.kind).toBe('declareBlockers');
    if (action.kind === 'declareBlockers') expect(action.blocks.length).toBeLessThanOrEqual(1);
  });

  test('the random agent never declares more blockers than it can pay for', async () => {
    for (let seed = 1; seed <= 12; seed += 1) {
      const g = blocked();
      const d = g.state.pending;
      if (d?.kind !== 'declareBlockers') throw new Error('expected declareBlockers');
      const view = g.view(1);
      if (view.pending === null) throw new Error('no decision');
      const action = await new RandomLegalAgent({ seed }).decide(view, view.pending, CTX);
      expect(action.kind).toBe('declareBlockers');
      if (action.kind === 'declareBlockers') expect(action.blocks.length).toBeLessThanOrEqual(1);
      expect(JSON.stringify(g.legalActions(1))).toContain(JSON.stringify(action));
    }
  });
});

describe('proliferate', () => {
  const cast = () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .hand(GROWTH)
      .battlefield('Forest')
      .battlefield(BEARS, { counters: { '+1/+1': 1 } })
      .battlefield('Serra Angel', { counters: { '-1/-1': 1 } })
      .seat(1)
      .library(...LIBRARY)
      .battlefield(SPIDER, { counters: { '-1/-1': 1 } })
      .battlefield('Typhoid Rats', { counters: { '+1/+1': 1 } })
      .build();
    g.act(0).cast(GROWTH, { pay: true });
    g.passAll();
    return g;
  };

  test('its own permanents with good counters and the opponent’s with bad ones, no others', async () => {
    const g = cast();
    const d = g.state.pending;
    if (d?.kind !== 'choosePermanent') throw new Error(`expected choosePermanent, got ${d?.kind}`);
    expect(d.purpose).toBe('proliferate');
    const action = await answer(g, 'casual', false);
    expect(action.kind).toBe('choosePermanents');
    if (action.kind !== 'choosePermanents') return;
    const names = action.objects
      .map((id) => g.state.objects[id])
      .map((o) => g.view(0).battlefield.find((x) => x.id === o?.id)?.name);
    expect(names.sort()).toEqual([BEARS, SPIDER].sort());
  });

  test('the answer is accepted by the engine and every chosen permanent gets a counter', async () => {
    const g = cast();
    const action = await answer(g, 'casual', false);
    g.choose(action);
    g.expect.counters({ name: BEARS, zone: 'battlefield', seat: 0, nth: 0 }, { '+1/+1': 2 });
    g.expect.counters({ name: SPIDER, zone: 'battlefield', seat: 1, nth: 0 }, { '-1/-1': 2 });
    g.expect.counters(
      { name: 'Serra Angel', zone: 'battlefield', seat: 0, nth: 0 },
      { '-1/-1': 1 },
    );
  });
});

describe('proliferate and players', () => {
  test('it names the opponents with poison counters and never itself', () => {
    const g = scenario().seat(0).seat(1).build();
    const view = g.view(0);
    const action = chooseProliferate(view, {
      id: 'd0',
      kind: 'choosePermanent',
      seat: 0,
      source: 'o0',
      purpose: 'proliferate',
      min: 0,
      max: 0,
      legal: [],
      players: [0, 1],
    });
    expect(action).toEqual({ kind: 'choosePermanents', objects: [], players: [1] });
  });
});

describe('an Aura that enters by an effect', () => {
  const raise = (aura: string) => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .hand(RISE)
      .graveyard(aura)
      .battlefield('Plains', { count: 4 })
      .battlefield(BEARS)
      .battlefield('Serra Angel')
      .seat(1)
      .library(...LIBRARY)
      .battlefield('Typhoid Rats')
      .battlefield('Giant Spider')
      .build();
    g.act(0).cast(RISE, { targets: [{ name: aura, zone: 'graveyard', seat: 0 }], pay: true });
    g.passAll();
    return g;
  };

  const hostOf = async (aura: string) => {
    const g = raise(aura);
    const d = g.state.pending;
    if (d?.kind !== 'choosePermanent') throw new Error(`expected choosePermanent, got ${d?.kind}`);
    expect(d.purpose).toBe('auraHost');
    const action = await answer(g);
    if (action.kind !== 'choosePermanents') throw new Error('expected choosePermanents');
    const [id] = action.objects;
    return g.view(0).battlefield.find((o) => o.id === id);
  };

  test('a benign Aura goes on its own best creature', async () => {
    const host = await hostOf(MIGHTY);
    expect(host?.name).toBe('Serra Angel');
  });

  test('a hostile Aura goes on the opponent’s creature with the most power', async () => {
    const host = await hostOf(CURSE);
    expect(host?.name).toBe('Giant Spider');
  });
});
