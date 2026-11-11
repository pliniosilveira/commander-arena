// CasualAgent and the named alternative costs (D-121, D-124), on real engine states built with the scenario DSL.
// The heuristics (`src/casual-alt-costs.ts`): Overload only for a text that names the opponent's objects
// and at least three of them (one when the ordinary cast has no target); Evoke only when the ordinary cast
// cannot be paid and the card has an enters ability worth the mana; Dash when the ordinary cast cannot be
// paid, or in the first main phase when nothing untapped can block the creature. Every cast it makes is one
// the engine lists (the agent never sends an option the engine did not offer).
import type { Action } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { CasualAgent } from '../src/index';
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

const BOLT = 'SYNTHETIC Overload Bolt';
const PING = 'SYNTHETIC Overload Ping';
const DRIFTER = 'SYNTHETIC Evoke Drifter';
const REAPER = 'SYNTHETIC Evoke Reaper';
const RAIDER = 'SYNTHETIC Dash Raider';
const SPECTACLE = 'SYNTHETIC Spectacle Raider';
const WRAITH = 'SYNTHETIC Escape Wraith';
const PULSE = 'SYNTHETIC Escape Pulse';
const GNOLL = 'SYNTHETIC Unearth Gnoll';

describe('Overload', () => {
  const board = (opposing: number) => {
    const b = scenario().seat(0).hand(BOLT).battlefield('Mountain', { count: 6 }).seat(1);
    for (let i = 0; i < opposing; i += 1) b.battlefield('Grizzly Bears');
    return b.build();
  };

  test('three creatures to hit: overloaded', async () => {
    const g = board(3);
    expect(await answer(g)).toEqual({
      kind: 'castSpell',
      object: g.id(BOLT),
      alternative: 'overload',
    });
  });

  test('one or two creatures: the ordinary cast', async () => {
    for (const n of [1, 2]) {
      const g = board(n);
      expect(await answer(g)).toEqual({ kind: 'castSpell', object: g.id(BOLT) });
    }
  });

  test('no creature at all: nothing to cast', async () => {
    expect(await answer(board(0))).toEqual({ kind: 'pass' });
  });

  test('a lone creature and no mana for the ordinary cast is still not worth the overload', async () => {
    // Four Mountains pay the ordinary {1}{R} but not the overload {3}{R}{R}.
    const g = scenario()
      .seat(0)
      .hand(BOLT)
      .battlefield('Mountain', { count: 4 })
      .seat(1)
      .battlefield('Grizzly Bears')
      .battlefield('Giant Spider')
      .battlefield('Llanowar Elves')
      .build();
    expect(await answer(g)).toEqual({ kind: 'castSpell', object: g.id(BOLT) });
  });

  test('a text that also reaches its own creatures is never overloaded', async () => {
    const g = scenario()
      .seat(0)
      .hand(PING)
      .battlefield('Mountain', { count: 6 })
      .battlefield('Grizzly Bears')
      .seat(1)
      .battlefield('Grizzly Bears')
      .battlefield('Giant Spider')
      .battlefield('Llanowar Elves')
      .battlefield('Serra Angel')
      .build();
    expect(await answer(g)).toEqual({ kind: 'castSpell', object: g.id(PING) });
  });
});

describe('Evoke', () => {
  test('with the ordinary cost payable the creature is cast normally', async () => {
    const g = scenario().seat(0).hand(DRIFTER).battlefield('Island', { count: 4 }).seat(1).build();
    expect(await answer(g)).toEqual({ kind: 'castSpell', object: g.id(DRIFTER) });
  });

  test('with only the evoke cost payable and an enters ability worth it: evoked', async () => {
    const g = scenario().seat(0).hand(DRIFTER).battlefield('Island', { count: 2 }).seat(1).build();
    expect(await answer(g)).toEqual({
      kind: 'castSpell',
      object: g.id(DRIFTER),
      alternative: 'evoke',
    });
  });

  test('an enters ability that needs a creature to hit is not evoked without one', async () => {
    const without = scenario()
      .seat(0)
      .hand(REAPER)
      .battlefield('Swamp', { count: 2 })
      .seat(1)
      .build();
    expect(await answer(without)).toEqual({ kind: 'pass' });
    const withTarget = scenario()
      .seat(0)
      .hand(REAPER)
      .battlefield('Swamp', { count: 2 })
      .seat(1)
      .battlefield('Grizzly Bears')
      .build();
    expect(await answer(withTarget)).toEqual({
      kind: 'castSpell',
      object: withTarget.id(REAPER),
      alternative: 'evoke',
    });
  });
});

describe('Dash', () => {
  test('with only the dash cost payable: dashed', async () => {
    const g = scenario().seat(0).hand(RAIDER).battlefield('Mountain', { count: 2 }).seat(1).build();
    expect(await answer(g)).toEqual({
      kind: 'castSpell',
      object: g.id(RAIDER),
      alternative: 'dash',
    });
  });

  test('before combat with nothing untapped to block it: dashed even with the full cost', async () => {
    const g = scenario().seat(0).hand(RAIDER).battlefield('Mountain', { count: 4 }).seat(1).build();
    expect(await answer(g)).toEqual({
      kind: 'castSpell',
      object: g.id(RAIDER),
      alternative: 'dash',
    });
  });

  test('an untapped blocker on the other side: the ordinary cast', async () => {
    const g = scenario()
      .seat(0)
      .hand(RAIDER)
      .battlefield('Mountain', { count: 4 })
      .seat(1)
      .battlefield('Grizzly Bears')
      .build();
    expect(await answer(g)).toEqual({ kind: 'castSpell', object: g.id(RAIDER) });
  });

  test('after combat the ordinary cast, the creature would only go back to the hand', async () => {
    const g = scenario()
      .seat(0)
      .hand(RAIDER)
      .battlefield('Mountain', { count: 4 })
      .seat(1)
      .at('postcombatMain', { active: 0 })
      .build();
    expect(await answer(g)).toEqual({ kind: 'castSpell', object: g.id(RAIDER) });
  });
});

describe('Spectacle', () => {
  const afterBolt = (mountains: number) => {
    const g = scenario()
      .seat(0)
      .hand(SPECTACLE, 'Lightning Bolt')
      .battlefield('Mountain', { count: mountains })
      .seat(1)
      .build();
    g.act(0).cast('Lightning Bolt', { targets: [{ player: 1 }], pay: true });
    g.passAll();
    return g;
  };

  test('an opponent lost life this turn: the cheaper spectacle cost is used, also when the full cost is payable', async () => {
    for (const mountains of [3, 8]) {
      const g = afterBolt(mountains);
      expect(await answer(g)).toEqual({
        kind: 'castSpell',
        object: g.id(SPECTACLE),
        alternative: 'spectacle',
      });
    }
  });

  test('no opponent lost life: the ordinary cast, or nothing when it cannot be paid', async () => {
    const full = scenario()
      .seat(0)
      .hand(SPECTACLE)
      .battlefield('Mountain', { count: 4 })
      .seat(1)
      .build();
    expect(await answer(full)).toEqual({ kind: 'castSpell', object: full.id(SPECTACLE) });
    const short = scenario()
      .seat(0)
      .hand(SPECTACLE)
      .battlefield('Mountain', { count: 2 })
      .seat(1)
      .build();
    expect(await answer(short)).toEqual({ kind: 'pass' });
  });
});

describe('Escape', () => {
  const board = (extra: readonly string[], mana = 3) =>
    scenario()
      .seat(0)
      .graveyard(WRAITH, ...extra)
      .battlefield('Swamp', { count: mana })
      .seat(1)
      .build();

  test('with the cost and enough other cards in the graveyard it escapes', async () => {
    const g = board(['Forest', 'Grizzly Bears', 'Island']);
    expect(await answer(g)).toEqual({
      kind: 'castSpell',
      object: g.id(WRAITH),
      alternative: 'escape',
    });
  });

  test('too few other cards, or too little mana: nothing', async () => {
    expect(await answer(board(['Forest', 'Grizzly Bears']))).toEqual({ kind: 'pass' });
    expect(await answer(board(['Forest', 'Grizzly Bears', 'Island'], 1))).toEqual({ kind: 'pass' });
  });

  test('a hand spell is cast before an escape (the graveyard never takes the mana a hand cast needs)', async () => {
    const g = scenario()
      .seat(0)
      .hand('Grizzly Bears')
      .graveyard(WRAITH, 'Forest', 'Island', 'Plains')
      .battlefield('Swamp', { count: 2 })
      .battlefield('Forest', { count: 2 })
      .seat(1)
      .build();
    expect(await answer(g)).toEqual({ kind: 'castSpell', object: g.id('Grizzly Bears') });
  });

  test('the cards it exiles are the ones it wants least: lands, then spells, creatures last', async () => {
    const g = scenario()
      .seat(0)
      .graveyard(WRAITH, 'Giant Spider', 'Forest', 'Lightning Bolt', 'Serra Angel', 'Island')
      .battlefield('Swamp', { count: 2 })
      .seat(1)
      .build();
    g.act(0).cast(WRAITH, { alternative: 'escape', pay: true });
    const action = await answer(g);
    expect(action.kind).toBe('chooseCards');
    if (action.kind === 'chooseCards') {
      expect([...action.objects].sort()).toEqual(
        [g.id('Forest'), g.id('Island'), g.id('Lightning Bolt')].sort(),
      );
    }
  });

  test('a card that can come back later is kept: an escape card is not exiled while other cards will do', async () => {
    const g = scenario()
      .seat(0)
      .graveyard(WRAITH, PULSE, 'Giant Spider', 'Forest', 'Island', 'Serra Angel')
      .battlefield('Swamp', { count: 4 })
      .seat(1)
      .build();
    g.act(0).cast(WRAITH, { alternative: 'escape', pay: true });
    const action = await answer(g);
    expect(action.kind).toBe('chooseCards');
    if (action.kind === 'chooseCards') {
      expect(action.objects).toContain(g.id('Forest'));
      expect(action.objects).toContain(g.id('Island'));
      expect(action.objects).not.toContain(g.id(PULSE));
    }
  });
});

describe('Unearth', () => {
  const unearthed = (g: ScenarioGame) =>
    expect.objectContaining({ kind: 'activate', object: g.id(GNOLL) });

  test('before combat with nothing to block it: unearthed', async () => {
    const g = scenario()
      .seat(0)
      .graveyard(GNOLL)
      .battlefield('Mountain', { count: 2 })
      .seat(1)
      .build();
    expect(await answer(g)).toEqual(unearthed(g));
  });

  test('a blocker that would kill it: not worth the mana; one it kills: worth it', async () => {
    const wall = scenario()
      .seat(0)
      .graveyard(GNOLL)
      .battlefield('Mountain', { count: 2 })
      .seat(1)
      .battlefield('Grizzly Bears')
      .build();
    expect(await answer(wall)).toEqual({ kind: 'pass' });
    const weak = scenario()
      .seat(0)
      .graveyard(GNOLL)
      .battlefield('Mountain', { count: 2 })
      .seat(1)
      .battlefield('Llanowar Elves')
      .build();
    // The Elves have 1 power, the Gnoll 1 toughness: they would kill it.
    expect(await answer(weak)).toEqual({ kind: 'pass' });
  });

  test('lethal damage is worth it even into a blocker', async () => {
    const g = scenario()
      .seat(0)
      .graveyard(GNOLL)
      .battlefield('Mountain', { count: 2 })
      .seat(1)
      .life(3)
      .battlefield('Grizzly Bears')
      .build();
    expect(await answer(g)).toEqual(unearthed(g));
  });

  test('not after combat, and not without the mana', async () => {
    const late = scenario()
      .seat(0)
      .graveyard(GNOLL)
      .battlefield('Mountain', { count: 2 })
      .seat(1)
      .at('postcombatMain', { active: 0 })
      .build();
    expect(await answer(late)).toEqual({ kind: 'pass' });
    const broke = scenario().seat(0).graveyard(GNOLL).seat(1).build();
    expect(await answer(broke)).toEqual({ kind: 'pass' });
  });
});
