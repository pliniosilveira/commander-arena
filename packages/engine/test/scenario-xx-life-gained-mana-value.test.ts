// "Return up to one target creature card with mana value X or less from your graveyard to the battlefield, where X is the amount of life you gained
// this turn" (Moseo, issue 255): the target filter's limit `manaValueAtMost: { kind: 'lifeGainedThisTurn' }` is read as the end step trigger is put on
// the stack. Pins: CR 202.3 (mana value), CR 603.3d (targets chosen as the trigger is put on the stack), CR 119.3. Cards are SYNTHETIC
// (src/cards/fixtures/synthetic-life-gain.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const RITE = 'SYNTHETIC Dawn Rite';
const MEND = 'SYNTHETIC Mend'; // gain 3 life
const LIBRARY = Array.from({ length: 12 }, () => 'Plains');

const base = () =>
  scenario()
    .seat(0)
    .library(...LIBRARY)
    .battlefield(RITE, 'Plains', 'Plains')
    .graveyard('Grizzly Bears'); // mana value 2

describe('the card is valid', () => {
  test(RITE, () => {
    expect(validateCard(syntheticCard(RITE))).toEqual([]);
  });
});

describe('mana value X or less, X the life gained this turn', () => {
  test('gaining 3 life lets the end step trigger return a mana value 2 creature', () => {
    const g = base()
      .hand(MEND)
      .seat(1)
      .library(...LIBRARY)
      .build();
    g.act(0).cast(MEND, { pay: true });
    g.passAll();
    g.advanceTo('end');
    g.act(0).chooseTargets('Grizzly Bears');
    g.passAll();
    g.expect.zone('Grizzly Bears', 'battlefield');
  });

  test('a creature with a mana value above the life gained stays in the graveyard', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(RITE, 'Plains', 'Plains')
      .graveyard('Serra Angel') // mana value 5, more than the 3 life gained
      .hand(MEND)
      .seat(1)
      .library(...LIBRARY)
      .build();
    g.act(0).cast(MEND, { pay: true });
    g.passAll();
    g.advanceTo('end');
    g.passAll();
    g.expect.zone('Serra Angel', 'graveyard');
  });
});
