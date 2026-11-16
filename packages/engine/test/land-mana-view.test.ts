// Issue 22: the view of a land says which types of mana it could produce (CR 106.7), so the board can frame a land in the colours of its mana.
// A land has no colour of its own (CR 202.2: a card with no mana cost is colourless). Cards are real fixtures.
import { describe, expect, test } from 'vitest';
import { getView } from '../src/index';
import { scenario } from '../src/testing/index';

const FILLER = Array.from({ length: 10 }, () => 'Plains');

const game = () =>
  scenario()
    .seat(0)
    .hand('Forest', 'Grizzly Bears', 'Command Tower')
    .battlefield('Island', 'Swamp')
    .graveyard('Mountain')
    .library(...FILLER)
    .seat(1)
    .battlefield('Plains')
    .library(...FILLER)
    .at('precombatMain')
    .build();

describe('ObjectView.landMana', () => {
  test('a land on the battlefield, in the hand and in a graveyard names its mana', () => {
    const view = getView(game().state, 0);
    const mana = (name: string) =>
      [
        ...view.battlefield,
        ...(view.seats[0]?.hand ?? []),
        ...(view.seats[0]?.graveyard ?? []),
      ].find((o) => o.name === name)?.landMana;
    expect(mana('Island')).toEqual(['U']);
    expect(mana('Swamp')).toEqual(['B']);
    expect(mana('Plains')).toEqual(['W']);
    expect(mana('Forest')).toEqual(['G']);
    expect(mana('Mountain')).toEqual(['R']);
  });

  test('a card that is not a land has no such field', () => {
    const view = getView(game().state, 0);
    const bears = view.seats[0]?.hand?.find((o) => o.name === 'Grizzly Bears');
    expect(bears).toBeDefined();
    expect(bears?.landMana).toBeUndefined();
  });
});
