// Restrictions from static abilities (D-094): "can't block", "can't be blocked", from the creature
// itself, from another permanent (a filter subject) and from an attached Equipment.
// Pins: CR 509.1b (restrictions on blocking; an evasion ability is a restriction that an attacker
// has), CR 604 (static abilities), CR 611.3 (a static ability affects whatever its text indicates at
// any moment), CR 613.1f (a permanent that lost all abilities has no static ability left),
// CR 301.5 (Equipment). All cards are SYNTHETIC (src/cards/fixtures/synthetic-restrictions.ts).
import { describe, expect, test } from 'vitest';
import { derive } from '../src/rules/derive';
import { scenario } from '../src/testing/index';
import { attackedGame, canBlock } from './restriction-helpers';

const BEARS = 'Grizzly Bears';
const CANT_BLOCK = 'SYNTHETIC Cant Block Bear';
const UNBLOCKABLE = 'SYNTHETIC Unblockable Bear';
const BANNER = 'SYNTHETIC Muzzling Banner';
const VEIL = 'SYNTHETIC Veil Blade';

describe('CR 509.1b: "This creature can\'t block."', () => {
  test('it is listed among the derived restrictions of the permanent', () => {
    const g = scenario().seat(0).battlefield(CANT_BLOCK).seat(1).build();
    expect(derive(g.state, g.object(CANT_BLOCK)).restrictions).toEqual(['cantBlock']);
    expect(derive(g.state, g.object(CANT_BLOCK)).abilities).toHaveLength(1);
  });

  test("a creature that can't block is refused, listed nowhere, and not a candidate", () => {
    const g = attackedGame(['SYNTHETIC Vanilla 3/3'], (b) => b.battlefield(CANT_BLOCK, BEARS));
    expect(canBlock(g, CANT_BLOCK, 'SYNTHETIC Vanilla 3/3')).toBe(false);
    expect(canBlock(g, BEARS, 'SYNTHETIC Vanilla 3/3')).toBe(true);
  });

  test('when it is the only possible blocker, no blockers are asked for at all', () => {
    const g = attackedGame(['SYNTHETIC Vanilla 3/3'], (b) => b.battlefield(CANT_BLOCK));
    g.expect.step('declareBlockers');
    g.expect.pending('priority', 0);
    g.advanceTo('endOfCombat');
    g.expect.life(1, 37);
  });

  test('the engine message names the rule when a declaration breaks it', () => {
    const g = attackedGame(['SYNTHETIC Vanilla 3/3'], (b) => b.battlefield(CANT_BLOCK, BEARS));
    expect(
      g.act(1).try.declareBlockers([{ blocker: CANT_BLOCK, attacker: 'SYNTHETIC Vanilla 3/3' }]),
    ).toEqual({
      ok: false,
      error: 'That creature cannot block',
    });
  });

  test('attacking is not affected: it can attack', () => {
    const g = scenario()
      .seat(0)
      .battlefield(CANT_BLOCK)
      .library('Island', { count: 4 })
      .seat(1)
      .library('Island', { count: 4 })
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.expect.canAttack(CANT_BLOCK, true);
  });
});

describe('CR 509.1b: "This creature can\'t be blocked."', () => {
  test('no creature can block it, however many the defender has', () => {
    const g = attackedGame([UNBLOCKABLE], (b) =>
      b.battlefield(BEARS, 'Serra Angel', 'SYNTHETIC Vanilla 3/3'),
    );
    g.expect.pending('priority', 0);
    g.advanceTo('endOfCombat');
    g.expect.life(1, 38);
  });

  test('another attacker beside it can still be blocked', () => {
    const g = attackedGame([UNBLOCKABLE, 'SYNTHETIC Vanilla 3/3'], (b) => b.battlefield(BEARS));
    expect(canBlock(g, BEARS, UNBLOCKABLE)).toBe(false);
    expect(canBlock(g, BEARS, 'SYNTHETIC Vanilla 3/3')).toBe(true);
  });
});

describe('CR 611.3: a static ability on another permanent affects whatever its text indicates', () => {
  test('"Creatures your opponents control can\'t block" stops the opponent, not its controller', () => {
    const g = attackedGame(
      ['SYNTHETIC Vanilla 3/3'],
      (b) => b.battlefield(BEARS, 'SYNTHETIC Vanilla 2/2'),
      (b) => b.battlefield(BANNER),
    );
    // Nobody of seat 1 can block: no decision, priority in the declare blockers step.
    g.expect.pending('priority', 0);
    g.advanceTo('endOfCombat');
    g.expect.life(1, 37);
  });

  test("its own controller's creatures are not affected", () => {
    const g = scenario()
      .seat(0)
      .battlefield(BANNER, BEARS)
      .seat(1)
      .battlefield('Serra Angel')
      .build();
    expect(derive(g.state, g.object(BEARS)).restrictions).toEqual([]);
    expect(derive(g.state, g.object('Serra Angel')).restrictions).toEqual(['cantBlock']);
  });

  test('it stops applying when the permanent that has it is gone', () => {
    const g = scenario().seat(0).seat(1).battlefield(BEARS).build();
    expect(derive(g.state, g.object(BEARS)).restrictions).toEqual([]);
    const withBanner = scenario().seat(0).battlefield(BANNER).seat(1).battlefield(BEARS).build();
    expect(derive(withBanner.state, withBanner.object(BEARS)).restrictions).toEqual(['cantBlock']);
  });
});

describe('CR 301.5, 509.1b: "Equipped creature can\'t be blocked."', () => {
  test("the equipped creature can't be blocked; the unequipped one can", () => {
    const g = attackedGame(
      [BEARS, 'SYNTHETIC Vanilla 3/3'],
      (b) => b.battlefield('Serra Angel'),
      (b) => b.battlefield(VEIL, { attachedTo: BEARS }),
    );
    expect(canBlock(g, 'Serra Angel', BEARS)).toBe(false);
    expect(canBlock(g, 'Serra Angel', 'SYNTHETIC Vanilla 3/3')).toBe(true);
  });
});

describe('equipping and unequipping move the restriction (CR 301.5, 701.3)', () => {
  test('equipped at sorcery speed, then moved to another creature', () => {
    const g = scenario()
      .seat(0)
      .battlefield(VEIL, 'Forest', 'Plains')
      .battlefield(BEARS, { label: 'a' })
      .battlefield('SYNTHETIC Vanilla 3/3', { label: 'b' })
      .seat(1)
      .build();
    expect(derive(g.state, g.object('a')).restrictions).toEqual([]);
    g.act(0).activate(VEIL, { targets: ['a'], pay: true });
    g.passAll();
    expect(derive(g.state, g.object('a')).restrictions).toEqual(['cantBeBlocked']);
    expect(derive(g.state, g.object('b')).restrictions).toEqual([]);
    g.act(0).activate(VEIL, { targets: ['b'], pay: true });
    g.passAll();
    expect(derive(g.state, g.object('a')).restrictions).toEqual([]);
    expect(derive(g.state, g.object('b')).restrictions).toEqual(['cantBeBlocked']);
  });
});
