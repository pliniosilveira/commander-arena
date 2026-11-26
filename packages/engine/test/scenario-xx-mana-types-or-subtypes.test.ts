// "Spend this mana only to cast instant, sorcery, Demon, and Spirit spells" (Séance Board; CR 106.6, 205.2a, 205.3m): `spendOnly` with `types`, `subtypes` and `typesOrSubtypes`, a spell of
// one of the card types OR of one of the creature types (without the flag a spell must be of both). The cards are SYNTHETIC (src/cards/fixtures/synthetic-life-lost-group.ts) or fixtures.
// Pins: an instant spell is paid for, a creature spell of a listed creature type is paid for (a spell that is of a type or a subtype but not both), another creature spell is not, an
// ability is not, and the restriction shows in the pool.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const URN = 'SYNTHETIC Soul Urn'; // {T}: {B}{B}, only instants, sorceries, Demons and Spirits
const SPIRIT = 'SYNTHETIC Wisp Spirit'; // {B}{B} creature, a Spirit
const MURDER = 'Murder'; // {1}{B}{B} instant
const BEARS = 'Grizzly Bears'; // {1}{G}
const LIBRARY = Array.from({ length: 12 }, () => 'Swamp');

test('the cards are valid', () => {
  expect(validateCard(syntheticCard(URN))).toEqual([]);
  expect(validateCard(syntheticCard(SPIRIT))).toEqual([]);
});

describe('"instant, sorcery, Demon, and Spirit spells"', () => {
  const game = (hand: readonly string[], lands: readonly string[]) =>
    scenario()
      .seat(0)
      .library(...LIBRARY)
      .hand(...hand)
      .battlefield(URN, ...lands)
      .seat(1)
      .library(...LIBRARY)
      .battlefield('SYNTHETIC Vanilla 2/2')
      .build();

  test('an instant: the Urn’s {B}{B} and a Swamp pay for Murder', () => {
    const g = game([MURDER], ['Swamp']);
    g.expect.legal(0, { cast: MURDER });
  });

  test('a creature of a listed creature type: the Urn alone pays for a Spirit', () => {
    const g = game([SPIRIT], []);
    g.expect.legal(0, { cast: SPIRIT });
    g.act(0).cast(SPIRIT, { pay: true });
    g.passAll();
    g.expect.zone(SPIRIT, 'battlefield', { seat: 0 });
  });

  test('another creature spell is not paid for: the Urn and one Forest do not pay for {1}{G}', () => {
    const poor = game([BEARS], ['Forest']);
    poor.expect.illegal(0, { cast: BEARS });
    const rich = game([BEARS], ['Forest', 'Forest']);
    rich.expect.legal(0, { cast: BEARS });
  });

  test('tapped by hand it stays in the pool as restricted mana of both lists', () => {
    const g = game([SPIRIT], []);
    g.act(0).tapForMana(URN);
    expect(g.state.seats[0]?.manaPool[0]?.restriction).toEqual({
      kind: 'spellMatch',
      types: ['instant', 'sorcery'],
      subtypes: ['Demon', 'Spirit'],
      typesOrSubtypes: true,
    });
  });
});
