// "You may pay {1}. When you do, choose one — ..." and "Whenever this creature attacks, you may pay {1}{U}. When you do, tap target creature an opponent controls." (D-1501, group 1 of the
// Hylda deck): a reflexive ability that the payment itself creates, with its modes or its target chosen as it goes on the stack.
// Pins: CR 603.12 (a reflexive triggered ability triggers because of what happened earlier in the resolution that created it, here the payment), CR 603.3c and 700.2b (the modes of a modal
// triggered ability are chosen as it is put on the stack), CR 603.3d (its targets are chosen then), CR 118.3 (a cost that cannot be paid is not paid, so nobody is asked), CR 701.22 (scry).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-hylda-g1.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const WARLOCK = 'SYNTHETIC Frost Warlock'; // tap an untapped creature of an opponent: may pay {1}; when you do, choose one of three modes
const SENTRY = 'SYNTHETIC Chill Sentry'; // attacks: may pay {1}{U}; when you do, tap target creature an opponent controls
const TOUCH = 'SYNTHETIC Frost Touch'; // instant: tap target creature
const BEARS = 'Grizzly Bears';
const SPIDER = 'Giant Spider';
const LIBRARY = Array.from({ length: 8 }, () => 'Island');

describe('the cards are valid', () => {
  test.each([WARLOCK, SENTRY])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });
});

const defs = () =>
  scenario()
    .define(syntheticCard(WARLOCK))
    .define(syntheticCard(SENTRY))
    .define(syntheticCard(TOUCH));

describe('Hylda: "Whenever you tap an untapped creature an opponent controls, you may pay {1}. When you do, choose one —"', () => {
  const board = (lands = 3) =>
    defs()
      .seat(0)
      .library(...LIBRARY)
      .hand(TOUCH)
      .battlefield(...Array.from({ length: lands }, () => 'Island'))
      .battlefield(WARLOCK)
      .battlefield(BEARS, { label: 'mine' })
      .seat(1)
      .library(...LIBRARY)
      .battlefield(SPIDER, { label: 'spider' })
      .at('precombatMain', { active: 0 })
      .build();

  const payAndChoose = (g: ReturnType<typeof board>, mode: number) => {
    g.act(0).cast(TOUCH, { targets: ['spider'], pay: true });
    g.passAll();
    // The trigger is on the stack; it resolves and asks whether to pay {1}.
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    g.act(0).payAuto();
    // The reflexive ability goes on the stack and its controller chooses a mode (CR 603.3c).
    g.expect.pending('chooseModes', 0);
    g.act(0).chooseModes(mode);
  };

  test('paid, mode 1: a 4/4 white and blue Elemental token', () => {
    const g = board();
    payAndChoose(g, 0);
    g.passAll();
    g.expect.zone('Elemental', 'battlefield', { seat: 0, count: 1 });
    g.expect.pt('Elemental', 4, 4);
    g.expect.invariants();
  });

  test('paid, mode 2: a +1/+1 counter on each creature you control', () => {
    const g = board();
    payAndChoose(g, 1);
    g.passAll();
    g.expect.pt('mine', 3, 3);
    g.expect.pt(WARLOCK, 4, 5);
    g.expect.pt('spider', 2, 4);
    g.expect.invariants();
  });

  test('paid, mode 3: scry 2, then draw a card', () => {
    const g = board();
    payAndChoose(g, 2);
    g.passAll();
    g.expect.pending('arrangeCards', 0);
    g.act(0).arrange({ top: ['Island[0]', 'Island[1]'] });
    g.expect.zone('Island', 'hand', { seat: 0, count: 1 });
    g.expect.invariants();
  });

  test('not paid (declined): nothing happens and no mode is asked', () => {
    const g = board();
    g.act(0).cast(TOUCH, { targets: ['spider'], pay: true });
    g.passAll();
    g.act(0).decline();
    g.expect.zone('Elemental', 'battlefield', { seat: 0, count: 0 });
    g.expect.pt('mine', 2, 2);
  });

  test('a mana that cannot be paid: nobody is asked (CR 118.3)', () => {
    // Two lands: the Touch costs one, the other is left for the payment; with only one land the {1} could not be paid after the spell.
    const g = board(1);
    g.act(0).cast(TOUCH, { targets: ['spider'], pay: true });
    g.passAll();
    g.expect.zone('Elemental', 'battlefield', { seat: 0, count: 0 });
    g.expect.pt('mine', 2, 2);
  });

  test('the creature is tapped by its controller (it attacks): nothing', () => {
    const g = defs()
      .seat(0)
      .library(...LIBRARY)
      .battlefield('Island', 'Island')
      .battlefield(WARLOCK)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(SPIDER, { label: 'spider' })
      .at('precombatMain', { active: 1 })
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(1).attack('spider');
    g.expect.zone('Elemental', 'battlefield', { seat: 0, count: 0 });
  });
});

describe('Icewrought Sentry: "Whenever this creature attacks, you may pay {1}{U}. When you do, tap target creature an opponent controls."', () => {
  const board = (lands: number) =>
    defs()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(...Array.from({ length: lands }, () => 'Island'))
      .battlefield(SENTRY)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS, { label: 'bears' })
      .battlefield(SPIDER, { label: 'spider' })
      .at('precombatMain', { active: 0 })
      .build();

  test('paid: the reflexive ability taps the target, and the creature taps untapped one, so it gets +2/+1', () => {
    const g = board(2);
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack(SENTRY);
    // Vigilance: it did not tap as it attacked.
    g.expect.tapped(SENTRY, false);
    g.passAll();
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    g.act(0).payAuto();
    g.expect.pending('targets', 0);
    g.act(0).chooseTargets('spider');
    g.passAll();
    g.expect.tapped('spider');
    g.expect.pt(SENTRY, 4, 4);
    g.expect.invariants();
  });

  test('declined: nothing is tapped', () => {
    const g = board(2);
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack(SENTRY);
    g.passAll();
    g.act(0).decline();
    g.expect.tapped('spider', false);
    g.expect.tapped('bears', false);
    g.expect.pt(SENTRY, 2, 3);
  });

  test('one land only: {1}{U} cannot be paid, so nobody is asked', () => {
    const g = board(1);
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack(SENTRY);
    g.passAll();
    g.expect.tapped('spider', false);
    g.expect.pt(SENTRY, 2, 3);
  });
});
