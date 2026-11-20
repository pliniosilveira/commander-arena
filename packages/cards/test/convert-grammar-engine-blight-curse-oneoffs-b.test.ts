// The Blight Curse deck, group "one-offs B": the REAL Oracle text of Vraska, Betrayal's Sting from the golden corpus goes through the grammar as a card with no override, is defined in an
// engine scenario and is played through applyAction (the activated ability of Oft-Nabbed Goat is in convert-grammar-engine-blight-curse-counters.test.ts). Pins: CR 702.150a
// (Compleated), 107.4f (Phyrexian mana paid with 2 life), 306.5b (a planeswalker enters with its loyalty), 205.1a and 205.3g ("becomes a Treasure artifact"), 613.1d, 613.1f
// (the layers), 611.2a (no duration), 605.1a (the mana ability a Treasure has), 122.1 and 704.5c (poison counters), 107.1b (a negative number is 0).
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES, parsed } from './convert-grammar-helpers';

const GOLDEN = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

/** The real card of the golden corpus, imported through the grammar only; it must read as supported. */
function real(name: string): CardDefinition {
  const card = GOLDEN.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.unparsed, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

const BEARS = 'Grizzly Bears';
const LIBRARY = Array.from({ length: 10 }, () => 'Plains');

describe("Vraska, Betrayal's Sting", () => {
  const vraska = real("Vraska, Betrayal's Sting");
  const VRASKA = vraska.name;
  const ZERO = 1;
  const MINUS_TWO = 2;
  const MINUS_NINE = 3;

  const onBattlefield = (poison = 0) =>
    scenario()
      .define(vraska)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(VRASKA, { counters: { loyalty: 9 } })
      .battlefield('Serra Angel', { label: 'angel' })
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS, { label: 'bears' })
      .poison(poison)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('the card is valid and has the compleated keyword and the three loyalty abilities', () => {
    expect(validateCard(vraska)).toEqual([]);
    const abilities = vraska.faces[0]?.abilities ?? [];
    expect(abilities[0]).toEqual({ kind: 'keyword', keyword: { kind: 'compleated' } });
    expect(abilities.filter((a) => a.kind === 'activated')).toHaveLength(3);
  });

  describe('Compleated (CR 702.150a)', () => {
    const cast = (swamps: number) =>
      scenario()
        .define(vraska)
        .seat(0)
        .library(...LIBRARY)
        .hand(VRASKA)
        .battlefield('Swamp', { count: swamps })
        .seat(1)
        .library(...LIBRARY)
        .at('precombatMain', { active: 0, turn: 3 })
        .build();

    test('paid with mana only, it enters with its printed six loyalty counters (CR 306.5b)', () => {
      const g = cast(6);
      g.act(0).cast(VRASKA, { pay: true });
      g.passAll();
      g.expect.zone(VRASKA, 'battlefield', { seat: 0 });
      g.expect.counters(VRASKA, { loyalty: 6 });
      g.expect.life(0, 40);
    });

    test('with {B/P} paid with 2 life, it enters with two fewer loyalty counters (CR 107.4f, 702.150a)', () => {
      const g = cast(5);
      g.act(0).cast(VRASKA, { pay: true });
      g.passAll();
      g.expect.zone(VRASKA, 'battlefield', { seat: 0 });
      g.expect.counters(VRASKA, { loyalty: 4 });
      g.expect.life(0, 38);
    });
  });

  describe('0: You draw a card and lose 1 life. Proliferate.', () => {
    test('is still read as before', () => {
      const g = onBattlefield();
      const hand = g.state.seats[0]?.hand.length ?? 0;
      g.act(0).activate(VRASKA, { ability: ZERO });
      g.passAll();
      expect(g.state.seats[0]?.hand.length).toBe(hand + 1);
      g.expect.life(0, 39);
    });
  });

  describe('-2: Target creature becomes a Treasure artifact ... and loses all other card types and abilities.', () => {
    test('the creature is only a Treasure artifact with the Treasure mana ability, for good (CR 205.1a, 613.1d, 611.2a)', () => {
      const g = onBattlefield();
      g.act(0).activate(VRASKA, { ability: MINUS_TWO, targets: ['bears'] });
      g.passAll();
      g.expect.counters(VRASKA, { loyalty: 7 });
      g.expect.derived('bears', { types: ['artifact'], subtypes: ['Treasure'] });
      // not a creature any more: it has no power or toughness to read and the 2/2 body is gone
      expect(g.view(1).battlefield.find((o) => o.name === BEARS)?.types).toEqual(['artifact']);
      // it stays so across turns (no duration)
      g.expect.derived('bears', { types: ['artifact'], subtypes: ['Treasure'] });
    });

    test('its only ability is "{T}, Sacrifice this artifact: Add one mana of any color" (CR 613.1f, 605.1a)', () => {
      const g = onBattlefield();
      g.act(0).activate(VRASKA, { ability: MINUS_TWO, targets: ['angel'] });
      g.passAll();
      // the Angel's flying and vigilance are lost with the rest (layer 6)
      g.expect.derived('angel', { keywords: [] });
      g.act(0).tapForMana('angel', { color: 'G' });
      g.expect.noObject('angel');
      expect(g.state.seats[0]?.manaPool.map((m) => m.color)).toEqual(['G']);
    });
  });

  describe('-9: If target player has fewer than nine poison counters, they get a number of poison counters equal to the difference.', () => {
    const run = (poison: number) => {
      const g = onBattlefield(poison);
      g.act(0).activate(VRASKA, { ability: MINUS_NINE, targets: [{ player: 1 }] });
      g.passAll();
      return g;
    };

    test('a player with no poison counters gets nine (CR 122.1)', () => {
      const g = run(0);
      expect(g.state.seats[1]?.poison).toBe(9);
      expect(g.state.seats[1]?.hasLost).toBe(false);
    });

    test('a player with four gets five, to nine in all (the difference)', () => {
      const g = run(4);
      expect(g.state.seats[1]?.poison).toBe(9);
    });

    test('a player with nine or more gets none (CR 107.1b: a negative number is 0)', () => {
      expect(run(9).state.seats[1]?.poison).toBe(9);
      expect(run(12).state.seats[1]?.poison).toBe(12);
    });
  });
});

describe('the grammar: Vraska effects with SYNTHETIC wrappers', () => {
  test('"If target player has fewer than ten poison counters, they get a number of poison counters equal to the difference." gives the difference to ten', () => {
    const card = parsed(
      'SYNTHETIC Ten Poison',
      'Sorcery',
      'If target player has fewer than ten poison counters, they get a number of poison counters equal to the difference.',
      { manaCost: '{B}' },
    );
    const g = scenario()
      .define(card)
      .seat(0)
      .library(...LIBRARY)
      .hand(card.name)
      .battlefield('Swamp')
      .seat(1)
      .library(...LIBRARY)
      .poison(3)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).cast(card.name, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    expect(g.state.seats[1]?.poison).toBe(10);
    // ten counters: the player has lost (CR 704.5c)
    expect(g.state.seats[1]?.hasLost).toBe(true);
  });
});
