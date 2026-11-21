// "Choose a creature type. Reveal cards from the top of your library until you reveal X creature cards of the chosen type, where X is the number of creatures you control
// of that type. Put those cards onto the battlefield, then shuffle the rest of the revealed cards into your library."
// Pins: CR 608.2d and 205.3m (the type chosen as the spell resolves is read by the filter and by the count), CR 701.20 (Reveal), CR 107.3c (X is what the text defines),
// CR 701.24 (Shuffle), CR 110.2a (put onto the battlefield under the control of the player doing it). Cards are SYNTHETIC (src/cards/fixtures/synthetic-chosen-reveal.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const SUMMONS = 'SYNTHETIC Kin Summons';
const ELVES = 'Llanowar Elves'; // Elf Druid
const BEARS = 'Grizzly Bears'; // Bear
const ANGEL = 'Serra Angel';
const FILLER = Array.from({ length: 6 }, () => 'Forest');

describe('the card is valid', () => {
  test(SUMMONS, () => {
    expect(validateCard(syntheticCard(SUMMONS))).toEqual([]);
  });
});

describe('reveal until X creature cards of the chosen type, X the creatures you control of it', () => {
  const game = (top: readonly string[]) =>
    scenario()
      .seat(0)
      .hand(SUMMONS)
      .battlefield('Forest', 'Forest', ELVES, ELVES)
      .library(...top, ...FILLER)
      .seat(1)
      .library(...FILLER)
      .build();

  // Two Forests and two Elves at the start.
  const permanents = (g: ReturnType<typeof game>) =>
    Object.values(g.state.objects).filter((o) => o.zone === 'battlefield' && o.controller === 0)
      .length;

  test('two Elves are controlled: cards are revealed until two Elf cards, which enter; the rest stay in the library', () => {
    const g = game([BEARS, ELVES, ANGEL, ELVES, BEARS]);
    g.act(0).cast(SUMMONS, { pay: true });
    g.passAll();
    g.act(0).chooseOption('Elf');
    const reveal = g.events.find((e) => e.kind === 'cardsRevealed');
    expect(reveal?.kind === 'cardsRevealed' ? reveal.names : []).toEqual([
      BEARS,
      ELVES,
      ANGEL,
      ELVES,
    ]);
    expect(permanents(g)).toBe(6);
    g.expect.zone(BEARS, 'library', { seat: 0 });
    g.expect.zone(ANGEL, 'library', { seat: 0 });
    g.expect.invariants();
  });

  test('a type none of your creatures has: X is 0 and nothing is revealed', () => {
    const g = game([BEARS, ELVES]);
    g.act(0).cast(SUMMONS, { pay: true });
    g.passAll();
    g.act(0).chooseOption('Angel');
    expect(g.events.some((e) => e.kind === 'cardsRevealed')).toBe(false);
    g.expect.zone(ELVES, 'library', { seat: 0 });
  });
});

// "Choose a creature type. Return up to two creature cards of that type from your graveyard to the battlefield. If this spell was foretold, return all creature cards of that
// type from your graveyard to the battlefield instead." Pins: CR 608.2d (the chosen cards), CR 702.143a (a spell cast for its foretell cost was foretold), CR 110.2a.
const REVIVAL = 'SYNTHETIC Kin Revival';

describe('return up to two creature cards of the chosen type; all of them when foretold', () => {
  test('the card is valid', () => {
    expect(validateCard(syntheticCard(REVIVAL))).toEqual([]);
  });

  const game = () =>
    scenario()
      .seat(0)
      .hand(REVIVAL)
      .battlefield('Swamp', 'Swamp', 'Swamp', 'Swamp', 'Swamp')
      .graveyard(ELVES, ELVES, ELVES, BEARS)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  const mine = (g: ReturnType<typeof game>) =>
    Object.values(g.state.objects).filter((o) => o.zone === 'battlefield' && o.controller === 0)
      .length;

  test('cast from the hand: at most two of the chosen type are offered and returned', () => {
    const g = game();
    g.act(0).cast(REVIVAL, { pay: true });
    g.passAll();
    g.act(0).chooseOption('Elf');
    const d = g.state.pending;
    expect(d?.kind).toBe('chooseCards');
    if (d?.kind !== 'chooseCards') return;
    expect(d.legal).toHaveLength(3);
    expect(d.max).toBe(2);
    g.act(0).choose({ kind: 'chooseCards', objects: d.legal.slice(0, 2) });
    expect(mine(g)).toBe(7);
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
  });

  test('cast foretold: every creature card of the chosen type returns, with no choice of cards', () => {
    const g = game();
    g.act(0).foretell(REVIVAL, { pay: true });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.act(0).cast(REVIVAL, { alternative: 'foretell', pay: true });
    g.passAll();
    g.act(0).chooseOption('Elf');
    expect(mine(g)).toBe(8);
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
  });
});
