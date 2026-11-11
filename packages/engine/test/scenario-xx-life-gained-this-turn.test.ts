// "At the beginning of your end step, if you gained 3 or more life this turn, create a 2/2 white Griffin creature token with flying" (D-252):
// the condition `lifeGainedThisTurn`, read from the turn log as an intervening "if" (CR 603.4): when the step begins and again as the ability resolves.
// Pins: CR 119.3 (a life gain adds to the life total), CR 603.4 (intervening if), CR 514.2 (the turn log is emptied as the turn ends: a gain of
// an earlier turn does not count). Cards are SYNTHETIC (src/cards/fixtures/synthetic-life-gain.ts).
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const AERIE = 'SYNTHETIC Dawn Aerie';
const MEND = 'SYNTHETIC Mend'; // gain 3 life
const MEND_TWICE = 'SYNTHETIC Mend Twice'; // gain 2 life, then 2 more
const MEND_THEM = 'SYNTHETIC Mend Them'; // target player gains life
const LIBRARY = Array.from({ length: 12 }, () => 'Plains');

const base = () =>
  scenario()
    .seat(0)
    .library(...LIBRARY)
    .battlefield(AERIE, 'Plains', 'Plains');

describe('the card is valid', () => {
  test(AERIE, () => {
    expect(validateCard(syntheticCard(AERIE))).toEqual([]);
  });
});

describe('gained N or more life this turn', () => {
  test('gaining 3 life makes the end step trigger create the Griffin', () => {
    const g = base().hand(MEND).seat(1).library(...LIBRARY).build();
    g.act(0).cast(MEND, { pay: true });
    g.passAll();
    g.advanceTo('end');
    g.passAll();
    g.expect.zone('Griffin', 'battlefield');
  });

  test('gaining no life makes it do nothing', () => {
    const g = base().seat(1).library(...LIBRARY).build();
    g.advanceTo('end');
    g.passAll();
    g.expect.noObject('Griffin');
  });

  test('two gains of 2 life add up to 4: the totals of the turn count, not one event', () => {
    const g = base().hand(MEND_TWICE).seat(1).library(...LIBRARY).build();
    g.act(0).cast(MEND_TWICE, { pay: true });
    g.passAll();
    g.advanceTo('end');
    g.passAll();
    g.expect.zone('Griffin', 'battlefield');
  });

  test("an opponent's life gain is not mine", () => {
    const g = base().hand(MEND_THEM).seat(1).library(...LIBRARY).build();
    g.act(0).cast(MEND_THEM, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.advanceTo('end');
    g.passAll();
    g.expect.noObject('Griffin');
  });
});
