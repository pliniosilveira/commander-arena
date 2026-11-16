// "Whenever you tap an untapped creature an opponent controls", "Whenever a creature an opponent controls becomes tapped, if it isn't being declared as an attacker", "Whenever you tap
// one or more untapped creatures your opponents control" (D-510, group 1 of the Hylda deck).
// Pins: CR 701.26a (tap: only an untapped permanent is tapped, so an effect that taps a tapped one triggers nothing), CR 508.1f (the active player taps the attackers as they are
// declared), CR 603.2c (one or more: an ability triggers once for the events together), CR 603.2 ("This ability triggers only once each turn"), CR 122.1d (a stun counter).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-hylda-g1.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { type CardDefinition, syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const SENTRY = 'SYNTHETIC Chill Sentry'; // vigilance; attacks: may pay {1}{U}, when you do tap a creature of an opponent; +2/+1 when you tap one
const MERFOLK = 'SYNTHETIC Numbing Merfolk'; // enters: tap + stun; one or more untapped creatures of opponents tapped by you: draw (once each turn)
const CIRCLE = 'SYNTHETIC Watchful Circle'; // an opponent's creature becomes tapped, not as an attacker: you may draw
const TOUCH = 'SYNTHETIC Frost Touch'; // instant: tap target creature
const HUSH = 'SYNTHETIC Tidal Hush'; // sorcery: tap all creatures your opponents control
const BEARS = 'Grizzly Bears';
const SPIDER = 'Giant Spider';
const LIBRARY = Array.from({ length: 8 }, () => 'Island');

describe('the cards are valid', () => {
  test.each([SENTRY, MERFOLK, CIRCLE, TOUCH, HUSH])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });
});

/** The card with its triggered abilities changed by `patch` (the trigger and the flags), under a new name, so a scenario can define the variant. */
function variant(
  name: string,
  rename: string,
  patch: (trigger: Record<string, unknown>) => Record<string, unknown>,
  drop: readonly string[] = [],
): CardDefinition {
  const card = syntheticCard(name);
  const [face] = card.faces;
  if (face === undefined) throw new Error('no face');
  const abilities = face.abilities.map((a) => {
    if (a.kind !== 'triggered' || a.trigger.kind !== 'becomesTapped') return a;
    const copy = { ...a, trigger: patch({ ...a.trigger }) } as Record<string, unknown>;
    for (const key of drop) delete copy[key];
    return copy;
  });
  return { ...card, name: rename, faces: [{ ...face, name: rename, abilities }] } as never;
}

const defs = () =>
  scenario()
    .define(syntheticCard(SENTRY))
    .define(syntheticCard(MERFOLK))
    .define(syntheticCard(CIRCLE))
    .define(syntheticCard(TOUCH))
    .define(syntheticCard(HUSH));

describe('"Whenever you tap an untapped creature an opponent controls" (the Sentry\'s +2/+1)', () => {
  const board = () =>
    defs()
      .seat(0)
      .library(...LIBRARY)
      .hand(TOUCH, TOUCH, HUSH)
      .battlefield('Island', 'Island', 'Island', 'Island')
      .battlefield(SENTRY)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS, { label: 'bears' })
      .battlefield(SPIDER, { label: 'spider' })
      .at('precombatMain', { active: 0 })
      .build();

  test('your tap effect on an untapped creature of an opponent: +2/+1 until end of turn', () => {
    const g = board();
    g.act(0).cast(`${TOUCH}[0]`, { targets: ['bears'], pay: true });
    g.passAll();
    g.expect.tapped('bears');
    g.expect.pt(SENTRY, 4, 4);
    g.expect.invariants();
  });

  test('it triggers once for each creature tapped (two creatures, +4/+2)', () => {
    const g = board();
    g.act(0).cast(HUSH, { pay: true });
    g.passAll();
    g.expect.pt(SENTRY, 6, 5);
    g.expect.invariants();
  });

  test('a creature that is already tapped is not tapped again: nothing (CR 701.26a)', () => {
    const g = board();
    g.act(0).cast(`${TOUCH}[0]`, { targets: ['bears'], pay: true });
    g.passAll();
    g.expect.pt(SENTRY, 4, 4);
    g.act(0).cast(`${TOUCH}[0]`, { targets: ['bears'], pay: true });
    g.passAll();
    g.expect.pt(SENTRY, 4, 4);
  });

  test('the effect of an opponent that taps your creature, or its own: nothing', () => {
    const g = defs()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(SENTRY, { label: 'mine' })
      .seat(1)
      .library(...LIBRARY)
      .hand(TOUCH, TOUCH)
      .battlefield('Island', 'Island')
      .battlefield(BEARS, { label: 'bears' })
      .at('precombatMain', { active: 1 })
      .build();
    g.act(1).cast(`${TOUCH}[0]`, { targets: ['bears'], pay: true });
    g.passAll();
    g.expect.tapped('bears');
    g.expect.pt(SENTRY, 2, 3);
    g.act(1).cast(`${TOUCH}[0]`, { targets: ['mine'], pay: true });
    g.passAll();
    g.expect.tapped('mine');
    g.expect.pt(SENTRY, 2, 3);
  });

  test('your own creature tapped by your effect: nothing (it is not a creature an opponent controls)', () => {
    const g = board();
    g.act(0).cast(`${TOUCH}[0]`, { targets: [SENTRY], pay: true });
    g.passAll();
    g.expect.pt(SENTRY, 2, 3);
  });
});

describe('"Whenever a creature an opponent controls becomes tapped, if it isn\'t being declared as an attacker, you may draw a card."', () => {
  const board = (active: 0 | 1) =>
    defs()
      .seat(0)
      .library(...LIBRARY)
      .hand(TOUCH, TOUCH)
      .battlefield('Island', 'Island', CIRCLE)
      .battlefield(BEARS, { label: 'mine' })
      .seat(1)
      .library(...LIBRARY)
      .battlefield(SPIDER, { label: 'spider' })
      .at(active === 0 ? 'precombatMain' : 'beginningOfCombat', { active })
      .build();

  test('tapped by a spell: you may draw, and drawing is your choice', () => {
    const g = board(0);
    g.act(0).cast(`${TOUCH}[0]`, { targets: ['spider'], pay: true });
    g.passAll();
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    g.expect.zone('Island', 'hand', { seat: 0, count: 1 });
    g.expect.invariants();
  });

  test('declined: no card', () => {
    const g = board(0);
    g.act(0).cast(`${TOUCH}[0]`, { targets: ['spider'], pay: true });
    g.passAll();
    g.act(0).decline();
    g.expect.zone('Island', 'hand', { seat: 0, count: 0 });
  });

  test('the creature an opponent declares as an attacker is tapped as it is declared: nothing', () => {
    const g = board(1);
    g.passAll();
    g.expect.pending('declareAttackers', 1);
    g.act(1).attack('spider');
    g.expect.tapped('spider');
    // Nothing triggered: the Circle's ability is not on the stack (CR 508.1f).
    g.expect.stack([]);
    g.expect.zone('Island', 'hand', { seat: 0, count: 0 });
    g.expect.invariants();
  });

  test('your own creature tapped: nothing', () => {
    const g = board(0);
    g.act(0).cast(`${TOUCH}[0]`, { targets: ['mine'], pay: true });
    g.passAll();
    g.expect.tapped('mine');
    g.expect.zone('Island', 'hand', { seat: 0, count: 0 });
  });
});

describe('"Whenever you tap one or more untapped creatures your opponents control, draw a card. This ability triggers only once each turn."', () => {
  const board = () =>
    defs()
      .seat(0)
      .library(...LIBRARY)
      .hand(TOUCH, TOUCH, HUSH)
      .battlefield('Island', 'Island', 'Island', 'Island', 'Island', 'Island')
      .battlefield(MERFOLK)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS, { label: 'bears' })
      .battlefield(SPIDER, { label: 'spider' })
      .at('precombatMain', { active: 0 })
      .build();

  test('one effect taps two creatures: one card', () => {
    const g = board();
    g.act(0).cast(HUSH, { pay: true });
    g.passAll();
    g.expect.zone('Island', 'hand', { seat: 0, count: 1 });
    g.expect.invariants();
  });

  test('once each turn: a second tap in the same turn draws nothing', () => {
    const g = board();
    g.act(0).cast(`${TOUCH}[0]`, { targets: ['bears'], pay: true });
    g.passAll();
    g.expect.zone('Island', 'hand', { seat: 0, count: 1 });
    g.act(0).cast(`${TOUCH}[0]`, { targets: ['spider'], pay: true });
    g.passAll();
    g.expect.zone('Island', 'hand', { seat: 0, count: 1 });
  });

  test('entering: the Merfolk taps the creature and puts a stun counter on it (CR 122.1d), and that draws a card', () => {
    const g = defs()
      .seat(0)
      .library(...LIBRARY)
      .hand(MERFOLK)
      .battlefield('Island', 'Island', 'Plains', 'Plains')
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS, { label: 'bears' })
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(MERFOLK, { pay: true });
    g.passAll();
    g.passAll();
    g.expect.tapped('bears');
    g.expect.counters('bears', { stun: 1 });
    g.expect.zone('Island', 'hand', { seat: 0, count: 1 });
    g.expect.invariants();
  });
});

describe('the batch and the player of a tap trigger on variants of the cards (the engine reads the fields on their own)', () => {
  test('a batch with no limit each turn: one trigger for the creatures tapped together, one more for a later effect', () => {
    const name = 'SYNTHETIC Merfolk Without A Limit';
    const card = variant(MERFOLK, name, (t) => t, ['oncePerTurn']);
    expect(validateCard(card)).toEqual([]);
    const g = defs()
      .define(card)
      .seat(0)
      .library(...LIBRARY)
      .hand(TOUCH, TOUCH, HUSH)
      .battlefield('Island', 'Island', 'Island', 'Island', 'Island', 'Island')
      .battlefield(name)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS, { label: 'bears' })
      .battlefield(SPIDER, { label: 'spider' })
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(HUSH, { pay: true });
    g.passAll();
    // Two creatures tapped by one effect: one trigger (CR 603.2c), so one card.
    g.expect.zone('Island', 'hand', { seat: 0, count: 1 });
  });

  test('"an opponent taps": only the effect of an opponent of the controller triggers it', () => {
    const name = 'SYNTHETIC Chill Sentry Of Opponents';
    const card = variant(SENTRY, name, (t) => ({
      ...t,
      what: { types: ['creature'] },
      by: 'opponent',
    }));
    expect(validateCard(card)).toEqual([]);
    const g = defs()
      .define(card)
      .seat(0)
      .library(...LIBRARY)
      .hand(TOUCH)
      .battlefield('Island', 'Island')
      .battlefield(name)
      .battlefield(BEARS, { label: 'mine' })
      .seat(1)
      .library(...LIBRARY)
      .hand(TOUCH)
      .battlefield('Island', 'Island')
      .battlefield(SPIDER, { label: 'theirs' })
      .at('precombatMain', { active: 0 })
      .build();
    // The effect of the controller: not an opponent tapping.
    g.act(0).cast(TOUCH, { targets: ['theirs'], pay: true });
    g.passAll();
    g.expect.pt(name, 2, 3);
    // An opponent taps a creature of the controller, whoever controls it: the effect of an opponent.
    g.act(0).pass();
    g.act(1).cast(TOUCH, { targets: ['mine'], pay: true });
    g.passAll();
    g.expect.pt(name, 4, 4);
  });
});
