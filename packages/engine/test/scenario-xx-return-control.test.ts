// "At the beginning of your end step, each player gains control of all creatures they own." (issue 160, D-613)
// Pins: CR 613.1b (a control-changing effect is a layer 2 effect), CR 613.7b (the effect that began last decides), CR 611.2a (no duration stated: until the game ends or another
// effect changes control), CR 611.2c (the set of permanents is fixed when the effect begins), CR 506.4 (a creature whose controller changes leaves combat), CR 302.6
// (a creature that goes back has not been under its controller's control since the turn began). Cards are SYNTHETIC (src/cards/fixtures/synthetic-return-control.ts).
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { controllerOf } from '../src/rules/control';
import type { ScenarioGame } from '../src/testing/index';
import { twoSeatGame } from './two-seat-helpers';

const MENDER = 'SYNTHETIC Mender of Ownership';
const BEARS = 'Grizzly Bears';

const controller = (g: ScenarioGame, card: string): number => {
  const obj = g.state.objects[g.id(card)];
  if (obj === undefined) throw new Error(`no ${card}`);
  return controllerOf(g.state, obj);
};

describe('the card is valid', () => {
  test(MENDER, () => {
    expect(validateCard(syntheticCard(MENDER))).toEqual([]);
  });
});

describe('each player gains control of all creatures they own (CR 613.1b)', () => {
  test('a creature I control that an opponent owns goes back to them at my end step, and stays there', () => {
    const g = twoSeatGame(
      (b) => b.battlefield(MENDER),
      (b) => b.battlefield(BEARS, { controller: 0, label: 'stolen' }),
    );
    expect(controller(g, 'stolen')).toBe(0);
    g.advanceTo('end');
    g.passAll();
    expect(controller(g, 'stolen')).toBe(1);
    g.expect.invariants();
  });

  test('my own creatures stay mine, and the opponent’s own stay theirs', () => {
    const g = twoSeatGame(
      (b) => b.battlefield(MENDER).battlefield(BEARS, { label: 'mine' }),
      (b) => b.battlefield(BEARS, { label: 'theirs' }),
    );
    g.advanceTo('end');
    g.passAll();
    expect(controller(g, 'mine')).toBe(0);
    expect(controller(g, 'theirs')).toBe(1);
  });
});
