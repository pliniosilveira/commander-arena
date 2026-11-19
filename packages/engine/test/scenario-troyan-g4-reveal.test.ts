// Troyan deck, group 4 (Rashmi, Eternities Crafter): "Whenever you cast your first spell each turn, reveal the top card of your library. You may cast it without
// paying its mana cost if it's a spell with lesser mana value. If you don't cast it, put it into your hand." (`revealTopCast`, SYNTHETIC First Spell Crafter).
// Pins: CR 701.20a (Reveal: public, the card stays on top), CR 608.2g (the cast happens as the trigger resolves, no timing restriction, no priority), CR 202.3e and
// 107.3b (an {X} counts as 0 in a library and when cast without paying), CR 113.7a and 608.2h (the mana value of the spell that caused the trigger as it last
// existed on the stack, when it has left it), CR 601.2i and 603.2 (the trigger is of the first spell cast this turn).
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const CRAFTER = 'SYNTHETIC First Spell Crafter';
const BEARS = 'Grizzly Bears';
const ANGEL = 'Serra Angel';
const DIVINATION = 'Divination';
const COUNTERSPELL = 'Counterspell';
const BOLT = 'Lightning Bolt';
const UNSUMMON = 'Unsummon';

const FILL = ['Island', 'Island', 'Island', 'Island'] as const;
const ISLANDS = ['Island', 'Island', 'Island'] as const;

const game = (library: readonly string[]) =>
  scenario()
    .seat(0)
    .library(...library)
    .hand(DIVINATION, UNSUMMON)
    .battlefield(CRAFTER, ...ISLANDS, ...ISLANDS)
    .seat(1)
    .library('Island', 'Island')
    .build();

describe('the card is valid', () => {
  test('the first-spell trigger and its effect', () => {
    expect(validateCard(syntheticCard(CRAFTER))).toEqual([]);
  });

  test('the limit is a whole amount', () => {
    const card = syntheticCard(CRAFTER);
    const face = card.faces[0];
    const ability = face?.abilities[0];
    if (face === undefined || ability?.kind !== 'triggered') throw new Error('no trigger');
    const limited = (manaValueBelow: unknown) =>
      ({
        ...card,
        faces: [
          {
            ...face,
            abilities: [{ ...ability, effect: { kind: 'revealTopCast', manaValueBelow } }],
          },
        ],
      }) as never;
    expect(validateCard(limited(3))).toEqual([]);
    expect(validateCard(limited(-1)).length).toBeGreaterThan(0);
  });
});

describe('"reveal the top card of your library. You may cast it without paying its mana cost if it\'s a spell with lesser mana value"', () => {
  test('a card with a lesser mana value is revealed and may be cast from the library; it resolves before the spell', () => {
    const g = game([BEARS, ...FILL]);
    g.act(0).cast(DIVINATION, { pay: true });
    // the trigger goes on the stack above the spell and is resolved first
    g.expect.stack([`${CRAFTER} (ability)`, DIVINATION]);
    g.passAll();
    g.expect.pending('confirmOptional', 0);
    const revealed = g.events.find((e) => e.kind === 'cardsRevealed');
    expect(revealed?.kind === 'cardsRevealed' ? revealed.names : []).toEqual([BEARS]);
    expect(revealed?.kind === 'cardsRevealed' ? revealed.from : '').toBe('library');
    g.act(0).accept();
    // the trigger goes on resolving: the card is cast, on top of the spell that caused it
    g.expect.stack([BEARS, DIVINATION]);
    g.expect.librarySize(0, 4);
    const cast = g.events.findLast((e) => e.kind === 'spellCast');
    expect(cast?.kind === 'spellCast' ? cast.fromZone : '').toBe('library');
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('the card is cast without paying: no mana is spent', () => {
    const g = game([BEARS, ...FILL]);
    g.act(0).cast(DIVINATION, { pay: true });
    g.passAll();
    g.act(0).accept();
    // Divination was paid with three of the six Islands; the three left are untouched by the free cast
    const tappedLands = g.state.battlefield.filter((id) => g.state.objects[id]?.tapped === true);
    expect(tappedLands).toHaveLength(3);
    g.expect.invariants();
  });

  test('declining puts the revealed card into the hand', () => {
    const g = game([BEARS, ...FILL]);
    g.act(0).cast(DIVINATION, { pay: true });
    g.passAll();
    g.act(0).decline();
    g.expect.zone(BEARS, 'hand', { seat: 0 });
    g.expect.librarySize(0, 4);
    g.expect.stack([DIVINATION]);
  });

  test('a card whose mana value is not lesser is not offered and goes into the hand', () => {
    const g = game([ANGEL, ...FILL]);
    g.act(0).cast(DIVINATION, { pay: true });
    g.passAll();
    // nothing was asked: the card is in the hand, and the spell resolved after the trigger
    g.expect.zone(ANGEL, 'hand', { seat: 0 });
    g.expect.zone(DIVINATION, 'graveyard', { seat: 0 });
    g.expect.pending('priority', 0);
  });

  test('a card of the same mana value is not lesser', () => {
    // Divination ({2}{U}) against a card with mana value 3 of the library: Divination itself
    const g = game([DIVINATION, ...FILL]);
    g.act(0).cast(DIVINATION, { pay: true });
    g.passAll();
    g.expect.zone(DIVINATION, 'hand', { seat: 0 });
  });

  test('a land card is not a spell: it goes into the hand', () => {
    const g = game(['Island', BEARS, ...FILL]);
    g.act(0).cast(DIVINATION, { pay: true });
    g.passAll();
    g.expect.zone('Island', 'hand', { seat: 0 });
    g.expect.librarySize(0, 3);
  });

  test('an empty library reveals nothing', () => {
    const g = game([]);
    g.act(0).cast(UNSUMMON, { targets: [CRAFTER], pay: true });
    g.passAll();
    expect(g.events.some((e) => e.kind === 'cardsRevealed')).toBe(false);
    g.expect.zone(CRAFTER, 'hand', { seat: 0 });
  });

  test('only the first spell of the turn triggers it', () => {
    const g = game([BEARS, BEARS, ...FILL]);
    g.act(0).cast(DIVINATION, { pay: true });
    g.passAll();
    g.act(0).decline();
    g.passAll();
    g.expect.stack([]);
    g.act(0).cast(UNSUMMON, { targets: [CRAFTER], pay: true });
    g.expect.stack([UNSUMMON]);
    g.expect.librarySize(0, 3);
    expect(g.events.filter((e) => e.kind === 'cardsRevealed')).toHaveLength(1);
  });

  test('the mana value of a spell that was countered in response is read as it last was on the stack', () => {
    const g = scenario()
      .seat(0)
      .library(BEARS, 'Island')
      .hand(DIVINATION)
      .battlefield(CRAFTER, ...ISLANDS)
      .seat(1)
      .library('Island', 'Island')
      .hand(COUNTERSPELL)
      .battlefield('Island', 'Island')
      .build();
    g.act(0).cast(DIVINATION, { pay: true });
    g.act(0).pass();
    g.act(1).cast(COUNTERSPELL, { targets: [DIVINATION], pay: true });
    g.passAll();
    // the trigger resolves after the spell was countered: Divination's mana value (3) still limits the card
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
  });

  test('a card with a target that cannot be targeted is not offered and goes into the hand', () => {
    const g = scenario()
      .seat(0)
      .library(BOLT, 'Island')
      .hand(DIVINATION)
      .battlefield(CRAFTER, ...ISLANDS)
      .seat(1)
      .library('Island', 'Island')
      .build();
    g.act(0).cast(DIVINATION, { pay: true });
    g.passAll();
    // Lightning Bolt has legal targets (the players), so it is offered
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    g.expect.pending('targets', 0);
  });
});
