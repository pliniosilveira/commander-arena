// A delayed triggered ability that returns what the same resolution exiled (D-205): "Exile up to one target creature or land you control. If you do,
// return it to the battlefield under its owner's control at the beginning of the next end step."
// Pins: CR 603.7 and 603.7c (a delayed triggered ability refers to the object, and does nothing if it is no longer where it was expected), CR 603.7d
// (its controller), CR 400.7 and 400.7j (the card that returns is a new object; "it" is the card the exile moved), CR 111.8 (a token that left the
// battlefield cannot come back), CR 614.12 and 614.1c (a land that returns asks its entering question), CR 608.2d ("up to one": it can be nothing).
// The card is SYNTHETIC (src/cards/fixtures/synthetic-delayed-return.ts); the lands are real fixtures and a SYNTHETIC shock land.
import { describe, expect, test } from 'vitest';
import { getView, stateHash, syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';
import { confirmOptionalDecision } from './pending-helpers';

const FLICKER = 'SYNTHETIC Delayed Flicker';
const TOKEN_FLICKER = 'SYNTHETIC Token Flicker';
const SHOCK = 'SYNTHETIC Shock Land';
const BEARS = 'Grizzly Bears';

const game = () =>
  scenario()
    .seat(0)
    .hand(FLICKER)
    .battlefield('Island', { count: 2 })
    .battlefield(BEARS)
    .library('Island', 'Island', 'Island')
    .seat(1)
    .battlefield('Serra Angel')
    .library('Island', 'Island', 'Island')
    .at('precombatMain', { active: 0, turn: 1 })
    .build();

describe('the card is valid', () => {
  test('validateCard finds nothing wrong', () => {
    expect(validateCard(syntheticCard(FLICKER))).toEqual([]);
    expect(validateCard(syntheticCard(TOKEN_FLICKER))).toEqual([]);
  });
});

describe('exile now, return at the beginning of the next end step (CR 603.7)', () => {
  test('the creature is exiled when the spell resolves and returns, untapped and under its owner, in the end step', () => {
    const g = game();
    g.act(0).cast(FLICKER, { targets: [{ name: BEARS }], pay: true });
    g.pass();
    g.pass();
    g.expect.zone(BEARS, 'exile', { seat: 0 });
    expect(g.state.delayedTriggers).toHaveLength(1);
    g.advanceTo('end');
    // The delayed ability triggered at the beginning of the end step and waits on the stack.
    g.expect.stack([`${FLICKER} (ability)`]);
    g.pass();
    g.pass();
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.tapped(BEARS, false);
    expect(g.state.delayedTriggers).toEqual([]);
    g.expect.invariants();
  });

  test('it does not return before the end step, and a new object comes back (CR 400.7)', () => {
    const g = game();
    const before = g.id(BEARS);
    g.act(0).cast(FLICKER, { targets: [{ name: BEARS }], pay: true });
    g.pass();
    g.pass();
    g.advanceTo('endOfCombat');
    g.expect.zone(BEARS, 'exile', { seat: 0 });
    g.advanceTo('end');
    g.pass();
    g.pass();
    expect(g.id(BEARS)).not.toBe(before);
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
  });

  test('"up to one": with no target nothing is exiled and no delayed ability is created', () => {
    const g = game();
    g.act(0).cast(FLICKER, { targets: [], pay: true });
    g.pass();
    g.pass();
    expect(g.state.delayedTriggers).toEqual([]);
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('a token that was exiled has ceased to exist and does not return (CR 111.8)', () => {
    const g = scenario()
      .seat(0)
      .hand(TOKEN_FLICKER)
      .battlefield('Island', { count: 2 })
      .library('Island', 'Island', 'Island')
      .seat(1)
      .library('Island', 'Island', 'Island')
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.act(0).cast(TOKEN_FLICKER, { pay: true });
    g.pass();
    g.pass();
    g.expect.noObject('Treasure');
    expect(g.state.delayedTriggers).toEqual([]);
    g.advanceTo('end');
    g.expect.noObject('Treasure');
    g.expect.invariants();
  });

  test('the controller of the delayed ability is the controller of the spell, even if the permanent is returned to its owner (CR 603.7d, 110.2)', () => {
    const g = game();
    g.act(0).cast(FLICKER, { targets: [{ name: BEARS }], pay: true });
    g.pass();
    g.pass();
    expect(g.state.delayedTriggers[0]?.controller).toBe(0);
  });
});

describe('a land that returns asks the question of its replacement effects (CR 614.12)', () => {
  const landGame = () =>
    scenario()
      .seat(0)
      .hand(FLICKER)
      .battlefield('Island', { count: 2 })
      .battlefield(SHOCK, { label: 'shock' })
      .library('Island', 'Island', 'Island')
      .seat(1)
      .library('Island', 'Island', 'Island')
      .at('precombatMain', { active: 0, turn: 1 })
      .build();

  test('a shock land asks whether to pay 2 life as it returns; declining makes it enter tapped', () => {
    const g = landGame();
    g.act(0).cast(FLICKER, { targets: [{ name: SHOCK }], pay: true });
    g.pass();
    g.pass();
    g.expect.zone(SHOCK, 'exile', { seat: 0 });
    g.advanceTo('end');
    g.pass();
    g.pass();
    const d = confirmOptionalDecision(g);
    expect(d.seat).toBe(0);
    expect(d.cost).toEqual([{ kind: 'payLife', amount: 2 }]);
    g.expect.zone(SHOCK, 'exile', { seat: 0 });
    g.act(0).decline();
    g.expect.zone(SHOCK, 'battlefield', { seat: 0 });
    g.expect.tapped(SHOCK, true);
    g.expect.life(0, 40);
  });

  test('accepting pays the life and the land returns untapped', () => {
    const g = landGame();
    g.act(0).cast(FLICKER, { targets: [{ name: SHOCK }], pay: true });
    g.pass();
    g.pass();
    g.advanceTo('end');
    g.pass();
    g.pass();
    g.act(0).accept();
    g.expect.life(0, 38);
    g.expect.zone(SHOCK, 'battlefield', { seat: 0 });
    g.expect.tapped(SHOCK, false);
  });
});

describe('determinism', () => {
  test('the same actions give the same state hash, and the view hides nothing it should not', () => {
    const run = () => {
      const g = game();
      g.act(0).cast(FLICKER, { targets: [{ name: BEARS }], pay: true });
      g.pass();
      g.pass();
      g.advanceTo('end');
      g.pass();
      g.pass();
      return g;
    };
    const a = run();
    const b = run();
    expect(stateHash(a.state)).toBe(stateHash(b.state));
    expect(getView(a.state, 0).battlefield.some((o) => o.name === BEARS)).toBe(true);
  });
});
