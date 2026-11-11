// What the costs of an activation set off, and that an activation replays exactly.
// Pins: CR 603.2 (abilities trigger when the event happens, here while a cost is paid), CR 603.3
// (they wait and go on the stack the next time a player would get priority, above the ability
// being activated, CR 602.2a), CR 733 (cancelling forgets them), CR 701.21 (sacrifice).
// Cards are SYNTHETIC or defined here.
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import type { Action, ObjectId } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';

const gain1 = { kind: 'gainLife', player: { kind: 'you' }, amount: 1 } as const;
const draw = { kind: 'draw', player: { kind: 'you' }, count: 1 } as const;

/** "Whenever this becomes tapped, you gain 1 life. {T}, Sacrifice a creature: Draw a card." */
const RIG = singleFace({
  name: 'SYNTHETIC Test Tap Rig',
  manaCost: ['1'],
  types: ['creature'],
  colors: [],
  colorIdentity: [],
  power: 1,
  toughness: 1,
  oracleText:
    'Whenever this becomes tapped, you gain 1 life. {T}, Sacrifice a creature: Draw a card.',
  abilities: [
    {
      kind: 'triggered',
      trigger: { kind: 'becomesTapped', what: { kind: 'this' } },
      effect: gain1,
    },
    {
      kind: 'activated',
      cost: [{ kind: 'tap' }, { kind: 'sacrifice', what: { types: ['creature'], other: true } }],
      effect: draw,
    },
  ],
});

describe('triggers set off by the cost of an activation', () => {
  test('tapping as a cost triggers "becomes tapped": its trigger goes above the ability', () => {
    const g = scenario()
      .define(RIG)
      .seat(0)
      .battlefield(RIG.name, 'Grizzly Bears')
      .library('Forest', 'Forest')
      .seat(1)
      .build();
    // One other creature: the sacrifice is automatic, so the activation finishes at once.
    g.act(0).activate(RIG.name);
    g.expect.stack([`${RIG.name} (ability)`, `${RIG.name} (ability)`]);
    const [top, below] = g.state.stack.slice().reverse();
    expect(g.state.objects[top as ObjectId]?.stack?.ability?.kind).toBe('triggered');
    expect(g.state.objects[below as ObjectId]?.stack?.ability?.kind).toBe('activated');
    g.passAll();
    g.expect.life(0, 41);
    g.expect.handSize(0, 1);
  });

  test('a trigger noticed before a decision is not lost, and a cancel forgets it', () => {
    const build = () =>
      scenario()
        .define(RIG)
        .seat(0)
        .battlefield(RIG.name, 'Grizzly Bears', 'SYNTHETIC Pump Bear')
        .library('Forest', 'Forest')
        .seat(1)
        .build();
    const g = build();
    const before = g.positionHash();
    g.act(0).activate(RIG.name);
    g.expect.pending('choosePermanent', 0);
    expect(g.state.pendingTriggers).toHaveLength(1); // noticed while the cost was paid
    g.act(0).choosePermanents('Grizzly Bears');
    g.expect.stack([`${RIG.name} (ability)`, `${RIG.name} (ability)`]);
    expect(g.state.pendingTriggers).toEqual([]);
    g.passAll();
    g.expect.life(0, 41);

    const c = build();
    c.act(0).activate(RIG.name);
    c.act(0).cancel();
    c.expect.position(before);
    expect(c.state.pendingTriggers).toEqual([]);
  });
});

describe('determinism: the same actions give the same game', () => {
  function play(): ScenarioGame {
    const g = scenario()
      .seed(7)
      .seat(0)
      .hand('SYNTHETIC Cycling Bear')
      .battlefield(
        'SYNTHETIC Pump Bear',
        'SYNTHETIC Altar',
        'SYNTHETIC Pinger',
        'Grizzly Bears',
        'Forest',
        'Forest',
        'Forest',
        'Forest',
      )
      .library('Forest', 'Island', 'Plains', 'Swamp', 'Mountain')
      .seat(1)
      .battlefield('Grizzly Bears')
      .library('Forest', 'Island', 'Plains')
      .build();
    g.act(0).activate('SYNTHETIC Cycling Bear', { pay: true });
    g.act(0).activate('SYNTHETIC Pump Bear', { pay: true });
    g.act(0).activate('SYNTHETIC Pinger', { targets: [{ name: 'Grizzly Bears', seat: 1 }] });
    g.act(0).activate('SYNTHETIC Altar');
    g.act(0).choosePermanents('Grizzly Bears');
    g.passAll();
    g.passAll();
    g.advanceTo('upkeep', { turn: 'next' });
    return g;
  }

  test('two runs end in the same state with the same events and the same action log', () => {
    const a = play();
    const b = play();
    expect(a.hash()).toBe(b.hash());
    expect(a.events).toEqual(b.events);
    expect(a.log).toEqual(b.log);
  });

  test('replaying the action log on a fresh build reproduces the final state', () => {
    const first = play();
    const fresh = scenario()
      .seed(7)
      .seat(0)
      .hand('SYNTHETIC Cycling Bear')
      .battlefield(
        'SYNTHETIC Pump Bear',
        'SYNTHETIC Altar',
        'SYNTHETIC Pinger',
        'Grizzly Bears',
        'Forest',
        'Forest',
        'Forest',
        'Forest',
      )
      .library('Forest', 'Island', 'Plains', 'Swamp', 'Mountain')
      .seat(1)
      .battlefield('Grizzly Bears')
      .library('Forest', 'Island', 'Plains')
      .build();
    for (const entry of first.log) fresh.choose(entry.seat, entry.action as Action);
    expect(fresh.hash()).toBe(first.hash());
  });
});
