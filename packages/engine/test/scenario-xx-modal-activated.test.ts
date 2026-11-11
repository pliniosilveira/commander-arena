// Modal activated abilities (D-105, D-114).
// Pins: CR 602.2b and 700.2a (the modes of an activated ability are chosen as it is activated, in the order of
// CR 601.2b-c: the modes, then X, then the targets of the chosen modes, then the costs), CR 700.2a (a mode
// that would be illegal for want of legal targets cannot be chosen, and an ability with no legal mode is not
// offered), CR 733 (cancel rewinds the activation), CR 608.2b (a mode with an illegal target does nothing).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-modal.ts) with real Grizzly Bears and Sol Ring.
import { describe, expect, test } from 'vitest';
import { applyAction, getLegalActions } from '../src/index';
import { scenario } from '../src/testing/index';
import { chooseModesDecision } from './pending-helpers';

const TOTEM = 'SYNTHETIC Modal Totem'; // {1},{T}: choose one: draw / 2 damage to target creature / gain 2
const PICKY = 'SYNTHETIC Picky Totem'; // {T}: choose one: 2 damage to opposing creature / destroy opposing artifact
const CHARM = 'SYNTHETIC Three Way Charm';
const BEARS = 'Grizzly Bears';
const SOL_RING = 'Sol Ring';

const totemGame = () =>
  scenario()
    .seat(0)
    .battlefield(TOTEM, { label: 'totem' })
    .battlefield('Mountain', { count: 2 })
    .library('Plains', 'Plains', 'Plains')
    .seat(1)
    .battlefield(BEARS, { label: 'bears' })
    .build();

describe('activating a modal ability (CR 602.2b, 700.2a)', () => {
  test('the modes are asked first, for the ability on the stack, with cancel', () => {
    const g = totemGame();
    g.act(0).activate('totem');
    const d = chooseModesDecision(g);
    expect(d).toMatchObject({
      seat: 0,
      purpose: 'ability',
      min: 1,
      max: 1,
      sets: [[0], [1], [2]],
      sourceName: TOTEM,
    });
    expect(d.forTrigger).toBeUndefined();
    // The ability is the question's source, an object on the stack that is not a card; nothing is paid yet.
    const top = g.state.objects[d.source];
    expect(top?.stack?.kind).toBe('ability');
    expect(top?.stack?.source).toBe(g.id('totem'));
    expect(g.state.casting?.stage).toBe('modes');
    g.expect.tapped('totem', false);
    expect(getLegalActions(g.state, 0).map((a) => a.kind)).toEqual([
      'chooseModes',
      'chooseModes',
      'chooseModes',
      'cancel',
      'concede',
    ]);
    g.expect.invariants();
  });

  test('cancel gives back the exact position', () => {
    const g = totemGame();
    const before = g.positionHash();
    g.act(0).activate('totem');
    g.act(0).cancel();
    expect(g.positionHash()).toBe(before);
    g.expect.pending('priority', 0);
    g.expect.stack([]);
  });

  test('the damage mode asks for its target, then the cost; the other modes have no target', () => {
    const g = totemGame();
    g.act(0).activate('totem').modes(1);
    const t = g.state.pending;
    if (t?.kind !== 'targets') throw new Error(`expected targets, got ${t?.kind}`);
    expect(t.specs.map((s) => [s.specId, s.mode])).toEqual([['zap', 1]]);
    expect(t.forTrigger).toBeUndefined();
    g.act(0).chooseTargets('bears');
    g.expect.pending('payMana', 0);
    g.act(0).payAuto();
    g.expect.tapped('totem', true);
    expect(g.view(0).stack[0]?.modes).toEqual([1]);
    g.pass();
    g.pass();
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    g.expect.stack([]);
  });

  test('the draw mode goes straight to the cost', () => {
    const g = totemGame();
    g.act(0).activate('totem', { modes: [0], pay: true });
    g.pass();
    g.pass();
    g.expect.handSize(0, 1);
    g.expect.life(0, 40);
  });

  test('the life mode', () => {
    const g = totemGame();
    g.act(0).activate('totem', { modes: [2], pay: true });
    g.pass();
    g.pass();
    g.expect.life(0, 42);
  });

  test('the target of the chosen mode is gone when the ability resolves: it does nothing (CR 608.2b)', () => {
    const g = scenario()
      .seat(0)
      .battlefield(TOTEM, { label: 'totem' })
      .battlefield('Mountain', { count: 2 })
      .seat(1)
      .hand(CHARM)
      .battlefield('Mountain', { count: 2 })
      .battlefield(BEARS, { label: 'bears' })
      .build();
    g.act(0).activate('totem', { modes: [1], targets: ['bears'], pay: true });
    g.pass(0);
    // The other player kills their own Bears with a charm in response.
    g.act(1).cast(CHARM, { modes: [0], targets: ['bears'], pay: true });
    const mark = g.mark();
    g.pass(1);
    g.pass(0);
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    g.pass(0);
    g.pass(1);
    g.expect.eventLog([{ kind: 'fizzled' }], { since: mark });
    g.expect.stack([]);
    g.expect.invariants();
  });

  test('an answer that is not a legal set is refused', () => {
    const g = totemGame();
    g.act(0).activate('totem');
    for (const bad of [[], [0, 1], [3]]) {
      expect(applyAction(g.state, 0, { kind: 'chooseModes', modes: bad }).ok).toBe(false);
    }
  });
});

describe('a mode with no legal target cannot be chosen; an ability with none is not offered (CR 700.2a)', () => {
  test('no creature to hit: the damage mode is not on offer', () => {
    const g = scenario()
      .seat(0)
      .battlefield(TOTEM, { label: 'totem' })
      .battlefield('Mountain', { count: 2 })
      .seat(1)
      .build();
    g.act(0).activate('totem');
    expect(chooseModesDecision(g)).toMatchObject({ sets: [[0], [2]] });
    expect(chooseModesDecision(g).modes.map((m) => m.legal)).toEqual([true, false, true]);
  });

  test('every mode needs a target and there is none: the ability is not offered at all', () => {
    const g = scenario().seat(0).battlefield(PICKY, { label: 'picky' }).seat(1).build();
    g.expect.illegal(0, { activate: 'picky' });
    const r = applyAction(g.state, 0, {
      kind: 'activate',
      object: g.id('picky'),
      abilityIndex: 0,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('no legal targets');
  });

  test('with one mode legal the engine chooses it and goes straight on', () => {
    const g = scenario()
      .seat(0)
      .battlefield(PICKY, { label: 'picky' })
      .seat(1)
      .battlefield(SOL_RING, { label: 'ring' })
      .build();
    g.expect.legal(0, { activate: 'picky' });
    const mark = g.mark();
    g.act(0).activate('picky');
    // Chosen without a question, so the next thing is the targets decision (a lone legal artifact: still asked).
    const top = g.state.stack[0];
    expect(top && g.state.objects[top]?.stack?.chosenModes).toEqual([1]);
    g.expect.eventLog([{ kind: 'modesChosen', modes: [1], automatic: true }], { since: mark });
    g.expect.invariants();
  });
});
