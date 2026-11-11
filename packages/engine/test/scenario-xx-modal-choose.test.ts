// Modal spells, part 1: choosing the modes (D-105, D-114).
// Pins: CR 700.2 (a modal spell has two or more options and its controller chooses a number of them),
// CR 700.2a and 601.2b (the controller chooses the modes as part of casting, before the targets),
// CR 700.2c and 601.2c (a mode that was not chosen has no targets; the targets of the chosen modes are
// asked together, in the order of the modes), CR 700.2d (the same mode is never chosen twice), CR 608.2c
// (the chosen modes run in the order they are printed). "Choose one", "choose two", "choose one or both"
// and "choose one or more" are `chooseModes { min, max }`.
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-modal.ts) with real Grizzly Bears and Giant Spider.
import { describe, expect, test } from 'vitest';
import { applyAction, getLegalActions, getView } from '../src/index';
import { scenario } from '../src/testing/index';
import { chooseModesDecision, targetsDecision } from './pending-helpers';

const THREE = 'SYNTHETIC Three Way Charm'; // choose one: 3 damage to target creature / draw / gain 3
const TWIN = 'SYNTHETIC Twin Charm'; // choose two: 2 damage to target creature / target player gains 3 / draw
const BOTH = 'SYNTHETIC Both Charm'; // choose one or both: draw / gain 4
const MANY = 'SYNTHETIC Many Charm'; // choose one or more: draw / gain 2 / 1 damage to target creature
const BEARS = 'Grizzly Bears';

/** Seat 0 holds `card` with `lands` Mountains (and Plains and Islands for the cards that need them). */
const game = (card: string) =>
  scenario()
    .seat(0)
    .hand(card)
    .battlefield('Mountain', { count: 3 })
    .battlefield('Plains', { count: 2 })
    .battlefield('Island', { count: 2 })
    .battlefield('Swamp', { count: 2 })
    .library('Plains', 'Plains', 'Plains', 'Plains')
    .seat(1)
    .battlefield(BEARS, { label: 'bears' })
    .build();

describe('choose one (CR 700.2, 700.2a, 601.2b)', () => {
  test('the engine asks first, lists one set for each legal mode and allows cancel', () => {
    const g = game(THREE);
    g.act(0).cast(THREE);
    const d = chooseModesDecision(g);
    expect(d).toMatchObject({
      seat: 0,
      purpose: 'spell',
      min: 1,
      max: 1,
      sourceName: THREE,
      sets: [[0], [1], [2]],
    });
    expect(d.source).toBe(g.id({ name: THREE, zone: 'stack' }));
    expect(d.modes.map((m) => m.legal)).toEqual([true, true, true]);
    expect(d.modes.map((m) => m.text)).toEqual([
      'Deals 3 damage to target creature.',
      'Draw a card.',
      'You gain 3 life.',
    ]);
    expect(d.forTrigger).toBeUndefined();
    expect(g.state.casting?.stage).toBe('modes');
    expect(g.legalActions(0)).toEqual([
      { kind: 'chooseModes', modes: [0] },
      { kind: 'chooseModes', modes: [1] },
      { kind: 'chooseModes', modes: [2] },
      { kind: 'cancel' },
      { kind: 'concede' },
    ]);
    g.expect.invariants();
  });

  test('mode 0 alone: its target is asked, nothing else runs', () => {
    const g = game(THREE);
    g.act(0).cast(THREE).modes(0);
    const t = targetsDecision(g);
    expect(t.specs.map((s) => ({ id: s.specId, mode: s.mode }))).toEqual([{ id: 'kill', mode: 0 }]);
    expect(g.state.casting?.stage).toBe('targets');
    expect(g.state.objects[t.source]?.stack?.chosenModes).toEqual([0]);
    g.act(0).chooseTargets('bears').payAuto();
    g.pass();
    g.pass();
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    g.expect.handSize(0, 0);
    g.expect.life(0, 40);
    g.expect.invariants();
  });

  test('mode 1 alone: no targets are asked and the card is drawn', () => {
    const g = game(THREE);
    g.act(0).cast(THREE).modes(1);
    g.expect.pending('payMana', 0);
    g.act(0).payAuto();
    g.pass();
    g.pass();
    g.expect.handSize(0, 1);
    g.expect.life(0, 40);
    g.expect.zone(BEARS, 'battlefield', { seat: 1 });
  });

  test('mode 2 alone: the life is gained', () => {
    const g = game(THREE);
    g.act(0).cast(THREE, { modes: [2], pay: true });
    g.pass();
    g.pass();
    g.expect.life(0, 43);
    g.expect.handSize(0, 0);
    g.expect.zone(BEARS, 'battlefield', { seat: 1 });
  });

  test('more or fewer modes than the spell allows are refused (CR 700.2)', () => {
    const g = game(THREE);
    g.act(0).cast(THREE);
    const before = g.hash();
    for (const bad of [[], [0, 1], [3], [-1], [1, 1], [0.5]]) {
      const r = applyAction(g.state, 0, { kind: 'chooseModes', modes: bad });
      expect(r.ok, JSON.stringify(bad)).toBe(false);
    }
    expect(g.hash()).toBe(before);
  });

  test('the other player cannot answer, and a wrong kind of action is refused', () => {
    const g = game(THREE);
    g.act(0).cast(THREE);
    expect(applyAction(g.state, 1, { kind: 'chooseModes', modes: [1] }).ok).toBe(false);
    expect(applyAction(g.state, 0, { kind: 'payAuto' }).ok).toBe(false);
    expect(applyAction(g.state, 0, { kind: 'chooseX', value: 1 }).ok).toBe(false);
  });
});

describe('choose two (CR 700.2, 700.2c, 601.2c)', () => {
  test('every pair is a legal set and the same mode is never twice (CR 700.2d)', () => {
    const g = game(TWIN);
    g.act(0).cast(TWIN);
    const d = chooseModesDecision(g);
    expect(d).toMatchObject({
      min: 2,
      max: 2,
      sets: [
        [0, 1],
        [0, 2],
        [1, 2],
      ],
    });
    for (const bad of [[0], [0, 0], [0, 1, 2]]) {
      expect(applyAction(g.state, 0, { kind: 'chooseModes', modes: bad }).ok).toBe(false);
    }
  });

  test('two modes with a target each: the slots come mode by mode, each tagged with its mode', () => {
    const g = game(TWIN);
    g.act(0).cast(TWIN).modes(0, 1);
    const t = targetsDecision(g);
    expect(t.specs.map((s) => [s.specId, s.mode])).toEqual([
      ['hit', 0],
      ['who', 1],
    ]);
    // Each slot offers the targets of its own mode: a creature, then a player.
    expect(t.specs[0]?.legal).toEqual([{ kind: 'object', id: g.id('bears'), specId: 'hit' }]);
    expect(t.specs[1]?.legal).toEqual([
      { kind: 'player', seat: 0, specId: 'who' },
      { kind: 'player', seat: 1, specId: 'who' },
    ]);
    g.act(0).chooseTargets('bears', { player: 0 }).payAuto();
    g.pass();
    g.pass();
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    g.expect.life(0, 43);
    g.expect.handSize(0, 0);
    g.expect.invariants();
  });

  test('a mode that was not chosen has no target to give (CR 700.2c)', () => {
    const g = game(TWIN);
    g.act(0).cast(TWIN).modes(0, 2);
    expect(targetsDecision(g).specs.map((s) => s.specId)).toEqual(['hit']);
    // A target for the unchosen mode is refused.
    const r = applyAction(g.state, 0, {
      kind: 'chooseTargets',
      targets: [
        { kind: 'object', id: g.id('bears'), specId: 'hit' },
        { kind: 'player', seat: 0, specId: 'who' },
      ],
    });
    expect(r.ok).toBe(false);
  });

  test('the effects run in printed order, whatever order the modes were named in', () => {
    const g = game(TWIN);
    const mark = g.mark();
    // 2 and 0 named backwards; 0 (damage) is printed before 2 (draw).
    g.act(0).cast(TWIN).modes(2, 0);
    expect(g.state.objects[g.id({ name: TWIN, zone: 'stack' })]?.stack?.chosenModes).toEqual([
      0, 2,
    ]);
    g.act(0).chooseTargets('bears').payAuto();
    g.pass();
    g.pass();
    const kinds = g.eventsSince(mark).map((e) => e.kind);
    expect(kinds.indexOf('damageDealt')).toBeGreaterThan(-1);
    expect(kinds.indexOf('cardDrawn')).toBeGreaterThan(kinds.indexOf('damageDealt'));
    g.expect.handSize(0, 1);
  });

  test('the modesChosen event names the spell and the modes in printed order', () => {
    const g = game(TWIN);
    const mark = g.mark();
    g.act(0).cast(TWIN).modes(2, 1);
    const stack = g.id({ name: TWIN, zone: 'stack' });
    g.expect.eventLog(
      [{ kind: 'modesChosen', seat: 0, source: stack, modes: [1, 2], automatic: false }],
      { since: mark },
    );
  });
});

describe('choose one or both (CR 700.2)', () => {
  test('the sets are each mode alone, then both, fewest first', () => {
    const g = game(BOTH);
    g.act(0).cast(BOTH);
    expect(chooseModesDecision(g)).toMatchObject({ min: 1, max: 2, sets: [[0], [1], [0, 1]] });
  });

  test('choosing both runs both: a card and 4 life', () => {
    const g = game(BOTH);
    g.act(0).cast(BOTH, { modes: [0, 1], pay: true });
    g.pass();
    g.pass();
    g.expect.handSize(0, 1);
    g.expect.life(0, 44);
  });

  test('choosing one runs only that one', () => {
    const g = game(BOTH);
    g.act(0).cast(BOTH, { modes: [1], pay: true });
    g.pass();
    g.pass();
    g.expect.handSize(0, 0);
    g.expect.life(0, 44);
  });
});

describe('choose one or more (CR 700.2)', () => {
  test('every non-empty set of the three modes is legal, 7 in all', () => {
    const g = game(MANY);
    g.act(0).cast(MANY);
    expect(chooseModesDecision(g).sets).toEqual([[0], [1], [2], [0, 1], [0, 2], [1, 2], [0, 1, 2]]);
    expect(chooseModesDecision(g)).toMatchObject({ min: 1, max: 3 });
  });

  test('all three: the targeted mode asks for its target and all three run', () => {
    const g = game(MANY);
    g.act(0).cast(MANY).modes(0, 1, 2);
    expect(targetsDecision(g).specs.map((s) => [s.specId, s.mode])).toEqual([['ping', 2]]);
    g.act(0).chooseTargets('bears').payAuto();
    g.pass();
    g.pass();
    g.expect.handSize(0, 1);
    g.expect.life(0, 42);
    g.expect.damage(BEARS, 1);
  });
});

describe('what the player and the other seat can see', () => {
  test('the stack object shows the chosen modes and their text; nothing after it resolves', () => {
    const g = game(TWIN);
    g.act(0).cast(TWIN, { modes: [1, 2] });
    g.act(0).chooseTargets({ player: 1 }).payAuto();
    for (const seat of [0, 1] as const) {
      const spell = getView(g.state, seat).stack[0];
      expect(spell?.modes).toEqual([1, 2]);
      expect(spell?.modeTexts).toEqual([
        'Deals 2 damage to target creature.',
        'Target player gains 3 life.',
        'Draw a card.',
      ]);
    }
    g.pass();
    g.pass();
    expect(getView(g.state, 0).stack).toEqual([]);
    g.expect.life(1, 43);
    g.expect.handSize(0, 1);
  });

  test('an object with no modes chosen has none in the view', () => {
    const g = game(THREE);
    expect(getView(g.state, 0).seats[0]?.hand?.[0]?.modes).toBeUndefined();
  });

  test('the same actions give the same state (determinism)', () => {
    const run = () => {
      const g = game(MANY);
      g.act(0).cast(MANY, { modes: [0, 2] });
      g.act(0).chooseTargets('bears').payAuto();
      g.pass();
      g.pass();
      return g.hash();
    };
    expect(run()).toBe(run());
  });

  test('getLegalActions lists exactly what applyAction accepts at the modes decision', () => {
    const g = game(MANY);
    g.act(0).cast(MANY);
    const legal = getLegalActions(g.state, 0);
    for (const a of legal) expect(applyAction(g.state, 0, a).ok, JSON.stringify(a)).toBe(true);
    expect(legal.filter((a) => a.kind === 'chooseModes')).toHaveLength(7);
    expect(getLegalActions(g.state, 1)).toEqual([]);
  });
});
