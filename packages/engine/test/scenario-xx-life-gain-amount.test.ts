// "Whenever you gain life, you may put that many +1/+1 counters on each creature you control. Do this only once each turn." (D-256): "that many" of a
// life gain trigger is the life gained after replacement (CR 119.9, 614.1), and "Do this only once each turn" is CR 603.2h: the ability triggers only if
// its controller has not yet taken the action that turn. Cards are SYNTHETIC (src/cards/fixtures/synthetic-life-gain.ts).
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const PARAGON = 'SYNTHETIC Surge Paragon'; // "you may put that many +1/+1 counters on each creature you control. Do this only once each turn."
const STEADY = 'SYNTHETIC Steady Paragon'; // the same on itself, with no question
const VITAL = 'SYNTHETIC Vital Angel'; // gains are 1 more
const IDLE = 'SYNTHETIC Idle Paragon'; // the same on each creature an opponent controls
const BORROW = 'SYNTHETIC Borrow Creature'; // control of a creature until end of turn
const MEND = 'SYNTHETIC Mend'; // gain 3 life
const MEND_TWICE = 'SYNTHETIC Mend Twice'; // gain 2 life, then 2 more
const MEND_THEM = 'SYNTHETIC Mend Them';
const HAND_MEND = { name: MEND, zone: 'hand' as const, nth: 0 };
const BEARS = 'Grizzly Bears';
const HAWK = "Healer's Hawk"; // the opponent's creature
const LIBRARY = Array.from({ length: 12 }, () => 'Plains');

const base = () =>
  scenario()
    .seat(0)
    .library(...LIBRARY)
    .battlefield('Plains', 'Plains', 'Plains', 'Plains', PARAGON, BEARS);

describe('the cards are valid', () => {
  test.each([PARAGON, STEADY])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });

  test('"that many" of a life gain needs a trigger that has an amount', () => {
    const card = syntheticCard(PARAGON);
    const bad = {
      ...card,
      faces: card.faces.map((face) => ({
        ...face,
        abilities: face.abilities.map((a) =>
          a.kind === 'triggered'
            ? { ...a, trigger: { kind: 'dies' as const, what: { kind: 'this' as const } } }
            : a,
        ),
      })),
    };
    expect(
      validateCard(bad)
        .map((i) => i.message)
        .join('|'),
    ).toMatch(/triggerDamage/);
  });

  test('the two once-a-turn limits are not written together', () => {
    const card = syntheticCard(STEADY);
    const bad = {
      ...card,
      faces: card.faces.map((face) => ({
        ...face,
        abilities: face.abilities.map((a) =>
          a.kind === 'triggered' ? { ...a, oncePerTurn: true as const } : a,
        ),
      })),
    };
    expect(
      validateCard(bad)
        .map((i) => i.message)
        .join('|'),
    ).toMatch(/doOnlyOnceEachTurn/);
  });
});

describe('"that many" is the life gained', () => {
  test('a gain of 3 puts three +1/+1 counters on each creature you control', () => {
    const g = base().hand(MEND).seat(1).battlefield(HAWK).build();
    g.act(0).cast(HAND_MEND, { pay: true });
    g.passAll();
    g.act(0).accept();
    g.passAll();
    g.expect.counters(PARAGON, { '+1/+1': 3 });
    g.expect.counters(BEARS, { '+1/+1': 3 });
    g.expect.pt(BEARS, 5, 5);
    g.expect.counters(HAWK, {});
  });

  test('it is the life actually gained: a replacement that adds 1 makes it 4 (CR 119.9, 614.1)', () => {
    const g = base().hand(MEND).battlefield(VITAL).seat(1).build();
    g.act(0).cast(HAND_MEND, { pay: true });
    g.passAll();
    g.act(0).accept();
    g.passAll();
    g.expect.counters(PARAGON, { '+1/+1': 4 });
    g.expect.counters(VITAL, { '+1/+1': 4 });
  });

  test('an opponent gaining life does not trigger it', () => {
    const g = base().hand(MEND_THEM).seat(1).build();
    g.act(0).cast(MEND_THEM, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.counters(PARAGON, {});
  });
});

describe('"you may"', () => {
  test('declining puts no counters', () => {
    const g = base().hand(MEND).seat(1).build();
    g.act(0).cast(HAND_MEND, { pay: true });
    g.passAll();
    g.act(0).decline();
    g.passAll();
    g.expect.counters(PARAGON, {});
    g.expect.counters(BEARS, {});
  });
});

describe('"Do this only once each turn" (CR 603.2h)', () => {
  test('after the counters were put, a second gain the same turn does not trigger it', () => {
    const g = base().hand(MEND, MEND).seat(1).build();
    g.act(0).cast(HAND_MEND, { pay: true });
    g.passAll();
    g.act(0).accept();
    g.passAll();
    g.act(0).cast(HAND_MEND, { pay: true });
    g.passAll();
    expect(g.state.pending?.kind).not.toBe('confirmOptional');
    g.expect.counters(PARAGON, { '+1/+1': 3 });
    g.expect.life(0, 46);
  });

  test('a declined ability did not take the action: the next gain of the turn triggers it again', () => {
    const g = base().hand(MEND, MEND).seat(1).build();
    g.act(0).cast(HAND_MEND, { pay: true });
    g.passAll();
    g.act(0).decline();
    g.passAll();
    g.act(0).cast(HAND_MEND, { pay: true });
    g.passAll();
    g.act(0).accept();
    g.passAll();
    g.expect.counters(PARAGON, { '+1/+1': 3 });
  });

  test('two gains in one resolution both trigger, as nothing was done yet; each resolves with its own amount', () => {
    const g = base().hand(MEND_TWICE).seat(1).build();
    g.act(0).cast(MEND_TWICE, { pay: true });
    g.passAll();
    for (let i = 0; i < 6 && g.state.pending !== null; i += 1) {
      const d = g.state.pending;
      if (d.kind === 'confirmOptional') g.act(0).accept();
      else if (d.kind === 'orderTriggers')
        g.choose(d.seat, g.legalActions(d.seat)[0] ?? { kind: 'pass' });
      else break;
      g.passAll();
    }
    g.expect.counters(PARAGON, { '+1/+1': 4 });
  });

  test('a new turn starts again', () => {
    const g = base().hand(MEND).seat(1).build();
    g.act(0).cast(HAND_MEND, { pay: true });
    g.passAll();
    g.act(0).accept();
    g.passAll();
    g.expect.counters(PARAGON, { '+1/+1': 3 });
    g.advanceTo('upkeep', { turn: 3 });
    expect(g.state.turnLog.actionTaken).toEqual([]);
  });

  test('without "you may" the action is taken as the ability resolves', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .hand(MEND, MEND)
      .battlefield('Plains', 'Plains', 'Plains', 'Plains', STEADY)
      .seat(1)
      .build();
    g.act(0).cast(HAND_MEND, { pay: true });
    g.passAll();
    g.expect.counters(STEADY, { '+1/+1': 3 });
    g.act(0).cast(HAND_MEND, { pay: true });
    g.passAll();
    g.expect.counters(STEADY, { '+1/+1': 3 });
  });

  test("it is the permanent's own: a second Paragon has its own turn", () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .hand(MEND)
      .battlefield('Plains', 'Plains', 'Plains', 'Plains', STEADY, STEADY)
      .seat(1)
      .build();
    g.act(0).cast(HAND_MEND, { pay: true });
    g.passAll();
    const d = g.state.pending;
    if (d?.kind === 'orderTriggers')
      g.choose(d.seat, g.legalActions(d.seat)[0] ?? { kind: 'pass' });
    g.passAll();
    for (const o of g.find({ name: STEADY })) expect(o.counters['+1/+1']).toBe(3);
  });

  test('the action is taken once the ability resolves, whatever its effect then does (CR 603.2h)', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .hand(MEND)
      .battlefield('Plains', 'Plains', 'Plains', 'Plains', IDLE)
      .seat(1)
      .build();
    g.act(0).cast(HAND_MEND, { pay: true });
    g.passAll();
    g.expect.counters(IDLE, {});
    expect(g.state.turnLog.actionTaken.map((a) => a.seat)).toEqual([0]);
  });

  test('"its source\'s controller": a permanent that changes hands starts again for its new controller', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .hand(MEND)
      .battlefield('Plains', 'Plains', 'Plains', 'Plains', STEADY)
      .seat(1)
      .library(...LIBRARY)
      .hand(BORROW, MEND)
      .battlefield('Mountain', 'Mountain', 'Plains', 'Plains')
      .build();
    g.act(0).cast(HAND_MEND, { pay: true });
    g.passAll();
    g.expect.counters(STEADY, { '+1/+1': 3 });
    // the opponent takes it until end of turn and gains life: it is theirs now, and they have not taken the action
    g.pass(0);
    g.act(1).cast(BORROW, { targets: [{ name: STEADY, seat: 0 }], pay: true });
    g.passAll();
    g.pass(0);
    g.act(1).cast({ name: MEND, zone: 'hand', nth: 0 }, { pay: true });
    g.passAll();
    g.expect.counters(STEADY, { '+1/+1': 6 });
    expect(g.state.turnLog.actionTaken.map((a) => a.seat)).toEqual([0, 1]);
  });
});
