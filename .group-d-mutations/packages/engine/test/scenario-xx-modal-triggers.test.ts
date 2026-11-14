// Modal triggered abilities (D-105, D-114).
// Pins: CR 603.3c and 700.2b (the controller of a modal triggered ability chooses the mode(s) as the ability
// is put on the stack; a mode that would be illegal, for want of legal targets, cannot be chosen; if no mode
// can be chosen the ability is removed from the stack), CR 603.3d and 601.2c (the targets of the chosen modes
// are chosen with the same decision as any trigger's, with no cancel), CR 603.3b (several triggers: the
// player orders them first, then is asked for each in turn), CR 608.2b (a chosen mode with an illegal target
// does nothing).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-modal.ts, synthetic-trigger-targets.ts) with real
// Grizzly Bears, Giant Spider and Sol Ring.
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import { applyAction, getLegalActions, syntheticCard } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';
import { chooseModesDecision, targetsDecision } from './pending-helpers';

const GREETER = 'SYNTHETIC Modal Greeter'; // enters: choose one: gain 3 / 2 damage to target creature an opponent controls
const HUNTER = 'SYNTHETIC Modal Hunter'; // enters: choose one: destroy target opposing artifact / 2 damage to target opposing creature
const TWIN = 'SYNTHETIC Twin Greeter'; // enters: choose two: draw / 1 damage to opposing creature / target player gains 2
const RAIDER = 'SYNTHETIC Modal Raider'; // attacks: choose one: draw / 1 damage to target opposing creature
const WATCHER = 'SYNTHETIC Ember Watcher'; // another creature enters under your control: 1 damage to target opposing creature
const BEARS = 'Grizzly Bears';
const SPIDER = 'Giant Spider';
const SOL_RING = 'Sol Ring';
const ability = (name: string) => `${name} (ability)`;

/** Casts the creature and lets it resolve: its enters trigger is the next thing to happen. */
function enters(g: ScenarioGame, name: string): ScenarioGame {
  g.act(0).cast(name, { pay: true });
  g.pass();
  g.pass();
  return g;
}

const build = (card: string, opposing: readonly string[] = [BEARS]) => {
  const b = scenario()
    .seat(0)
    .hand(card)
    .battlefield('Forest', { count: 3 })
    .library('Plains', 'Plains', 'Plains', 'Plains')
    .seat(1);
  for (const name of opposing) b.battlefield(name, { label: name });
  return b.build();
};

describe('a modal enters trigger asks for its modes as it goes on the stack (CR 603.3c, 700.2b)', () => {
  test('two modes are legal: the question names the ability on the stack and has no cancel', () => {
    const g = enters(build(GREETER), GREETER);
    const d = chooseModesDecision(g);
    expect(d).toMatchObject({
      seat: 0,
      purpose: 'trigger',
      forTrigger: true,
      min: 1,
      max: 1,
      sets: [[0], [1]],
      sourceName: GREETER,
    });
    // The ability is already on the stack, as for a trigger with targets, and is the question's source.
    g.expect.stack([ability(GREETER)]);
    expect(d.source).toBe(g.state.stack[0]);
    expect(g.state.triggering?.awaiting).toBe(d.source);
    expect(getLegalActions(g.state, 0)).toEqual([
      { kind: 'chooseModes', modes: [0] },
      { kind: 'chooseModes', modes: [1] },
      { kind: 'concede' },
    ]);
    expect(applyAction(g.state, 0, { kind: 'cancel' }).ok).toBe(false);
    g.expect.invariants();
  });

  test('the life mode: no target is asked and priority comes back with the ability on the stack', () => {
    const g = enters(build(GREETER), GREETER);
    g.act(0).chooseModes(0);
    g.expect.pending('priority', 0);
    expect(g.state.triggering).toBeNull();
    const top = g.view(0).stack[0];
    expect(top?.modes).toEqual([0]);
    expect(top?.modeTexts).toEqual([
      'You gain 3 life.',
      'It deals 2 damage to target creature an opponent controls.',
    ]);
    g.pass();
    g.pass();
    g.expect.life(0, 43);
    g.expect.stack([]);
  });

  test('the damage mode: its target is asked with the same decision as any trigger, no cancel', () => {
    const g = enters(build(GREETER, [BEARS, SPIDER]), GREETER);
    g.act(0).chooseModes(1);
    const t = targetsDecision(g);
    expect(t).toMatchObject({ forTrigger: true, seat: 0 });
    expect(t.specs.map((s) => [s.specId, s.mode])).toEqual([['hit', 1]]);
    expect(t.specs[0]?.legal).toHaveLength(2);
    expect(t.source).toBe(g.state.stack[0]);
    expect(applyAction(g.state, 0, { kind: 'cancel' }).ok).toBe(false);
    g.act(0).chooseTargets(BEARS);
    g.expect.pending('priority', 0);
    g.pass();
    g.pass();
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    g.expect.life(0, 40);
  });

  test('an answer that is not a legal set is refused and nothing changes', () => {
    const g = enters(build(GREETER), GREETER);
    const before = g.hash();
    for (const bad of [[], [0, 1], [2]]) {
      expect(applyAction(g.state, 0, { kind: 'chooseModes', modes: bad }).ok).toBe(false);
    }
    expect(g.hash()).toBe(before);
    expect(applyAction(g.state, 1, { kind: 'chooseModes', modes: [0] }).ok).toBe(false);
  });
});

describe('only one mode is legal: the engine chooses it (CR 700.2a)', () => {
  test('no creature to hit: the life mode is chosen, with an event that says so', () => {
    const g = build(GREETER, []);
    const mark = g.mark();
    enters(g, GREETER);
    g.expect.pending('priority', 0);
    const ab = g.state.stack[0];
    expect(ab && g.state.objects[ab]?.stack?.chosenModes).toEqual([0]);
    g.expect.eventLog([{ kind: 'modesChosen', seat: 0, source: ab, modes: [0], automatic: true }], {
      since: mark,
    });
  });

  test('a mode with one legal target and nothing else to choose: modes and target are both chosen', () => {
    const g = build(HUNTER, [BEARS]);
    enters(g, HUNTER);
    g.expect.pending('priority', 0);
    const ab = g.state.stack[0];
    expect(ab && g.state.objects[ab]?.stack?.chosenModes).toEqual([1]);
    expect(ab && g.state.objects[ab]?.stack?.chosenTargets).toEqual([
      { kind: 'object', id: g.id(BEARS), specId: 'hit' },
    ]);
    g.pass();
    g.pass();
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
  });
});

describe('no mode can be chosen: the ability is removed (CR 603.3c, 700.2b)', () => {
  test('every mode needs a target and there is none: abilityRemoved, nothing on the stack', () => {
    const g = build(HUNTER, []);
    const mark = g.mark();
    enters(g, HUNTER);
    g.expect.pending('priority', 0);
    g.expect.stack([]);
    g.expect.eventLog(
      [
        {
          kind: 'abilityRemoved',
          seat: 0,
          source: g.id(HUNTER),
          abilityIndex: 0,
          reason: 'noLegalModes',
        },
      ],
      { since: mark },
    );
    g.expect.noEvent({ kind: 'abilityTriggered' }, { since: mark });
    g.expect.invariants();
  });

  test('a choose-two trigger with only one legal mode cannot reach its number: it is removed', () => {
    // SYNTHETIC: "When this enters, choose two — • Destroy target artifact an opponent controls. • 2 damage to
    // target creature an opponent controls." One creature and no artifact leaves a single legal mode.
    const duo = singleFace({
      name: 'SYNTHETIC Duo Hunter',
      manaCost: ['2', 'G'],
      types: ['creature'],
      subtypes: ['Imp'],
      colors: ['G'],
      colorIdentity: ['G'],
      power: 2,
      toughness: 2,
      oracleText:
        'When this creature enters, choose two — • Destroy target artifact an opponent controls. • It deals 2 damage to target creature an opponent controls.',
      abilities: [
        {
          kind: 'triggered',
          trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
          effect: { kind: 'sequence', effects: [] },
          chooseModes: { min: 2, max: 2 },
          modes:
            syntheticCard(HUNTER).faces[0]?.abilities.flatMap((a) =>
              a.kind === 'triggered' ? (a.modes ?? []) : [],
            ) ?? [],
        },
      ],
    });
    const g = scenario()
      .define(duo)
      .seat(0)
      .hand(duo.name)
      .battlefield('Forest', { count: 3 })
      .seat(1)
      .battlefield(BEARS)
      .build();
    const mark = g.mark();
    enters(g, duo.name);
    g.expect.stack([]);
    g.expect.eventLog([{ kind: 'abilityRemoved', reason: 'noLegalModes' }], { since: mark });
    // With an artifact too both modes are legal, so the only pair is chosen without asking.
    const both = scenario()
      .define(duo)
      .seat(0)
      .hand(duo.name)
      .battlefield('Forest', { count: 3 })
      .seat(1)
      .battlefield(BEARS)
      .battlefield(SOL_RING)
      .build();
    enters(both, duo.name);
    const ab = both.state.stack[0];
    expect(ab && both.state.objects[ab]?.stack?.chosenModes).toEqual([0, 1]);
  });
});

describe('choose two as a trigger', () => {
  test('with an opposing creature all three pairs are offered; the targets of both modes are asked together', () => {
    const g = enters(build(TWIN), TWIN);
    expect(chooseModesDecision(g)).toMatchObject({
      min: 2,
      max: 2,
      sets: [
        [0, 1],
        [0, 2],
        [1, 2],
      ],
    });
    g.act(0).chooseModes(1, 2);
    expect(targetsDecision(g).specs.map((s) => [s.specId, s.mode])).toEqual([
      ['hit', 1],
      ['who', 2],
    ]);
    g.act(0).chooseTargets(BEARS, { player: 1 });
    g.pass();
    g.pass();
    g.expect.damage(BEARS, 1);
    g.expect.life(1, 42);
    g.expect.handSize(0, 0);
  });
});

describe('a modal attack trigger', () => {
  test('is asked when the creature attacks, after the attack is declared', () => {
    const g = scenario()
      .seat(0)
      .battlefield(RAIDER, { label: 'raider' })
      .library('Plains', 'Plains')
      .seat(1)
      .battlefield(BEARS, { label: 'bears' })
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack('raider', { player: 1 });
    const d = chooseModesDecision(g);
    expect(d).toMatchObject({ purpose: 'trigger', sets: [[0], [1]], sourceName: RAIDER });
    g.act(0).chooseModes(0);
    g.expect.pending('priority', 0);
    g.pass();
    g.pass();
    g.expect.handSize(0, 1);
  });
});

describe('several triggers at once (CR 603.3b)', () => {
  const both = () =>
    scenario()
      .seat(0)
      .hand(GREETER)
      .battlefield('Forest', { count: 3 })
      .battlefield(WATCHER)
      .battlefield('Mountain', { count: 2 })
      .library('Plains', 'Plains')
      .seat(1)
      .battlefield(BEARS, { label: 'bears' })
      .battlefield(SPIDER, { label: 'spider' })
      .build();

  test('the order is chosen first, each trigger then asks its own question, the modal one its modes first', () => {
    const g = enters(both(), GREETER);
    g.expect.pending('orderTriggers', 0);
    const d = g.state.pending;
    if (d?.kind !== 'orderTriggers') throw new Error('expected orderTriggers');
    // The trigger event of each is shown so the panel can word it (TriggerChoice.trigger).
    const greeter = d.triggers.find((t) => t.sourceName === GREETER);
    const watcher = d.triggers.find((t) => t.sourceName === WATCHER);
    expect(greeter?.trigger).toEqual({ kind: 'entersBattlefield', what: { kind: 'this' } });
    expect(watcher?.trigger).toEqual({
      kind: 'entersBattlefield',
      what: { other: true, types: ['creature'], controller: 'you' },
    });
    g.act(0).orderTriggers(GREETER, WATCHER);
    g.expect.pending('chooseModes', 0);
    g.expect.stack([ability(GREETER)]);
    expect(g.state.triggering?.queue.map((t) => t.source)).toEqual([g.id(WATCHER)]);
    g.act(0).chooseModes(1);
    g.expect.pending('targets', 0);
    g.act(0).chooseTargets('spider');
    // Then the other trigger's own targets.
    g.expect.pending('targets', 0);
    g.act(0).chooseTargets('bears');
    g.expect.pending('priority', 0);
    g.expect.stack([ability(WATCHER), ability(GREETER)]);
    g.expect.invariants();
  });

  test('a modal trigger with one legal choice does not interrupt the other triggers', () => {
    const g = scenario()
      .seat(0)
      .hand(GREETER)
      .battlefield('Forest', { count: 3 })
      .battlefield(WATCHER)
      .battlefield('Mountain', { count: 2 })
      .library('Plains', 'Plains')
      .seat(1)
      .build();
    enters(g, GREETER);
    g.expect.pending('orderTriggers', 0);
    // The watcher has no creature to hit and is removed; only the greeter's life mode can be chosen.
    g.act(0).orderTriggers(GREETER, WATCHER);
    g.expect.pending('priority', 0);
    g.expect.stack([ability(GREETER)]);
  });
});
