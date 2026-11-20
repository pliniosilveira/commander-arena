// "This spell costs {2} less to cast for each different mana value among instant and sorcery cards in your graveyard." (Eris, Roar of the Storm, the Quick Draw deck, issue 121): the
// amount `differentManaValuesAmong`, counted as the total cost is determined (CR 601.2f). (SYNTHETIC Value Discount, src/cards/fixtures/synthetic-quick-draw.ts.)
// Pins: CR 202.3 (mana value), CR 601.2f and 118.7a (a reduction takes generic mana only), CR 113.6d (the spell's own ability works on the stack).
import { describe, expect, test } from 'vitest';
import { getLegalActions, syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const DISCOUNT = 'SYNTHETIC Value Discount'; // {8}{U} sorcery
const MV2A = 'SYNTHETIC Plot Gain'; // {1}{U} instant, mana value 2
const MV2B = 'SYNTHETIC Jump Draw'; // {1}{U} instant, mana value 2
const MV3 = 'SYNTHETIC Plot Draw'; // {2}{U} sorcery, mana value 3
const FILLER = ['Island', 'Island', 'Island', 'Island'] as const;

const castable = (graveyard: readonly string[], pool: string) => {
  const b = scenario()
    .seat(0)
    .library(...FILLER)
    .hand(DISCOUNT)
    .pool(pool);
  for (const card of graveyard) b.graveyard(card);
  const g = b
    .seat(1)
    .library(...FILLER)
    .at('precombatMain', { active: 0 })
    .build();
  const card = g.find({ name: DISCOUNT, zone: 'hand', seat: 0 })[0];
  return getLegalActions(g.state, 0).some(
    (a) => a.kind === 'castSpell' && a.object === card?.id && a.alternative === undefined,
  );
};

describe('the card is valid', () => {
  test(DISCOUNT, () => expect(validateCard(syntheticCard(DISCOUNT))).toEqual([]));
});

describe('costs {2} less for each different mana value among instants and sorceries in the graveyard', () => {
  test('with none in the graveyard the full {8}{U} is needed', () => {
    expect(castable([], 'UUUUUUUU')).toBe(false);
    expect(castable([], 'UUUUUUUUU')).toBe(true);
  });

  test('two cards of the same mana value are one value: {6}{U}', () => {
    expect(castable([MV2A, MV2B], 'UUUUUU')).toBe(false);
    expect(castable([MV2A, MV2B], 'UUUUUUU')).toBe(true);
  });

  test('two different mana values: {4}{U}', () => {
    expect(castable([MV2A, MV3], 'UUUU')).toBe(false);
    expect(castable([MV2A, MV3], 'UUUUU')).toBe(true);
  });

  test('a card that is not an instant or a sorcery does not count', () => {
    expect(castable(['Grizzly Bears'], 'UUUUUUUU')).toBe(false);
  });
});
