// "Return a land you control to its owner's hand" (D-092 primitive 5): a bounce land.
// Pins: CR 608.2d: the controller of the ability chooses among the options as it resolves, but not
// an option that is impossible, so with no land to return nothing happens and with exactly one the
// choice is made for them; CR 400.3: a card goes to its owner's hand; CR 400.7: the land that
// returns is a new object in the hand; CR 614.1c: the land enters tapped; CR 603.3: the enters
// trigger waits on the stack until a player passes priority, where the opponent may respond (here
// by destroying the land); CR 305.2: playing the bounce land is the turn's land play.
// Cards: SYNTHETIC Bounce Land (src/cards/fixtures/synthetic-references.ts), SYNTHETIC Test Rock
// Slide (an instant, defined here: "Destroy target land."), and the real Forest, Island and Mountain.
import { describe, expect, test } from 'vitest';
import { type ScenarioGame, scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';

const BOUNCE = 'SYNTHETIC Bounce Land';
const SLIDE = 'SYNTHETIC Test Rock Slide';

const slide = singleFaceCard({
  name: SLIDE,
  manaCost: ['R'],
  types: ['instant'],
  colors: ['R'],
  colorIdentity: ['R'],
  oracleText: 'Destroy target land.',
  spell: {
    targets: [
      { id: 't1', what: { kind: 'object', filter: { zone: 'battlefield', types: ['land'] } } },
    ],
    effect: { kind: 'destroy', objects: { kind: 'target', id: 't1' } },
  },
});

const ability = `${BOUNCE} (ability)`;

function play(g: ScenarioGame) {
  g.act(0).playLand(BOUNCE);
  return g;
}

describe('the only land: it returns itself', () => {
  test('the enters trigger waits on the stack, then the land goes back without a question', () => {
    const g = play(scenario().seat(0).hand(BOUNCE).seat(1).build());
    g.expect.stack([ability]);
    expect(g.object(BOUNCE).tapped).toBe(true);
    g.expect.noEvent({ kind: 'permanentsChosen' });
    const mark = g.mark();
    g.passAll();
    g.expect.zone(BOUNCE, 'hand', { seat: 0 });
    g.expect.noObject(BOUNCE, { zone: 'battlefield' });
    g.expect.eventLog(
      [
        { kind: 'permanentsChosen', seat: 0, purpose: 'effect', automatic: true },
        { kind: 'zoneChanged' },
      ],
      { since: mark },
    );
    g.expect.pending('priority', 0);
    g.expect.invariants();
  });

  test('playing it used the land drop, so the card in hand cannot be played again this turn', () => {
    const g = play(scenario().seat(0).hand(BOUNCE).seat(1).build());
    g.passAll();
    // A land was already played this turn (CR 305.2): no second play. It is a new object in the hand.
    g.expect.zone(BOUNCE, 'hand', { seat: 0 });
    expect(g.act(0).try.playLand(BOUNCE).ok).toBe(false);
  });
});

describe('several lands: the controller chooses', () => {
  const build = () =>
    scenario()
      .seat(0)
      .hand(BOUNCE)
      .battlefield('Forest', { label: 'forest' })
      .battlefield('Island', { label: 'island', tapped: true })
      .seat(1)
      .battlefield('Mountain', { label: 'mountain' })
      .build();

  test('the legal choices are the lands the controller controls, the bounce land included', () => {
    const g = play(build());
    g.passAll();
    g.expect.pending('choosePermanent', 0);
    const d = g.state.pending;
    if (d?.kind !== 'choosePermanent') throw new Error('expected choosePermanent');
    expect(d.purpose).toBe('effect');
    expect(d.min).toBe(1);
    expect(d.max).toBe(1);
    expect([...d.legal].sort()).toEqual([g.id('forest'), g.id('island'), g.id(BOUNCE)].sort());
    expect(d.legal).not.toContain(g.id('mountain'));
    expect(d.source).toBe(g.state.stack[0]);
  });

  test('returning another land: it goes to its owner’s hand, the bounce land stays tapped', () => {
    const g = play(build());
    g.passAll();
    const mark = g.mark();
    g.act(0).choosePermanents('island');
    expect(g.object('island').zone).toBe('hand');
    g.expect.zone(BOUNCE, 'battlefield', { seat: 0 });
    expect(g.object(BOUNCE).tapped).toBe(true);
    g.expect.zone('Forest', 'battlefield', { seat: 0 });
    g.expect.eventLog(
      [
        { kind: 'permanentsChosen', seat: 0, purpose: 'effect', automatic: false },
        { kind: 'zoneChanged' },
      ],
      { since: mark },
    );
    g.expect.pending('priority', 0);
    g.expect.invariants();
  });

  test('returning the bounce land itself is a legal choice', () => {
    const g = play(build());
    g.passAll();
    g.act(0).choosePermanents(BOUNCE);
    g.expect.zone(BOUNCE, 'hand', { seat: 0 });
    g.expect.zone('Forest', 'battlefield', { seat: 0 });
  });

  test('an opponent’s land, no land, or two lands is not an answer', () => {
    const g = play(build());
    g.passAll();
    const answer = (...labels: string[]) =>
      g.act(0).try.action({ kind: 'choosePermanents', objects: labels.map((l) => g.id(l)) }).ok;
    expect(answer('mountain')).toBe(false);
    expect(answer()).toBe(false);
    expect(answer('forest', 'island')).toBe(false);
    g.expect.pending('choosePermanent', 0);
  });

  test('the opponent never makes the choice, and the question is the controller’s alone', () => {
    const g = play(build());
    g.passAll();
    expect(g.act(1).try.action({ kind: 'choosePermanents', objects: [g.id('mountain')] }).ok).toBe(
      false,
    );
    expect(g.state.pending?.seat).toBe(0);
  });
});

describe('no land to return', () => {
  test('the land was destroyed in response: nothing is chosen, nothing breaks', () => {
    const g = scenario()
      .seat(0)
      .hand(BOUNCE)
      .seat(1)
      .hand(SLIDE)
      .battlefield('Mountain')
      .define(slide)
      .build();
    play(g);
    g.act(0).pass();
    g.act(1).cast(SLIDE, { targets: [BOUNCE], pay: true });
    g.passAll();
    g.expect.zone(BOUNCE, 'graveyard', { seat: 0 });
    g.expect.noEvent({ kind: 'permanentsChosen' });
    g.expect.stack([]);
    g.expect.pending('priority', 0);
    g.expect.invariants();
  });
});
