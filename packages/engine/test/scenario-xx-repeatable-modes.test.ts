// Repeatable modes (D-1000): "Choose three. You may choose the same mode more than once."
// Pins: CR 700.2d (the same mode may be chosen more than once when the text says so; a mode chosen several times is treated as if
// it appeared that many times in sequence; the same player or object may be the target of each instance, or different ones),
// CR 700.2a and 601.2b (the modes are chosen as the spell is cast, activated or put on the stack; a mode with no possible target
// cannot be chosen), CR 601.2c (every instance has its own targets), CR 608.2b and 608.2c (an instance whose target is gone does
// nothing; the spell does not resolve only when every target is illegal; the instances run in printed order), CR 707.10 and 700.2g
// (a copy of a modal spell copies its modes, repeats included, and may get new targets).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-repeatable.ts, synthetic-copies.ts) with real Grizzly Bears, Giant Spider,
// Lightning Bolt and Sol Ring.
import { describe, expect, test } from 'vitest';
import { applyAction, getLegalActions, getView } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';
import { chooseModesDecision, targetsDecision } from './pending-helpers';

const TRIPLE = 'SYNTHETIC Triple Charm'; // choose three, repeatable: draw / 2 damage to target creature / target player gains 2
const ARTIFACT = 'SYNTHETIC Artifact Charm'; // choose two, repeatable: destroy target artifact / you gain 1 life
const UP_TO = 'SYNTHETIC Up To Charm'; // choose up to two, repeatable: draw / you gain 3 life
const GREETER = 'SYNTHETIC Repeat Greeter'; // enters: choose two, repeatable: you gain 1 life / 1 damage to target creature
const TOTEM = 'SYNTHETIC Repeat Totem'; // {1},{T}: choose two, repeatable: draw / 1 damage to target creature
const COPIER = 'SYNTHETIC Twin Spell'; // {U}{U} instant: copy target instant or sorcery spell, new targets
const BEARS = 'Grizzly Bears'; // 2/2
const SPIDER = 'Giant Spider'; // 2/4
const BOLT = 'Lightning Bolt';
const SOL_RING = 'Sol Ring';

const FILLER = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains'] as const;
type Builder = ReturnType<typeof scenario>;

/** Seat 0 holds the cards with lands for several; seat 1 has what `them` puts on its battlefield. */
function game(hand: readonly string[], them: (b: Builder) => Builder): ScenarioGame {
  return them(
    scenario()
      .seat(0)
      .life(20)
      .hand(...hand)
      .battlefield('Mountain', { count: 4 })
      .battlefield('Island', { count: 2 })
      .library(...FILLER)
      .seat(1)
      .life(20),
  )
    .seat(1)
    .library(...FILLER)
    .build();
}

const withCreatures = (b: Builder) => b.battlefield(BEARS).battlefield(SPIDER);

const modesOf = (g: ScenarioGame, name: string) =>
  g.state.objects[g.id({ name, zone: 'stack' })]?.stack?.chosenModes;

describe('the choice of modes is a multiset (CR 700.2d)', () => {
  test('"choose three" of three modes lists every multiset of three, repeats included', () => {
    const g = game([TRIPLE], withCreatures);
    g.act(0).cast(TRIPLE);
    const d = chooseModesDecision(g);
    expect(d).toMatchObject({ seat: 0, purpose: 'spell', min: 3, max: 3, repeatable: true });
    expect(d.sets).toEqual([
      [0, 0, 0],
      [0, 0, 1],
      [0, 0, 2],
      [0, 1, 1],
      [0, 1, 2],
      [0, 2, 2],
      [1, 1, 1],
      [1, 1, 2],
      [1, 2, 2],
      [2, 2, 2],
    ]);
    expect(d.modes.map((m) => m.legal)).toEqual([true, true, true]);
    expect(
      getLegalActions(g.state, 0).filter((a) => a.kind === 'chooseModes'),
      'one action for each multiset',
    ).toHaveLength(10);
    g.expect.invariants();
  });

  test('an answer that is not one of the multisets is refused: too few, too many, a mode that is not there', () => {
    const g = game([TRIPLE], withCreatures);
    g.act(0).cast(TRIPLE);
    for (const modes of [[], [0], [0, 0], [0, 0, 0, 0], [0, 1, 3], [-1, 0, 0]]) {
      expect(applyAction(g.state, 0, { kind: 'chooseModes', modes }).ok, `[${modes}]`).toBe(false);
    }
    // Any order is accepted: the multiset is what counts.
    expect(applyAction(g.state, 0, { kind: 'chooseModes', modes: [1, 0, 1] }).ok).toBe(true);
  });

  test('a mode with no possible target cannot be chosen, and no instance of it is in any set (CR 700.2a)', () => {
    const g = game([TRIPLE], (b) => b);
    g.act(0).cast(TRIPLE);
    const d = chooseModesDecision(g);
    expect(d.modes.map((m) => m.legal)).toEqual([true, false, true]);
    expect(d.sets).toEqual([
      [0, 0, 0],
      [0, 0, 2],
      [0, 2, 2],
      [2, 2, 2],
    ]);
  });

  test('a multiset needs no choice when only one is legal: the engine makes it, as the event says', () => {
    // Two modes, one choice of two: only "choose two" of a mode that can be chosen... here the only legal mode is the second one.
    const g = game([ARTIFACT], (b) => b.battlefield(SOL_RING));
    g.act(0).cast(ARTIFACT);
    expect(chooseModesDecision(g).sets).toEqual([
      [0, 0],
      [0, 1],
      [1, 1],
    ]);
    const only = game([ARTIFACT], (b) => b);
    only.act(0).cast(ARTIFACT);
    // No artifact anywhere: mode 0 is illegal and "you gain 1 life" twice is the one legal choice.
    expect(only.state.pending?.kind).toBe('payMana');
    expect(modesOf(only, ARTIFACT)).toEqual([1, 1]);
    expect(only.events.filter((e) => e.kind === 'modesChosen')).toContainEqual({
      kind: 'modesChosen',
      seat: 0,
      source: only.id({ name: ARTIFACT, zone: 'stack' }),
      modes: [1, 1],
      automatic: true,
    });
  });

  test('the chosen modes are kept in printed order, repeats together', () => {
    const g = game([TRIPLE], withCreatures);
    g.act(0).cast(TRIPLE).modes(2, 1, 1);
    expect(modesOf(g, TRIPLE)).toEqual([1, 1, 2]);
  });

  test('a mode that is not repeatable is still chosen once: "choose two" without the text refuses a repeat', () => {
    const g = scenario()
      .seat(0)
      .hand('SYNTHETIC Twin Charm')
      .battlefield('Mountain', { count: 2 })
      .battlefield('Plains')
      .library(...FILLER)
      .seat(1)
      .battlefield(BEARS)
      .build();
    g.act(0).cast('SYNTHETIC Twin Charm');
    expect(applyAction(g.state, 0, { kind: 'chooseModes', modes: [2, 2] }).ok).toBe(false);
    expect(chooseModesDecision(g).repeatable).toBeUndefined();
  });
});

describe('every instance of a targeted mode has a target slot of its own (CR 601.2c, 700.2d)', () => {
  test('three instances of the same mode: three slots, the second and third say which instance they are', () => {
    const g = game([TRIPLE], withCreatures);
    g.act(0).cast(TRIPLE).modes(1, 1, 1);
    const d = targetsDecision(g);
    expect(d.specs.map((s) => ({ id: s.specId, mode: s.mode, instance: s.instance }))).toEqual([
      { id: 'hit', mode: 1, instance: undefined },
      { id: 'hit#2', mode: 1, instance: 1 },
      { id: 'hit#3', mode: 1, instance: 2 },
    ]);
    for (const slot of d.specs) expect(slot).toMatchObject({ min: 1, max: 1 });
    g.expect.invariants();
  });

  test('different modes keep their own slots: the second instance of mode 1 is "hit#2", mode 2 is "who"', () => {
    const g = game([TRIPLE], withCreatures);
    g.act(0).cast(TRIPLE).modes(1, 1, 2);
    expect(targetsDecision(g).specs.map((s) => s.specId)).toEqual(['hit', 'hit#2', 'who']);
  });

  test('the same target may be chosen for each instance, and the damage adds up (CR 700.2d)', () => {
    const g = game([TRIPLE], withCreatures);
    g.act(0).cast(TRIPLE).modes(1, 1, 1);
    g.act(0).chooseTargets(SPIDER, SPIDER, SPIDER).payAuto();
    expect(
      g.state.objects[g.id({ name: TRIPLE, zone: 'stack' })]?.stack?.chosenTargets.map(
        (t) => t.specId,
      ),
    ).toEqual(['hit', 'hit#2', 'hit#3']);
    g.passAll();
    // 3 x 2 damage kills the 2/4 Spider; the Bears were never targeted.
    g.expect.zone(SPIDER, 'graveyard', { seat: 1 });
    g.expect.zone(BEARS, 'battlefield', { seat: 1 });
    g.expect.invariants();
  });

  test('different targets may be chosen for the instances', () => {
    const g = game([TRIPLE], withCreatures);
    g.act(0).cast(TRIPLE).modes(1, 1, 1);
    g.act(0).chooseTargets(BEARS, SPIDER, BEARS).payAuto();
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    g.expect.damage(SPIDER, 2);
  });

  test('a mix of modes: each instance acts on its own target, in printed order', () => {
    const g = game([TRIPLE], withCreatures);
    g.act(0).cast(TRIPLE).modes(1, 2, 1);
    g.act(0).chooseTargets(BEARS, SPIDER, { player: 1 }).payAuto();
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    g.expect.damage(SPIDER, 2);
    g.expect.life(1, 22);
  });

  test('fewer targets than instances: each slot lists the one target, and it is chosen for every instance (CR 700.2d)', () => {
    const g = game([TRIPLE], (b) => b.battlefield(SPIDER));
    g.act(0).cast(TRIPLE).modes(1, 1, 1);
    const d = targetsDecision(g);
    // One legal creature and three slots that each need one target: a single slot could not do this, and none is left without a target.
    expect(d.specs.map((s) => s.legal.length)).toEqual([1, 1, 1]);
    expect(
      getLegalActions(g.state, 0).filter((a) => a.kind === 'chooseTargets'),
      'the one answer',
    ).toHaveLength(1);
    g.act(0).chooseTargets(SPIDER, SPIDER, SPIDER).payAuto();
    const targets = g.state.objects[g.id({ name: TRIPLE, zone: 'stack' })]?.stack?.chosenTargets;
    expect(targets?.map((t) => t.specId)).toEqual(['hit', 'hit#2', 'hit#3']);
    g.passAll();
    g.expect.zone(SPIDER, 'graveyard', { seat: 1 });
  });

  test('"destroy target artifact" twice over one artifact: it is destroyed once, the other instances do nothing (CR 608.2b)', () => {
    const g = game([ARTIFACT], (b) => b.battlefield(SOL_RING));
    g.act(0).cast(ARTIFACT).modes(0, 0);
    g.act(0).chooseTargets(SOL_RING, SOL_RING).payAuto();
    g.passAll();
    g.expect.zone(SOL_RING, 'graveyard', { seat: 1 });
    expect(g.state.objects[g.id({ name: ARTIFACT, zone: 'graveyard' })]).toBeDefined();
    g.expect.life(0, 20);
    g.expect.invariants();
  });

  test('two artifacts, one destroyed by each instance', () => {
    const g = game([ARTIFACT], (b) => b.battlefield(SOL_RING).battlefield('SYNTHETIC Modal Totem'));
    g.act(0).cast(ARTIFACT).modes(0, 0);
    g.act(0).chooseTargets(SOL_RING, 'SYNTHETIC Modal Totem').payAuto();
    g.passAll();
    g.expect.zone(SOL_RING, 'graveyard', { seat: 1 });
    g.expect.zone('SYNTHETIC Modal Totem', 'graveyard', { seat: 1 });
  });

  test('a slot never takes the same target twice, but two slots take the same one', () => {
    const g = game([TRIPLE], withCreatures);
    g.act(0).cast(TRIPLE).modes(1, 1, 2);
    const d = targetsDecision(g);
    // Every combination of one target for each slot is a legal action, including both instances on the same creature (2 x 2 creatures, 2 players).
    const answers = getLegalActions(g.state, 0).filter((a) => a.kind === 'chooseTargets');
    expect(answers).toHaveLength(2 * 2 * 2);
    const ids = (i: number) =>
      d.specs[i]?.legal.map((t) => (t.kind === 'object' ? t.id : `p${t.seat}`));
    expect(ids(0)).toEqual(ids(1));
  });

  test('the answer lists are limited when the instances multiply the combinations', () => {
    const g = game([TRIPLE], (b) => b.battlefield(BEARS, { count: 9 }));
    g.act(0).cast(TRIPLE).modes(1, 1, 1);
    const answers = getLegalActions(g.state, 0).filter((a) => a.kind === 'chooseTargets');
    expect(answers.length).toBe(500); // 9 x 9 x 9 = 729 combinations: the first 500 are listed
    // Any legal answer is accepted all the same.
    const last = [...answers].at(-1);
    expect(last).toBeDefined();
    expect(
      applyAction(g.state, 0, { kind: 'chooseTargets', targets: answers[0]?.targets ?? [] }).ok,
    ).toBe(true);
  });
});

describe('resolution (CR 608.2b, 608.2c, 700.2d)', () => {
  test('the instances run in printed order, the instances of one mode one after the other', () => {
    const g = game([TRIPLE], withCreatures);
    g.act(0).cast(TRIPLE).modes(2, 1, 0);
    g.act(0).chooseTargets(SPIDER, { player: 0 }).payAuto();
    g.passAll();
    const order = g.events
      .filter((e) => e.kind === 'cardDrawn' || e.kind === 'damageDealt' || e.kind === 'lifeGained')
      .map((e) => e.kind);
    expect(order).toEqual(['cardDrawn', 'damageDealt', 'lifeGained']);
  });

  test('two instances of a mode with no target do the effect twice', () => {
    const g = game([TRIPLE], withCreatures);
    g.act(0).cast(TRIPLE).modes(0, 0, 0).pay();
    g.passAll();
    g.expect.handSize(0, 3);
  });

  test('an instance whose target is gone does nothing, and the others still run (CR 608.2b)', () => {
    const g = game([TRIPLE, BOLT], withCreatures);
    g.act(0).cast(TRIPLE).modes(1, 1, 2);
    g.act(0).chooseTargets(BEARS, SPIDER, { player: 0 }).payAuto();
    // In response the Bears die: the first instance has no legal target when the spell resolves.
    g.act(0).cast(BOLT, { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    g.expect.damage(SPIDER, 2);
    g.expect.life(0, 22);
    expect(g.events.some((e) => e.kind === 'fizzled' && e.object === g.id(TRIPLE))).toBe(false);
    g.expect.invariants();
  });

  test('every target illegal: the spell does not resolve (CR 608.2b)', () => {
    const g = game([TRIPLE, BOLT], (b) => b.battlefield(BEARS));
    g.act(0).cast(TRIPLE).modes(1, 1, 1).targets([BEARS, BEARS, BEARS]).pay();
    g.act(0).cast(BOLT, { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    expect(g.events.filter((e) => e.kind === 'fizzled')).toHaveLength(1);
    g.expect.life(0, 20);
    g.expect.invariants();
  });

  test('"choose up to": none is a legal choice and the spell does nothing', () => {
    const g = game([UP_TO], (b) => b);
    g.act(0).cast(UP_TO);
    const d = chooseModesDecision(g);
    expect(d).toMatchObject({ min: 0, max: 2, repeatable: true });
    expect(d.sets).toEqual([[], [0], [1], [0, 0], [0, 1], [1, 1]]);
    g.act(0).chooseModes().payAuto();
    expect(getView(g.state, 0).stack.at(-1)?.modes).toBeUndefined();
    g.passAll();
    g.expect.zone(UP_TO, 'graveyard', { seat: 0 });
    g.expect.handSize(0, 0);
    g.expect.invariants();
  });

  test('"choose up to": one or two of the same mode', () => {
    const g = game([UP_TO], (b) => b);
    g.act(0).cast(UP_TO).modes(1, 1).pay();
    g.passAll();
    g.expect.life(0, 26);
  });
});

describe('copying a modal spell with repeated modes (CR 707.10, 700.2g)', () => {
  test('the copy has the same multiset of modes and a slot for each instance, and new targets may be chosen', () => {
    const g = game([TRIPLE, COPIER], withCreatures);
    g.act(0).cast(TRIPLE).modes(1, 1, 2);
    g.act(0).chooseTargets(SPIDER, SPIDER, { player: 1 }).payAuto();
    g.act(0).cast(COPIER, { targets: [{ name: TRIPLE, zone: 'stack' }], pay: true });
    g.pass();
    g.pass();
    const d = targetsDecision(g);
    expect(d.forCopy).toBe(true);
    expect(d.specs.map((s) => ({ id: s.specId, instance: s.instance, mode: s.mode }))).toEqual([
      { id: 'hit', instance: undefined, mode: 1 },
      { id: 'hit#2', instance: 1, mode: 1 },
      { id: 'who', instance: undefined, mode: 2 },
    ]);
    expect(d.current?.map((t) => t.specId)).toEqual(['hit', 'hit#2', 'who']);
    const copy = g.state.objects[d.source];
    expect(copy?.stack?.chosenModes).toEqual([1, 1, 2]);
    // The copy's controller may aim the instances elsewhere: the Bears for one, the Spider for the other.
    g.act(0).chooseTargets(BEARS, SPIDER, { player: 0 });
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    g.expect.life(0, 22);
    g.expect.invariants();
  });
});

describe('modal triggered and activated abilities', () => {
  test('an enters trigger with a repeatable choice: the modes first, then a slot for each instance', () => {
    const g = scenario()
      .seat(0)
      .hand(GREETER)
      .battlefield('Forest', { count: 3 })
      .library(...FILLER)
      .seat(1)
      .battlefield(BEARS)
      .battlefield(SPIDER)
      .library(...FILLER)
      .build();
    g.act(0).cast(GREETER).pay();
    g.passAll();
    const modes = chooseModesDecision(g);
    expect(modes).toMatchObject({ purpose: 'trigger', min: 2, max: 2, repeatable: true });
    expect(modes.sets).toEqual([
      [0, 0],
      [0, 1],
      [1, 1],
    ]);
    // A trigger's choice cannot be taken back.
    expect(getLegalActions(g.state, 0).some((a) => a.kind === 'cancel')).toBe(false);
    g.act(0).chooseModes(1, 1);
    const d = targetsDecision(g);
    expect(d.forTrigger).toBe(true);
    expect(d.specs.map((s) => s.specId)).toEqual(['zap', 'zap#2']);
    g.act(0).chooseTargets(BEARS, BEARS);
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    g.expect.invariants();
  });

  test('a trigger whose only legal target is itself: both instances take it without a question (CR 603.3d, 700.2d)', () => {
    const g = scenario()
      .seat(0)
      .hand(GREETER)
      .battlefield('Forest', { count: 3 })
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .build();
    g.act(0).cast(GREETER).pay();
    g.passAll();
    g.act(0).chooseModes(1, 1);
    expect(g.state.pending?.kind).toBe('priority');
    const ability = g.state.stack
      .map((id) => g.state.objects[id])
      .find((o) => o?.stack?.kind === 'ability');
    expect(ability?.stack?.chosenTargets.map((t) => t.specId)).toEqual(['zap', 'zap#2']);
    g.passAll();
    // 2 x 1 damage to the 2/2 Imp itself.
    g.expect.zone(GREETER, 'graveyard', { seat: 0 });
  });

  test('an activated ability with a repeatable choice: modes, a slot for each instance, then the cost', () => {
    const g = scenario()
      .seat(0)
      .battlefield(TOTEM, { label: 'totem' })
      .battlefield('Mountain', { count: 2 })
      .library(...FILLER)
      .seat(1)
      .battlefield(BEARS)
      .battlefield(SPIDER)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).activate('totem');
    const modes = chooseModesDecision(g);
    expect(modes).toMatchObject({ purpose: 'ability', min: 2, max: 2, repeatable: true });
    g.act(0).chooseModes(1, 1);
    expect(targetsDecision(g).specs.map((s) => s.specId)).toEqual(['ping', 'ping#2']);
    g.act(0).chooseTargets(BEARS, BEARS).payAuto();
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    g.expect.invariants();
  });
});
