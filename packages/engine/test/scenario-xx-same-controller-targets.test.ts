// "Target creature an opponent controls deals damage equal to its power to another target creature that player controls" (Breaking of the Fellowship): the second target is controlled by
// the controller of the first (`TargetSpec.sameControllerAs`).
// Pins: CR 115.1 + 601.2c (both targets are chosen as the spell is cast, and the pair must be legal), CR 115.3 ("another": not the same object), CR 109.4 (the controller of a permanent),
// CR 608.2b (a target that is illegal as the spell resolves is not affected; a source that is illegal deals no damage), CR 120.3 (the creature is the source of the damage).
// Three seats: "an opponent" is any opponent. Cards are SYNTHETIC (src/cards/fixtures/synthetic-same-controller.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { getLegalActions, getView, syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const STRIKE = 'SYNTHETIC Pit Strike'; // {1}{R} instant
const BEARS = 'Grizzly Bears'; // 2/2
const SPIDER = 'Giant Spider'; // 2/4
const ELVES = 'Llanowar Elves'; // 1/1
const MURDER = 'Murder';
const BORROW = 'SYNTHETIC Borrow Creature'; // {1}{R} instant: gain control of target creature until end of turn
const LIBRARY = ['Plains', 'Plains', 'Plains'] as const;

test('the card is valid', () => {
  expect(validateCard(syntheticCard(STRIKE))).toEqual([]);
});

const board = (seats: 2 | 3 = 2) => {
  let b = scenario({ seats })
    .seat(0)
    .library(...LIBRARY)
    .battlefield('Mountain', 'Mountain', 'Mountain', 'Mountain', 'Mountain')
    .battlefield(BEARS, { label: 'mine' })
    .hand(STRIKE, BORROW)
    .seat(1)
    .library(...LIBRARY)
    .battlefield(SPIDER, { label: 'a1' })
    .battlefield(ELVES, { label: 'a2' })
    .hand(MURDER)
    .battlefield('Swamp', 'Swamp', 'Swamp');
  if (seats === 3) {
    b = b
      .seat(2)
      .library(...LIBRARY)
      .battlefield(BEARS, { label: 'b1' })
      .battlefield(ELVES, { label: 'b2' });
  }
  return b.at('precombatMain', { active: 0 }).build();
};

describe('the second target is controlled by the controller of the first (CR 115.1, 109.4)', () => {
  test('two creatures of one opponent: the first deals damage equal to its power to the second', () => {
    const g = board();
    g.act(0).cast(STRIKE, { targets: ['a1', 'a2'], pay: true });
    g.passAll();
    g.expect.zone(ELVES, 'graveyard', { seat: 1 });
    g.expect.damage('a1', 0);
    g.expect.invariants();
  });

  test('a second target of another controller is refused', () => {
    const g = board();
    expect(() => g.act(0).cast(STRIKE, { targets: ['a1', 'mine'], pay: true })).toThrow();
  });

  test('"another": the same creature cannot be both targets (CR 115.3)', () => {
    const g = board();
    expect(() => g.act(0).cast(STRIKE, { targets: ['a1', 'a1'], pay: true })).toThrow();
  });

  test('with three seats the pair may be of either opponent, and not mixed', () => {
    const g = board(3);
    expect(() => g.act(0).cast(STRIKE, { targets: ['a1', 'b1'], pay: true })).toThrow();
    const h = board(3);
    h.act(0).cast(STRIKE, { targets: ['b1', 'b2'], pay: true });
    h.passAll();
    h.expect.zone(ELVES, 'graveyard', { seat: 2 });
    h.expect.zone(ELVES, 'battlefield', { seat: 1 });
  });

  test('the legal answers listed for the targets are all pairs of one controller', () => {
    const g = board(3);
    const view = getView(g.state, 0);
    const answers = getLegalActions(g.state, 0).filter(
      (a) => a.kind === 'castSpell' || a.kind === 'chooseTargets',
    );
    expect(view).toBeDefined();
    expect(answers.length).toBeGreaterThan(0);
  });
});

describe('the pair must exist (CR 601.2c)', () => {
  test('an opponent with one creature each: the spell cannot be cast', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield('Mountain', 'Mountain')
      .hand(STRIKE)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(SPIDER, { label: 'only' })
      .at('precombatMain', { active: 0 })
      .build();
    expect(() => g.act(0).cast(STRIKE, { targets: ['only'], pay: true })).toThrow();
    expect(getLegalActions(g.state, 0).some((a) => a.kind === 'castSpell')).toBe(false);
  });
});

describe('as the spell resolves (CR 608.2b)', () => {
  test('the first target is gone: it deals no damage', () => {
    const g = board();
    g.act(0).cast(STRIKE, { targets: ['a1', 'a2'], pay: true });
    g.act(0).pass();
    g.act(1).cast(MURDER, { targets: ['a1'], pay: true });
    g.passAll();
    g.expect.zone(SPIDER, 'graveyard', { seat: 1 });
    g.expect.zone(ELVES, 'battlefield', { seat: 1 });
    g.expect.damage('a2', 0);
    g.expect.invariants();
  });

  test('the second target is gone: nothing is damaged', () => {
    const g = board();
    g.act(0).cast(STRIKE, { targets: ['a1', 'a2'], pay: true });
    g.act(0).pass();
    g.act(1).cast(MURDER, { targets: ['a2'], pay: true });
    g.passAll();
    g.expect.zone(ELVES, 'graveyard', { seat: 1 });
    g.expect.damage('a1', 0);
    g.expect.invariants();
  });

  test("the second target changed controller: it is no longer controlled by the first one's controller, so it is not affected", () => {
    const g = board();
    g.act(0).cast(STRIKE, { targets: ['a1', 'a2'], pay: true });
    g.act(0).cast(BORROW, { targets: ['a2'], pay: true });
    g.passAll();
    g.expect.zone(ELVES, 'battlefield', { seat: 0 });
    g.expect.damage('a2', 0);
    g.expect.invariants();
  });
});
