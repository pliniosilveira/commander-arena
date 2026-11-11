// Targets for triggered abilities (CR 603.3d, 115.1d, 601.2c): the controller chooses them as the
// ability is put on the stack, with the same `targets` decision a spell has (no cancel).
// Pins: CR 603.3d (Handling Triggered Abilities): "the remainder of the process for putting a
// triggered ability on the stack is identical to the process for casting a spell listed in rules
// 601.2c-d. If a choice is required when the triggered ability goes on the stack but no legal
// choices can be made for it ... the ability is simply removed from the stack"; CR 115.1d: a
// triggered ability's targets are chosen as it is put on the stack; CR 601.2c: a choice of "up to"
// zero targets is a legal choice, so an ability whose every slot may stay empty is never removed;
// CR 608.2b: targets are checked again on resolution (an ability with no legal target left does not
// resolve, one with some does as much as it can); CR 603.4: an intervening "if" is checked as the
// ability triggers and again as it resolves; CR 603.5: "you may" is asked on resolution, after the
// targets were chosen on the stack; CR 603.10a and 113.7a: a dies trigger of a creature that has
// left uses its last-known information, its controller is who chooses.
// Cards: SYNTHETIC (src/cards/fixtures/synthetic-trigger-targets.ts) with real Grizzly Bears, Giant
// Spider, Lightning Bolt and Sol Ring. The ward, ordering, Saga and legal-action cases are in
// scenario-xx-triggered-targets-*.test.ts.
import { describe, expect, test } from 'vitest';
import { applyAction } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';
import { targetsDecision } from './pending-helpers';

const REAPER = 'SYNTHETIC Reaper Imp'; // enters: destroy target creature an opponent controls
const LAST_GASP = 'SYNTHETIC Last Gasp Imp'; // dies: destroy target creature an opponent controls
const TWIN = 'SYNTHETIC Twin Spark Imp'; // enters: counter on your creature, 2 damage to theirs
const TINKER = 'SYNTHETIC Tinker Imp'; // enters: destroy up to one target artifact
const DRAIN = 'SYNTHETIC Drain Imp'; // enters: target opponent loses 2 life
const EAGER = 'SYNTHETIC Eager Imp'; // enters: you may destroy target creature an opponent controls
const CAREFUL = 'SYNTHETIC Careful Imp'; // enters, if you control another creature: destroy ...
const BEARS = 'Grizzly Bears';
const SPIDER = 'Giant Spider';
const BOLT = 'Lightning Bolt';
const IMP_ABILITY = (name: string) => `${name} (ability)`;

const SWAMPS = ['Swamp', 'Swamp', 'Swamp'] as const;

/** Casts the creature and lets it resolve: its enters trigger is the next thing to happen. */
function enters(g: ScenarioGame, name: string) {
  g.act(0).cast(name, { pay: true });
  g.pass();
  g.pass();
  return g;
}

/** The bottom object of the stack (the only one in most tests). */
function stackObject(g: ScenarioGame) {
  const id = g.state.stack[0];
  return id === undefined ? undefined : g.state.objects[id];
}

describe('choosing the targets of an enters trigger (CR 603.3d)', () => {
  const build = () =>
    scenario()
      .seat(0)
      .hand(REAPER)
      .battlefield(...SWAMPS)
      .battlefield(BEARS, { label: 'mine' })
      .seat(1)
      .battlefield(BEARS, { label: 'bearA' })
      .battlefield(SPIDER)
      .build();

  test('the controller is asked, naming the ability on the stack as the source', () => {
    const g = enters(build(), REAPER);
    g.expect.pending('targets', 0);
    const d = targetsDecision(g);
    // The ability is on the stack while its targets are chosen (CR 603.3d): that object is the source.
    g.expect.stack([IMP_ABILITY(REAPER)]);
    expect(d.source).toBe(g.state.stack[0]);
    expect(d.forTrigger).toBe(true);
    expect(d.specs).toHaveLength(1);
    expect(d.specs[0]).toMatchObject({ specId: 't1', min: 1, max: 1 });
    // Only creatures an opponent controls: not the Imp itself, not my own Bears.
    expect(d.specs[0]?.legal.map((t) => (t.kind === 'object' ? t.id : null)).sort()).toEqual(
      [g.id('bearA'), g.id(SPIDER)].sort(),
    );
    g.expect.invariants();
  });

  test('the state remembers the ability that waits and nothing else was put on the stack yet', () => {
    const g = enters(build(), REAPER);
    expect(g.state.triggering).toEqual({ seat: 0, queue: [], awaiting: g.state.stack[0] });
    expect(g.state.pendingTriggers).toEqual([]);
    g.act(0).chooseTargets('bearA');
    expect(g.state.triggering).toBeNull();
  });

  test("the answer becomes the ability's target; the events say so, and priority follows", () => {
    const g = enters(build(), REAPER);
    const mark = g.mark();
    g.act(0).chooseTargets('bearA');
    g.expect.eventLog([{ kind: 'becameTarget', seat: 0 }], { since: mark });
    g.expect.stack([IMP_ABILITY(REAPER)]);
    const onStack = stackObject(g);
    expect(onStack?.stack?.chosenTargets).toEqual([
      { kind: 'object', id: g.id('bearA'), specId: 't1' },
    ]);
    // The stack object's view shows its chosen targets, as for an activated ability.
    expect(g.view(0).stack[0]?.targets).toEqual(onStack?.stack?.chosenTargets);
    // ... and its own text, so a player or the AI can read what it does (public rules text).
    expect(g.view(0).stack[0]?.ability?.kind).toBe('triggered');
    expect(g.view(1).stack[0]?.ability?.kind).toBe('triggered');
    g.expect.pending('priority', 0);
    g.expect.noEvent({ kind: 'abilityRemoved' });
  });

  test('the events of the whole trigger: it triggered, then the target became a target', () => {
    const g = enters(build(), REAPER);
    g.act(0).chooseTargets('bearA');
    g.expect.eventLog([
      { kind: 'abilityTriggered', seat: 0, stackObject: g.state.stack[0] },
      { kind: 'becameTarget', seat: 0, by: g.state.stack[0], object: g.id('bearA') },
    ]);
  });

  test('it resolves: the chosen creature is destroyed, the other stays', () => {
    const g = enters(build(), REAPER);
    g.act(0).chooseTargets('bearA');
    g.pass();
    g.pass();
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    g.expect.zone(SPIDER, 'battlefield', { seat: 1 });
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.stack([]);
    g.expect.invariants();
  });

  test('a target that is not legal is refused and the question stays', () => {
    const g = enters(build(), REAPER);
    const before = g.hash();
    const r = g.act(0).try.action({
      kind: 'chooseTargets',
      targets: [{ kind: 'object', id: g.id('mine'), specId: 't1' }],
    });
    expect(r.ok).toBe(false);
    g.expect.hash(before);
    g.expect.pending('targets', 0);
  });

  test('there is no cancel: putting a triggered ability on the stack is not optional', () => {
    const g = enters(build(), REAPER);
    const before = g.hash();
    const r = g.act(0).try.action({ kind: 'cancel' });
    expect(r.ok).toBe(false);
    g.expect.hash(before);
    g.expect.pending('targets', 0);
  });

  test('the other seat is not asked', () => {
    const g = enters(build(), REAPER);
    const r = applyAction(g.state, 1, {
      kind: 'chooseTargets',
      targets: [{ kind: 'object', id: g.id('bearA'), specId: 't1' }],
    });
    expect(r.ok).toBe(false);
  });
});

describe('when no choice is needed', () => {
  test('exactly one legal target is chosen without asking (CR 603.3d, 601.2c)', () => {
    const g = enters(
      scenario()
        .seat(0)
        .hand(REAPER)
        .battlefield(...SWAMPS)
        .seat(1)
        .battlefield(BEARS, { label: 'only' })
        .build(),
      REAPER,
    );
    g.expect.pending('priority', 0);
    g.expect.stack([IMP_ABILITY(REAPER)]);
    const top = stackObject(g);
    expect(top?.stack?.chosenTargets).toEqual([{ kind: 'object', id: g.id('only'), specId: 't1' }]);
    g.expect.eventLog([
      { kind: 'abilityTriggered', seat: 0 },
      { kind: 'becameTarget', seat: 0, object: g.id('only') },
    ]);
    expect(g.state.triggering).toBeNull();
    g.pass();
    g.pass();
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
  });

  test('"target opponent" in a two-player game is the only choice, so it is made for you', () => {
    const g = enters(
      scenario()
        .seat(0)
        .hand(DRAIN)
        .battlefield(...SWAMPS)
        .seat(1)
        .build(),
      DRAIN,
    );
    g.expect.pending('priority', 0);
    const top = stackObject(g);
    expect(top?.stack?.chosenTargets).toEqual([{ kind: 'player', seat: 1, specId: 't1' }]);
    // A player does not "become the target" of an event anything reads (docs/ROADMAP.md).
    g.expect.noEvent({ kind: 'becameTarget' });
    g.pass();
    g.pass();
    g.expect.life(1, 38);
  });
});

describe('no legal target: the ability is removed (CR 603.3d)', () => {
  const build = () =>
    scenario()
      .seat(0)
      .hand(REAPER)
      .battlefield(...SWAMPS, BEARS)
      .seat(1)
      .build();

  test('it never goes on the stack and an event says why', () => {
    const g = enters(build(), REAPER);
    g.expect.stack([]);
    g.expect.eventLog([
      {
        kind: 'abilityRemoved',
        seat: 0,
        source: g.id(REAPER),
        abilityIndex: 0,
        reason: 'noLegalTargets',
      },
    ]);
    g.expect.noEvent({ kind: 'abilityTriggered' });
    g.expect.pending('priority', 0);
    expect(g.state.triggering).toBeNull();
    expect(g.state.pendingTriggers).toEqual([]);
    // The creature itself is not affected: only its ability is gone.
    g.expect.zone(REAPER, 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('a creature with hexproof is not a legal target either', () => {
    const g = enters(
      scenario()
        .seat(0)
        .hand(REAPER)
        .battlefield(...SWAMPS)
        .seat(1)
        .battlefield('SYNTHETIC Hexproof Bear')
        .build(),
      REAPER,
    );
    g.expect.stack([]);
    g.expect.eventLog([{ kind: 'abilityRemoved', reason: 'noLegalTargets' }]);
  });
});

describe('"up to" one target (CR 601.2c, 603.3d)', () => {
  test('with no artifact the ability is not removed: choosing nothing is a legal choice', () => {
    const g = enters(
      scenario()
        .seat(0)
        .hand(TINKER)
        .battlefield(...SWAMPS)
        .seat(1)
        .battlefield(BEARS)
        .build(),
      TINKER,
    );
    g.expect.noEvent({ kind: 'abilityRemoved' });
    g.expect.pending('priority', 0);
    g.expect.stack([IMP_ABILITY(TINKER)]);
    expect(stackObject(g)?.stack?.chosenTargets).toEqual([]);
    g.expect.noEvent({ kind: 'becameTarget' });
    // It resolves with nothing to do: it is not a fizzle (CR 608.2b needs a target that is illegal).
    g.pass();
    g.pass();
    g.expect.noEvent({ kind: 'fizzled' });
    g.expect.stack([]);
  });

  test('with an artifact the player may pick it or none', () => {
    const build = () =>
      scenario()
        .seat(0)
        .hand(TINKER)
        .battlefield(...SWAMPS)
        .seat(1)
        .battlefield('Sol Ring')
        .build();
    const g = enters(build(), TINKER);
    g.expect.pending('targets', 0);
    expect(targetsDecision(g).specs[0]).toMatchObject({ min: 0, max: 1 });
    expect(g.legalActions(0).filter((a) => a.kind === 'chooseTargets')).toHaveLength(2);
    g.act(0).chooseTargets('Sol Ring');
    g.pass();
    g.pass();
    g.expect.zone('Sol Ring', 'graveyard', { seat: 1 });

    const h = enters(build(), TINKER);
    h.act(0).choose({ kind: 'chooseTargets', targets: [] });
    h.expect.noEvent({ kind: 'becameTarget' });
    h.pass();
    h.pass();
    h.expect.zone('Sol Ring', 'battlefield', { seat: 1 });
  });
});

describe('a dies trigger with a target (CR 603.10a, 113.7a)', () => {
  const build = () =>
    scenario()
      .seat(0)
      .battlefield(LAST_GASP, { label: 'imp' })
      .battlefield(BEARS)
      .seat(1)
      .hand(BOLT)
      .battlefield('Mountain')
      .battlefield(BEARS, { label: 'theirs' })
      .battlefield(SPIDER)
      .build();

  test('its controller chooses, though the source has left and it is not their turn to act', () => {
    const g = build();
    g.act(0).pass();
    g.act(1).cast(BOLT, { targets: ['imp'], pay: true });
    g.pass();
    g.pass();
    g.expect.zone(LAST_GASP, 'graveyard', { seat: 0 });
    // Seat 0 controlled the Imp, so seat 0 chooses: the opponent's creatures are legal.
    g.expect.pending('targets', 0);
    const d = targetsDecision(g);
    expect(d.specs[0]?.legal.map((t) => (t.kind === 'object' ? t.id : null)).sort()).toEqual(
      [g.id('theirs'), g.id(SPIDER)].sort(),
    );
    g.act(0).chooseTargets('theirs');
    g.expect.stack([IMP_ABILITY(LAST_GASP)]);
    g.pass();
    g.pass();
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('with no opposing creature it is removed, naming the source that left', () => {
    const g = scenario()
      .seat(0)
      .battlefield(LAST_GASP, { label: 'imp' })
      .seat(1)
      .hand(BOLT)
      .battlefield('Mountain')
      .build();
    g.act(0).pass();
    g.act(1).cast(BOLT, { targets: ['imp'], pay: true });
    g.pass();
    g.pass();
    g.expect.stack([]);
    g.expect.eventLog([{ kind: 'abilityRemoved', seat: 0, reason: 'noLegalTargets' }]);
  });
});

describe('checking the targets again on resolution (CR 608.2b)', () => {
  test('a trigger whose only target became illegal does not resolve', () => {
    const g = scenario()
      .seat(0)
      .hand(REAPER, BOLT)
      .battlefield(...SWAMPS, 'Mountain')
      .seat(1)
      .battlefield(BEARS, { label: 'a' })
      .battlefield(SPIDER, { label: 'b' })
      .build();
    enters(g, REAPER);
    g.act(0).chooseTargets('a');
    // In response, the target dies.
    g.act(0).cast(BOLT, { targets: ['a'], pay: true });
    g.pass();
    g.pass();
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    g.expect.stack([IMP_ABILITY(REAPER)]);
    g.pass();
    g.pass();
    g.expect.eventLog([{ kind: 'fizzled' }]);
    g.expect.stack([]);
    // The spider was never the target: it is not destroyed in its place.
    g.expect.zone(SPIDER, 'battlefield', { seat: 1 });
  });

  test('with two targets, one illegal: it resolves for the other (partial fizzle)', () => {
    const g = scenario()
      .seat(0)
      .hand(TWIN, BOLT)
      .battlefield(...SWAMPS, 'Mountain')
      .battlefield(BEARS, { label: 'friend' })
      .seat(1)
      .battlefield(SPIDER, { label: 'foe' })
      .build();
    enters(g, TWIN);
    // Two slots: a creature I control (the Bears or the Imp), a creature an opponent controls.
    const d = targetsDecision(g);
    expect(d.specs.map((s) => s.specId)).toEqual(['t1', 't2']);
    g.act(0).chooseTargets('friend', 'foe');
    g.act(0).cast(BOLT, { targets: ['friend'], pay: true });
    g.pass();
    g.pass();
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.pass();
    g.pass();
    // The counter had no legal target; the damage part still happened.
    g.expect.noEvent({ kind: 'fizzled' });
    g.expect.damage('foe', 2);
    g.expect.invariants();
  });
});

describe('"you may" with a target (CR 603.5)', () => {
  const build = () =>
    scenario()
      .seat(0)
      .hand(EAGER)
      .battlefield(...SWAMPS)
      .seat(1)
      .battlefield(BEARS, { label: 'a' })
      .battlefield(SPIDER)
      .build();

  test('the targets are chosen on the stack, the "may" is asked on resolution', () => {
    const g = enters(build(), EAGER);
    g.expect.pending('targets', 0);
    g.act(0).chooseTargets('a');
    g.expect.stack([IMP_ABILITY(EAGER)]);
    g.pass();
    g.pass();
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
  });

  test('declining leaves the target alone, though it became a target', () => {
    const g = enters(build(), EAGER);
    g.act(0).chooseTargets('a');
    g.pass();
    g.pass();
    g.act(0).decline();
    g.expect.zone(BEARS, 'battlefield', { seat: 1 });
    g.expect.stack([]);
  });
});

describe('an intervening "if" with a target (CR 603.4)', () => {
  test('without the condition it does not trigger, so nothing is removed or asked', () => {
    const g = enters(
      scenario()
        .seat(0)
        .hand(CAREFUL)
        .battlefield(...SWAMPS)
        .seat(1)
        .battlefield(BEARS)
        .build(),
      CAREFUL,
    );
    g.expect.stack([]);
    g.expect.noEvent({ kind: 'abilityRemoved' });
    g.expect.noEvent({ kind: 'abilityTriggered' });
    g.expect.pending('priority', 0);
  });

  test('with it, the target is chosen; it is checked again when the ability resolves', () => {
    const g = scenario()
      .seat(0)
      .hand(CAREFUL, BOLT)
      .battlefield(...SWAMPS, 'Mountain')
      .battlefield(BEARS, { label: 'friend' })
      .seat(1)
      .battlefield(BEARS, { label: 'foe' })
      .battlefield(SPIDER)
      .build();
    enters(g, CAREFUL);
    g.expect.pending('targets', 0);
    g.act(0).chooseTargets('foe');
    // The other creature I control dies in response: the "if" is false on resolution.
    g.act(0).cast(BOLT, { targets: ['friend'], pay: true });
    g.pass();
    g.pass();
    g.pass();
    g.pass();
    g.expect.eventLog([{ kind: 'fizzled', reason: 'interveningIf' }]);
    g.expect.zone(BEARS, 'battlefield', { seat: 1 });
    g.expect.stack([]);
  });
});

describe('legal actions, determinism and replay', () => {
  const build = () =>
    scenario()
      .seat(0)
      .hand(REAPER)
      .battlefield(...SWAMPS, BEARS)
      .seat(1)
      .battlefield(BEARS, { label: 'a' })
      .battlefield(SPIDER)
      .build();

  test('the legal actions are exactly what the engine accepts: choices and concede, no cancel', () => {
    const g = enters(build(), REAPER);
    const legal = g.legalActions(0);
    expect(legal.map((a) => a.kind).sort()).toEqual(['chooseTargets', 'chooseTargets', 'concede']);
    for (const action of legal) {
      expect(applyAction(g.state, 0, action).ok, JSON.stringify(action)).toBe(true);
    }
    expect(g.legalActions(1)).toEqual([]);
  });

  test('the same actions give the same state hash', () => {
    const play = () => {
      const g = enters(build(), REAPER);
      g.act(0).chooseTargets('a');
      g.pass();
      g.pass();
      return g.hash();
    };
    expect(play()).toBe(play());
  });

  test('replaying the log of actions reaches the same state', () => {
    const g = enters(build(), REAPER);
    g.act(0).chooseTargets('a');
    g.pass();
    g.pass();
    const fresh = build();
    let state = fresh.state;
    for (const { seat, action } of g.log) {
      const r = applyAction(state, seat, action);
      if (!r.ok) throw new Error(r.error);
      state = r.state;
    }
    expect(state).toEqual(g.state);
  });
});
