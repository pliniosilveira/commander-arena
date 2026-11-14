// Targets for triggered abilities, part 2: several triggers, Ward, Sagas (CR 603.3b, 603.3d, 601.2c,
// 702.21a, 714.2).
// Pins: CR 603.3b: each player in APNAP order puts their triggers on the stack in any order they
// choose, and abilities that trigger during that process go on the stack afterwards, so a seat with
// several targeted triggers orders them first and is then asked for the targets of each in turn, and
// the other seat is asked after; CR 601.2c: a permanent becomes a target as its targets are chosen
// and what that triggers (Ward) waits; CR 702.21a (Ward): the controller of a triggered ability that
// targets a warded permanent pays or the ability is countered; CR 714.2: a Saga's chapter abilities
// are triggered abilities, so their targets are chosen as they go on the stack too.
// Cards: SYNTHETIC (src/cards/fixtures/synthetic-trigger-targets.ts and synthetic-ward.ts) with real
// Grizzly Bears and Giant Spider.
import { describe, expect, test } from 'vitest';
import { applyAction } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';
import { FILLER } from './saga-helpers';

const REAPER = 'SYNTHETIC Reaper Imp';
const WATCHER = 'SYNTHETIC Ember Watcher'; // another creature enters under your control: 1 damage
const TOTEM = 'SYNTHETIC Growth Totem'; // any creature enters: counter on target creature you control
const GUARD = 'SYNTHETIC Warded Guard'; // 2/2, Ward {1}
const PURGE = 'SYNTHETIC Purge Saga';
const BEARS = 'Grizzly Bears';
const SPIDER = 'Giant Spider';
const ability = (name: string) => `${name} (ability)`;
const SWAMPS = ['Swamp', 'Swamp', 'Swamp'] as const;

function enters(g: ScenarioGame, name: string) {
  g.act(0).cast(name, { pay: true });
  g.pass();
  g.pass();
  return g;
}

function targetsOf(g: ScenarioGame, stackIndexFromTop: number) {
  const id = [...g.state.stack].reverse()[stackIndexFromTop];
  return id === undefined ? undefined : g.state.objects[id]?.stack?.chosenTargets;
}

describe('two targeted triggers of one seat (CR 603.3b, 603.3d)', () => {
  const build = () =>
    scenario()
      .seat(0)
      .hand(REAPER)
      .battlefield(...SWAMPS)
      .battlefield(WATCHER)
      .seat(1)
      .battlefield(BEARS, { label: 'a' })
      .battlefield(SPIDER, { label: 'b' })
      .build();

  test('the player orders them first, then is asked for each one in turn', () => {
    const g = enters(build(), REAPER);
    g.expect.pending('orderTriggers', 0);
    g.expect.stack([]);
    // The watcher's trigger goes on the stack first (resolves last), the imp's second.
    g.act(0).orderTriggers(WATCHER, REAPER);
    g.expect.pending('targets', 0);
    const first = g.state.pending;
    if (first?.kind !== 'targets') throw new Error('expected targets');
    g.expect.stack([ability(WATCHER)]);
    expect(first.source).toBe(g.state.stack[0]);
    // The second trigger is waiting in the context, not on the stack.
    expect(g.state.triggering?.queue.map((t) => t.source)).toEqual([g.id(REAPER)]);
    g.act(0).chooseTargets('a');
    g.expect.pending('targets', 0);
    const second = g.state.pending;
    if (second?.kind !== 'targets') throw new Error('expected targets');
    expect(second.source).not.toBe(first.source);
    g.expect.stack([ability(REAPER), ability(WATCHER)]);
    g.act(0).chooseTargets('b');
    g.expect.pending('priority', 0);
    expect(g.state.triggering).toBeNull();
    expect(targetsOf(g, 0)).toEqual([{ kind: 'object', id: g.id('b'), specId: 't1' }]);
    expect(targetsOf(g, 1)).toEqual([{ kind: 'object', id: g.id('a'), specId: 't1' }]);
    g.expect.invariants();
  });

  test('the order chosen decides what resolves first', () => {
    const g = enters(build(), REAPER);
    g.act(0).orderTriggers(WATCHER, REAPER);
    g.act(0).chooseTargets('a');
    g.act(0).chooseTargets('b');
    g.pass();
    g.pass();
    // The imp's trigger was put on last, so it resolved first: the spider is destroyed.
    g.expect.zone(SPIDER, 'graveyard', { seat: 1 });
    g.pass();
    g.pass();
    g.expect.damage('a', 1);
  });

  test('with a single opposing creature both choices are made for the player, after the order question', () => {
    // An opponent with a single creature: both are forced, so nobody is asked at all.
    const g = enters(
      scenario()
        .seat(0)
        .hand(REAPER)
        .battlefield(...SWAMPS)
        .battlefield(WATCHER)
        .seat(1)
        .battlefield(BEARS, { label: 'a' })
        .build(),
      REAPER,
    );
    g.expect.pending('orderTriggers', 0);
    g.act(0).orderTriggers(WATCHER, REAPER);
    g.expect.pending('priority', 0);
    g.expect.stack([ability(REAPER), ability(WATCHER)]);
    expect(targetsOf(g, 0)).toHaveLength(1);
    expect(targetsOf(g, 1)).toHaveLength(1);
  });

  test('a removed trigger among several does not stop the others', () => {
    const g = enters(
      scenario()
        .seat(0)
        .hand(REAPER)
        .battlefield(...SWAMPS)
        .battlefield(WATCHER)
        .seat(1)
        .build(),
      REAPER,
    );
    // Neither has a legal target: both removed, no ordering needed either way, but the order
    // question comes first (they are different abilities).
    g.act(0).orderTriggers(WATCHER, REAPER);
    g.expect.stack([]);
    expect(
      g.events
        .filter((e) => e.kind === 'abilityRemoved')
        .map((e) => (e as { source: string }).source),
    ).toEqual([g.id(WATCHER), g.id(REAPER)]);
    g.expect.pending('priority', 0);
  });
});

describe('both seats have a targeted trigger (CR 603.3b APNAP)', () => {
  test('the active player is asked first, then the other player; theirs resolves first', () => {
    const g = scenario()
      .seat(0)
      .hand(REAPER)
      .battlefield(...SWAMPS)
      .battlefield(TOTEM)
      .battlefield(BEARS, { label: 'mine' })
      .battlefield(SPIDER, { label: 'mine2' })
      .seat(1)
      .battlefield(TOTEM)
      .battlefield(BEARS, { label: 'theirs' })
      .battlefield(SPIDER, { label: 'theirs2' })
      .build();
    enters(g, REAPER);
    // Seat 0's Reaper Imp and Totem triggers: ordered by seat 0.
    g.expect.pending('orderTriggers', 0);
    g.act(0).orderTriggers(REAPER, TOTEM);
    g.expect.pending('targets', 0);
    g.act(0).chooseTargets('theirs');
    g.expect.pending('targets', 0);
    g.act(0).chooseTargets('mine');
    // Now seat 1's single totem trigger.
    g.expect.pending('targets', 1);
    const d = g.state.pending;
    if (d?.kind !== 'targets') throw new Error('expected targets');
    expect(d.forTrigger).toBe(true);
    // Seat 1's legal targets are seat 1's creatures.
    expect(d.specs[0]?.legal.map((t) => (t.kind === 'object' ? t.id : null)).sort()).toEqual(
      [g.id('theirs'), g.id('theirs2')].sort(),
    );
    g.act(1).chooseTargets('theirs2');
    g.expect.pending('priority', 0);
    expect(g.state.stack).toHaveLength(3);
    // The top of the stack is the last one put on: seat 1's.
    expect(targetsOf(g, 0)).toEqual([{ kind: 'object', id: g.id('theirs2'), specId: 't1' }]);
    g.expect.invariants();
  });
});

describe('Ward on the target of a triggered ability (CR 702.21a, 601.2c, 603.3b)', () => {
  const build = (swamps: number) =>
    scenario()
      .seat(0)
      .hand(REAPER)
      .battlefield(...Array.from({ length: swamps }, () => 'Swamp'))
      .seat(1)
      .battlefield(GUARD, { label: 'guard' })
      .build();

  test('the ward trigger goes on the stack above the targeting trigger, after the targets are chosen', () => {
    const g = enters(build(4), REAPER);
    // The only legal target is the guard: chosen for me, it becomes a target, ward triggers.
    g.expect.stack([ability(GUARD), ability(REAPER)]);
    g.expect.eventLog([
      { kind: 'abilityTriggered', seat: 0 },
      { kind: 'becameTarget', seat: 0, object: g.id('guard') },
      { kind: 'abilityTriggered', seat: 1 },
    ]);
    g.expect.pending('priority', 0);
    expect(g.state.pendingTriggers).toEqual([]);
  });

  test('paying the ward cost lets the trigger resolve', () => {
    const g = enters(build(4), REAPER);
    g.pass();
    g.pass();
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    g.act(0).payAuto();
    g.expect.stack([ability(REAPER)]);
    g.pass();
    g.pass();
    g.expect.zone(GUARD, 'graveyard', { seat: 1 });
  });

  test('declining counters the trigger: the guard lives', () => {
    const g = enters(build(4), REAPER);
    g.pass();
    g.pass();
    g.act(0).decline();
    g.expect.eventLog([{ kind: 'countered' }]);
    g.expect.stack([]);
    g.expect.zone(GUARD, 'battlefield', { seat: 1 });
  });

  test('a controller with no mana left is not asked: the trigger is countered', () => {
    const g = enters(build(3), REAPER);
    g.pass();
    g.pass();
    g.expect.eventLog([{ kind: 'countered' }]);
    g.expect.zone(GUARD, 'battlefield', { seat: 1 });
    g.expect.stack([]);
    g.expect.pending('priority', 0);
  });

  test("ward triggered by a chosen target is a separate trigger from the other seat's waiting ones", () => {
    // Seat 1 has a Totem trigger waiting too. The ward trigger came about during the process, so it
    // goes on the stack after the waiting ones (CR 603.3b): the stack, top first, is ward, totem, imp.
    const g = scenario()
      .seat(0)
      .hand(REAPER)
      .battlefield(...SWAMPS)
      .seat(1)
      .battlefield(GUARD, { label: 'guard' })
      .battlefield(TOTEM)
      .build();
    enters(g, REAPER);
    // Seat 1's Totem trigger has the guard as its only legal target: chosen for it. No question
    // is asked of anyone, and no order question either: the ward trigger was not waiting then.
    g.expect.pending('priority', 0);
    g.expect.stack([ability(GUARD), ability(TOTEM), ability(REAPER)]);
  });

  test('choosing the warded creature among several gives the same result', () => {
    const g = scenario()
      .seat(0)
      .hand(REAPER)
      .battlefield(...SWAMPS)
      .seat(1)
      .battlefield(GUARD, { label: 'guard' })
      .battlefield(BEARS, { label: 'bears' })
      .build();
    enters(g, REAPER);
    g.expect.pending('targets', 0);
    const mark = g.mark();
    g.act(0).chooseTargets('guard');
    g.expect.eventLog(
      [
        { kind: 'becameTarget', object: g.id('guard') },
        { kind: 'abilityTriggered', seat: 1 },
      ],
      { since: mark },
    );
    g.expect.stack([ability(GUARD), ability(REAPER)]);
    // Choosing the other creature does not trigger ward.
    const h = scenario()
      .seat(0)
      .hand(REAPER)
      .battlefield(...SWAMPS)
      .seat(1)
      .battlefield(GUARD)
      .battlefield(BEARS, { label: 'bears' })
      .build();
    enters(h, REAPER);
    h.act(0).chooseTargets('bears');
    h.expect.stack([ability(REAPER)]);
  });
});

describe('Saga chapter abilities with targets (CR 714.2, 603.3d)', () => {
  const build = (opponent: readonly string[]) => {
    const b = scenario()
      .seat(0)
      .hand(PURGE)
      .battlefield(...SWAMPS)
      .battlefield(BEARS, { label: 'mine' })
      .library(...FILLER)
      .seat(1)
      .library(...FILLER);
    for (const [i, name] of opponent.entries()) b.battlefield(name, { label: `opp${i}` });
    return b.build();
  };

  test('chapter I asks for its target as it goes on the stack, and destroys it', () => {
    const g = build([BEARS, SPIDER]);
    g.act(0).cast(PURGE, { pay: true });
    g.pass();
    g.pass();
    g.expect.pending('targets', 0);
    g.expect.eventLog([{ kind: 'abilityTriggered', seat: 0, chapter: 1 }]);
    g.act(0).chooseTargets('opp1');
    g.pass();
    g.pass();
    g.expect.zone(SPIDER, 'graveyard', { seat: 1 });
    g.expect.zone(BEARS, 'battlefield', { seat: 1 });
  });

  test('with no creature to target the chapter is removed and says which chapter', () => {
    const g = build([]);
    g.act(0).cast(PURGE, { pay: true });
    g.pass();
    g.pass();
    g.expect.stack([]);
    g.expect.eventLog([{ kind: 'abilityRemoved', seat: 0, reason: 'noLegalTargets', chapter: 1 }]);
    // The Saga stays with its lore counter; later chapters are unaffected.
    g.expect.zone(PURGE, 'battlefield', { seat: 0 });
    g.expect.counters(PURGE, { lore: 1 });
  });

  test('chapter II targets a creature I control, chosen on the next turn', () => {
    const g = scenario()
      .seat(0)
      .battlefield(PURGE, { counters: { lore: 1 } })
      .battlefield(BEARS, { label: 'a' })
      .battlefield(SPIDER, { label: 'b' })
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .build();
    g.advanceTo('precombatMain', { turn: 5 });
    g.expect.pending('targets', 0);
    g.expect.eventLog([{ kind: 'abilityTriggered', seat: 0, chapter: 2 }]);
    g.act(0).chooseTargets('b');
    g.pass();
    g.pass();
    g.expect.counters(SPIDER, { '+1/+1': 1 });
  });
});

describe('legal actions when a trigger asks (CR 603.3d)', () => {
  test('every listed answer is accepted, and a wrong shape is not', () => {
    const g = scenario()
      .seat(0)
      .hand(REAPER)
      .battlefield(...SWAMPS)
      .seat(1)
      .battlefield(BEARS, { label: 'a' })
      .battlefield(SPIDER, { label: 'b' })
      .build();
    enters(g, REAPER);
    for (const action of g.legalActions(0)) {
      expect(applyAction(g.state, 0, action).ok, JSON.stringify(action)).toBe(true);
    }
    const before = g.hash();
    const none = g.act(0).try.action({ kind: 'chooseTargets', targets: [] });
    expect(none.ok).toBe(false);
    const two = g.act(0).try.action({
      kind: 'chooseTargets',
      targets: [
        { kind: 'object', id: g.id('a'), specId: 't1' },
        { kind: 'object', id: g.id('b'), specId: 't1' },
      ],
    });
    expect(two.ok).toBe(false);
    const wrongSlot = g.act(0).try.action({
      kind: 'chooseTargets',
      targets: [{ kind: 'object', id: g.id('a'), specId: 't9' }],
    });
    expect(wrongSlot.ok).toBe(false);
    g.expect.hash(before);
  });

  test('conceding while a trigger waits for targets ends the game cleanly', () => {
    const g = scenario()
      .seat(0)
      .hand(REAPER)
      .battlefield(...SWAMPS)
      .seat(1)
      .battlefield(BEARS)
      .battlefield(SPIDER)
      .build();
    enters(g, REAPER);
    g.act(0).concede();
    expect(g.state.result).toEqual({ kind: 'win', winner: 1 });
    expect(g.state.triggering).toBeNull();
  });
});
