// Turbulent Steppe (stage P73, D-236): "This land enters tapped unless your opponents control eight or more lands." The text of the card
// was supplied by the owner (the decks/hofri.txt request); it is NOT a Scryfall extraction and the card is not in the golden corpus yet
// (the owner's `pnpm corpus:extract` will put it there, and `hofri-deck.test.ts` will then measure the real record). The card is built
// here from that text through the grammar only (the real name, a type line with two basic land types, the reminder text of the types and
// the one sentence), then played through applyAction. The condition reads as an `amountIs` of a `countOf` of lands the opponents control
// (CR 109.4: the objects a player controls; with several opponents, all of them together: CR 102.2), and is false as the land enters
// with the land not yet on the battlefield (CR 614.12).
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parseOnly } from './convert-grammar-helpers';
import { syntheticCard } from './convert-helpers';

const NAME = 'Turbulent Steppe';
const OWNER_TEXT =
  '({T}: Add {R} or {W}.)\nThis land enters tapped unless your opponents control eight or more lands.';

const imported = parseOnly(
  syntheticCard({ name: NAME, typeLine: 'Land — Mountain Plains', oracleText: OWNER_TEXT }),
);
const STEPPE = imported.definition;

describe('Turbulent Steppe, from the text the owner supplied', () => {
  test('every line is read: supported, nothing dropped', () => {
    expect(imported.support.unparsed).toEqual([]);
    expect(imported.support.reasons).toEqual([]);
    expect(imported.support.status).toBe('supported');
  });

  test('a land with the types Mountain and Plains, the two mana abilities and one conditional replacement', () => {
    const face = STEPPE.faces[0];
    expect(face?.types).toEqual(['land']);
    expect(face?.subtypes).toEqual(['Mountain', 'Plains']);
    expect(face?.abilities.map((a) => a.kind)).toEqual(['mana', 'mana', 'replacement']);
    expect(face?.abilities[2]).toEqual({
      kind: 'replacement',
      replacement: {
        kind: 'entersTapped',
        unless: {
          kind: 'amountIs',
          amount: { kind: 'countOf', filter: { types: ['land'], controller: 'opponent' } },
          compare: { cmp: 'atLeast', value: 8 },
        },
      },
    });
  });
});

describe('Turbulent Steppe played (CR 614.12, 109.4, 110.2)', () => {
  const play = (opponentLands: number, controlled: 0 | 1 = 1) => {
    const b = scenario().define(STEPPE).seat(0).hand(NAME).seat(1);
    if (opponentLands > 0)
      b.battlefield('Mountain', { count: opponentLands, controller: controlled });
    const g = b.build();
    g.act(0).playLand(NAME);
    return g;
  };

  test.each([0, 3, 7])('%i lands under the opponent: it enters tapped', (n) => {
    play(n).expect.tapped(NAME, true);
  });

  test.each([8, 9, 14])('%i lands under the opponent: it enters untapped', (n) => {
    play(n).expect.tapped(NAME, false);
  });

  test('your own lands do not count', () => {
    const g = scenario()
      .define(STEPPE)
      .seat(0)
      .hand(NAME)
      .battlefield('Mountain', { count: 9 })
      .seat(1)
      .battlefield('Mountain', { count: 7 })
      .build();
    g.act(0).playLand(NAME);
    g.expect.tapped(NAME, true);
  });

  test('control, not ownership, decides which side a land is on (CR 110.2)', () => {
    // Eight lands the opponent owns but you control: not lands your opponents control.
    play(8, 0).expect.tapped(NAME, true);
    // Eight lands you own that the opponent controls.
    const g = scenario()
      .define(STEPPE)
      .seat(0)
      .hand(NAME)
      .battlefield('Mountain', { count: 8, controller: 1 })
      .seat(1)
      .build();
    g.act(0).playLand(NAME);
    g.expect.tapped(NAME, false);
  });

  test('untapped, it taps for red or white; tapped, it makes no mana until it untaps', () => {
    const open = play(8);
    open.act(0).tapForMana(NAME, { ability: 1 });
    open.expect.pool(0, 'W');
    const shut = play(7);
    expect(shut.act(0).try.tapForMana(NAME, { ability: 0 }).ok).toBe(false);
  });
});
