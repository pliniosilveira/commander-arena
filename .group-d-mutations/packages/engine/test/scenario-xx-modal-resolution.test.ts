// Modal spells, part 3: resolution, kicker and X (D-105, D-114).
// Pins: CR 608.2b (a spell whose every target became illegal does not resolve; otherwise it resolves, and a
// part of it whose target is illegal does nothing while the rest still happens), CR 700.2c (a mode that
// was not chosen has no target, so only the targets of the chosen modes count), CR 601.2b (the order of the
// announcements: the modes, then kicker, then X, then the targets, CR 601.2c), CR 107.3a (X is announced
// once for the whole spell and every mode reads it), CR 733 (cancel rewinds each stage).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-modal.ts) with real Grizzly Bears.
import { describe, expect, test } from 'vitest';
import { type ScenarioGame, scenario } from '../src/testing/index';

const THREE = 'SYNTHETIC Three Way Charm'; // choose one: 3 damage to target creature / draw / gain 3
const SPLIT = 'SYNTHETIC Split Strike'; // choose one or both: 2 damage to target creature / target opponent
const MANY = 'SYNTHETIC Many Charm'; // choose one or more: draw / gain 2 / 1 damage to target creature
const KICKED = 'SYNTHETIC Kicked Charm'; // {R}, kicker {1}: choose one: 2 damage to target creature / draw
const XCHARM = 'SYNTHETIC X Charm'; // {X}{R}: choose one: X damage to target creature / draw X
const BEARS = 'Grizzly Bears';
const SPIDER = 'Giant Spider'; // 2/4

/**
 * Seat 0 holds `card` and has the mana; seat 1 holds a Three Way Charm to answer with, Mountains, and a
 * Grizzly Bears that the spell aims at.
 */
const duel = (card: string) =>
  scenario()
    .seat(0)
    .hand(card)
    .battlefield('Mountain', { count: 6 })
    .battlefield('Swamp')
    .library('Plains', 'Plains', 'Plains', 'Plains')
    .seat(1)
    .hand(THREE)
    .battlefield('Mountain', { count: 2 })
    .battlefield(BEARS, { label: 'bears' })
    .build();

/** Seat 1 answers with its own Three Way Charm, killing its own Bears (3 damage): the target is gone. */
function killBearsInResponse(g: ScenarioGame): void {
  g.pass(0);
  g.act(1).cast(THREE, { modes: [0], targets: ['bears'], pay: true });
}

describe('fizzling (CR 608.2b)', () => {
  test('the only target of the only chosen mode is gone: the spell does nothing', () => {
    const g = duel(THREE);
    g.act(0).cast(THREE, { modes: [0], targets: ['bears'], pay: true });
    killBearsInResponse(g);
    const mark = g.mark();
    g.pass(1);
    g.pass(0); // the answer resolves: the Bears die
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    g.pass(0);
    g.pass(1); // the original spell resolves, finds no legal target
    g.expect.eventLog([{ kind: 'fizzled' }], { since: mark });
    g.expect.zone(THREE, 'graveyard', { seat: 0 });
    g.expect.invariants();
  });

  test('one chosen mode lost its target but another has one: that mode does nothing, the other happens', () => {
    const g = duel(SPLIT);
    g.act(0).cast(SPLIT, { modes: [0, 1], targets: ['bears', { player: 1 }], pay: true });
    killBearsInResponse(g);
    g.pass(1);
    g.pass(0);
    g.pass(0);
    g.pass(1);
    // The Bears were already dead; the spell resolved and the opponent took its 2 damage (608.2b).
    g.expect.life(1, 38);
    g.expect.noEvent({ kind: 'fizzled' });
    g.expect.zone(SPLIT, 'graveyard', { seat: 0 });
  });

  test('every chosen mode with a target lost it: it fizzles, and a mode with no target does not save it', () => {
    const g = duel(MANY);
    // Draw (no target) and 1 damage to target creature: the spell has one target, and it is gone.
    g.act(0).cast(MANY, { modes: [0, 2], targets: ['bears'], pay: true });
    killBearsInResponse(g);
    const mark = g.mark();
    g.pass(1);
    g.pass(0);
    g.pass(0);
    g.pass(1);
    g.expect.eventLog([{ kind: 'fizzled' }], { since: mark });
    g.expect.handSize(0, 0); // the draw did not happen: the spell never resolved
  });

  test('a chosen set with no targets at all cannot fizzle', () => {
    const g = duel(MANY);
    g.act(0).cast(MANY, { modes: [0, 1], pay: true });
    killBearsInResponse(g);
    g.pass(1);
    g.pass(0);
    g.pass(0);
    g.pass(1);
    g.expect.noEvent({ kind: 'fizzled' });
    g.expect.handSize(0, 1);
    g.expect.life(0, 42);
  });

  test('the target of a mode that was not chosen does not count: the spell still resolves', () => {
    const g = duel(MANY);
    // Only the targetless modes are chosen, so nothing the spell does depends on the Bears.
    g.act(0).cast(MANY, { modes: [1], pay: true });
    killBearsInResponse(g);
    g.pass(1);
    g.pass(0);
    g.pass(0);
    g.pass(1);
    g.expect.noEvent({ kind: 'fizzled' });
    g.expect.life(0, 42);
  });
});

describe('kicker and modes (CR 601.2b)', () => {
  const kickedDuel = () =>
    scenario()
      .seat(0)
      .hand(KICKED)
      .battlefield('Mountain', { count: 3 })
      .library('Plains', 'Plains')
      .seat(1)
      .battlefield(BEARS, { label: 'bears' })
      .battlefield(SPIDER, { label: 'spider' })
      .build();

  test('the order is modes, then kicker, then targets, then payment', () => {
    const g = kickedDuel();
    g.act(0).cast(KICKED);
    g.expect.pending('chooseModes', 0);
    g.act(0).chooseModes(0);
    g.expect.pending('confirmOptional', 0);
    expect(g.state.casting?.stage).toBe('kicker');
    g.act(0).accept();
    g.expect.pending('targets', 0);
    g.act(0).chooseTargets('bears');
    g.expect.pending('payMana', 0);
    expect([...(g.state.casting?.totalCost ?? [])].sort()).toEqual(['1', 'R']);
    g.act(0).payAuto();
    expect(getKicked(g)).toBe(true);
    g.pass();
    g.pass();
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
  });

  test('a mode with no target goes from the kicker question straight to the payment', () => {
    const g = kickedDuel();
    g.act(0).cast(KICKED, { modes: [1] });
    g.act(0).decline();
    g.expect.pending('payMana', 0);
    expect(g.state.casting?.totalCost).toEqual(['R']);
    g.act(0).payAuto();
    g.pass();
    g.pass();
    g.expect.handSize(0, 1);
  });

  test('cancel at the kicker question rewinds the modes too', () => {
    const g = kickedDuel();
    const before = g.positionHash();
    g.act(0).cast(KICKED, { modes: [0] });
    g.act(0).cancel();
    expect(g.positionHash()).toBe(before);
  });

  test('the modes are asked before the kicker even when the kicker is not offered', () => {
    // One Mountain: the kicked total cannot be paid, so the kicker question is skipped, the modes are not.
    const g = scenario()
      .seat(0)
      .hand(KICKED)
      .battlefield('Mountain')
      .library('Plains', 'Plains')
      .seat(1)
      .battlefield(BEARS)
      .build();
    g.act(0).cast(KICKED);
    g.expect.pending('chooseModes', 0);
    g.act(0).chooseModes(1);
    g.expect.pending('payMana', 0);
  });
});

function getKicked(g: ScenarioGame): boolean {
  return g.view(0).stack[0]?.kicked === true;
}

describe('X and modes (CR 107.3a, 601.2b)', () => {
  const xGame = () =>
    scenario()
      .seat(0)
      .hand(XCHARM)
      .battlefield('Mountain', { count: 5 })
      .library('Plains', 'Plains', 'Plains', 'Plains', 'Plains')
      .seat(1)
      .battlefield(BEARS, { label: 'bears' })
      .build();

  test('the modes come first, then X, then the targets; every mode reads the one X', () => {
    const g = xGame();
    g.act(0).cast(XCHARM);
    g.expect.pending('chooseModes', 0);
    g.act(0).chooseModes(0);
    g.expect.pending('chooseX', 0);
    expect(g.state.casting?.stage).toBe('x');
    g.act(0).chooseX(3);
    g.expect.pending('targets', 0);
    g.act(0).chooseTargets('bears');
    g.expect.pending('payMana', 0);
    expect(g.state.casting?.totalCost).toEqual(['3', 'R']);
    g.act(0).payAuto();
    g.pass();
    g.pass();
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
  });

  test('the other mode draws X cards', () => {
    const g = xGame();
    g.act(0).cast(XCHARM, { modes: [1], x: 3, pay: true });
    g.pass();
    g.pass();
    g.expect.handSize(0, 3);
    g.expect.zone(BEARS, 'battlefield', { seat: 1 });
  });

  test('cancel at X rewinds the modes', () => {
    const g = xGame();
    const before = g.positionHash();
    g.act(0).cast(XCHARM, { modes: [1] });
    g.expect.pending('chooseX', 0);
    g.act(0).cancel();
    expect(g.positionHash()).toBe(before);
  });
});
