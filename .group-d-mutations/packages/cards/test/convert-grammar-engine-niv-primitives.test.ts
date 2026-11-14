// The Niv-Mizzet deck (issue 25), four primitives (D-318 to D-321): the REAL Oracle text of Stella Lee, Wild Card, Firemind Vessel, Bender's Waterskin and
// Ivory Tower (the corpus's golden.jsonl, taken from the issue) goes through the grammar as a card with no override, is defined in an engine scenario and
// is played through applyAction, so the nodes the parser writes for the real text are what the engine runs. The helper cards are SYNTHETIC
// (src/cards/fixtures) or old fixtures. Pins: CR 602.5b (a restriction on activating), CR 601.2i (a spell is cast), CR 707.10 (a copy of a spell is not
// cast), CR 106.1b (colorless is not a color), CR 502.3 (untap step), CR 107.1b (a negative amount counts as 0), CR 119.3 (life).
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

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

const FILLER = Array.from({ length: 12 }, () => 'Mountain');
const BOLT = 'Lightning Bolt'; // {R}: 3 damage to any target
const MEND = 'SYNTHETIC Mend'; // {W} instant: you gain 3 life
const MEND_TWICE = 'SYNTHETIC Mend Twice'; // {1}{W} instant: you gain 2 life, then 2 more

// ---- Stella Lee, Wild Card

describe('Stella Lee, Wild Card: "{T}: Copy target instant or sorcery spell you control. ... Activate only if you\'ve cast three or more spells this turn." (CR 602.5b, 601.2i)', () => {
  const stella = real('Stella Lee, Wild Card');
  const STELLA = stella.name;

  const base = () =>
    scenario()
      .define(stella)
      .seat(0)
      .life(20)
      .battlefield(STELLA, 'Mountain', 'Plains', 'Plains', 'Plains')
      .hand(MEND, BOLT, MEND_TWICE)
      .library(...FILLER)
      .seat(1)
      .life(20)
      .library(...FILLER)
      .at('precombatMain')
      .build();

  test('the card is valid', () => {
    expect(validateCard(stella)).toEqual([]);
  });

  test('refused with two spells cast; the third spell makes the copy ability legal, and the copy is not counted', () => {
    const g = base();
    g.act(0).cast(MEND, { pay: true });
    g.passAll();
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.passAll(); // the second spell: Stella's first ability exiles the top card; the Bolt resolves
    g.expect.life(1, 17);
    expect(g.state.seats[0]?.spellsCastThisTurn).toBe(2);
    g.expect.illegal(0, { activate: STELLA });
    g.act(0).cast(MEND_TWICE, { pay: true });
    expect(g.state.seats[0]?.spellsCastThisTurn).toBe(3);
    g.expect.legal(0, { activate: STELLA });
    g.act(0).activate(STELLA, { targets: [{ name: MEND_TWICE, zone: 'stack' }] });
    g.passAll();
    expect(g.state.seats[0]?.spellsCastThisTurn).toBe(3); // the copy was not cast
    g.expect.life(0, 20 + 3 + 4 + 4);
    g.expect.tapped(STELLA, true);
    g.expect.invariants();
  });

  test('with one spell cast the ability cannot be activated, even with a spell to copy on the stack', () => {
    const g = base();
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.expect.illegal(0, { activate: STELLA });
  });
});

// ---- Firemind Vessel

describe('Firemind Vessel: "This artifact enters tapped. {T}: Add two mana of different colors." (CR 106.1b, 605.3b)', () => {
  const vessel = real('Firemind Vessel');
  const VESSEL = vessel.name;
  const SIP = 'SYNTHETIC Azorius Sip'; // {W}{U}
  const PAIR = 'SYNTHETIC Green Pair'; // {G}{G}

  const base = (...hand: string[]) =>
    scenario()
      .define(vessel)
      .seat(0)
      .hand(...hand)
      .battlefield(VESSEL)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain')
      .build();

  test('the card is valid', () => {
    expect(validateCard(vessel)).toEqual([]);
  });

  test('it enters tapped (a land-less cast: {4} from the hand)', () => {
    const g = scenario()
      .define(vessel)
      .seat(0)
      .hand(VESSEL)
      .battlefield('Mountain', { count: 4 })
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain')
      .build();
    g.act(0).cast(VESSEL, { pay: true });
    g.passAll();
    g.expect.zone(VESSEL, 'battlefield');
    g.expect.tapped(VESSEL, true);
  });

  test('ten pairs of different colors are offered; neither colorless nor a color twice', () => {
    const g = base();
    const pairs = g
      .legalActions(0)
      .flatMap((a) =>
        a.kind === 'activateAbility' && a.source === g.id(VESSEL) && a.combination
          ? [a.combination.join('')]
          : [],
      );
    expect(pairs).toHaveLength(10);
    expect(pairs.every((p) => !p.includes('C') && p[0] !== p[1])).toBe(true);
  });

  test('it pays {W}{U} alone, and the pair goes to the pool when tapped by hand', () => {
    const g = base(SIP);
    g.act(0).cast(SIP, { pay: true });
    g.expect.tapped(VESSEL, true);
    g.passAll();
    g.expect.life(0, 41);
    const h = base();
    h.act(0).tapForMana(VESSEL, { combination: 'BG' });
    h.expect.pool(0, 'BG');
  });

  test('it cannot pay {G}{G} alone, and with a Forest it can', () => {
    const g = base(PAIR);
    g.expect.illegal(0, { cast: PAIR });
    const h = scenario()
      .define(vessel)
      .seat(0)
      .hand(PAIR)
      .battlefield(VESSEL, 'Forest')
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain')
      .build();
    h.expect.legal(0, { cast: PAIR });
  });
});

// ---- Bender's Waterskin

describe('Bender\'s Waterskin: "Untap this artifact during each other player\'s untap step. {T}: Add one mana of any color." (CR 502.3)', () => {
  const skin = real("Bender's Waterskin");
  const SKIN = skin.name;

  const atEndOfSeat0 = (tapped: boolean) =>
    scenario()
      .define(skin)
      .seat(0)
      .library(...FILLER)
      .battlefield(SKIN, { tapped })
      .seat(1)
      .library(...FILLER)
      .at('end', { active: 0, turn: 1 })
      .build();

  test('the card is valid', () => {
    expect(validateCard(skin)).toEqual([]);
  });

  test("tapped for mana on its controller's turn, it untaps in the opponent's untap step, and again after each tap", () => {
    const g = atEndOfSeat0(true);
    g.advanceTo('upkeep', { turn: 'next' });
    expect(g.state.turn.activeSeat).toBe(1);
    g.expect.tapped(SKIN, false);
    g.pass(1);
    g.act(0).tapForMana(SKIN, { color: 'U' }); // on the opponent's turn
    g.expect.tapped(SKIN, true);
    g.advanceTo('upkeep', { turn: 'next' }); // its controller's own untap step: the normal untap
    expect(g.state.turn.activeSeat).toBe(0);
    g.expect.tapped(SKIN, false);
    g.act(0).tapForMana(SKIN, { color: 'U' });
    g.expect.tapped(SKIN, true);
    g.advanceTo('upkeep', { turn: 'next' }); // the opponent's untap step again
    g.expect.tapped(SKIN, false);
    g.expect.invariants();
  });

  test('an ordinary artifact does not untap in the opponent untap step (the control)', () => {
    const g = scenario()
      .seat(0)
      .library(...FILLER)
      .battlefield('Sol Ring', { tapped: true })
      .seat(1)
      .library(...FILLER)
      .at('end', { active: 0, turn: 1 })
      .build();
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.tapped('Sol Ring', true);
  });

  test("one controlled by the other player untaps in the first player's untap step", () => {
    const g = scenario()
      .define(skin)
      .seat(0)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .battlefield(SKIN, { tapped: true, controller: 0 })
      .at('end', { active: 1, turn: 2 })
      .build();
    g.advanceTo('upkeep'); // seat 0 is the controller: the ordinary untap
    g.expect.tapped({ name: SKIN, seat: 0 }, false);
  });
});

// ---- Ivory Tower

describe('Ivory Tower: "At the beginning of your upkeep, you gain X life, where X is the number of cards in your hand minus 4." (CR 107.1b)', () => {
  const tower = real('Ivory Tower');
  const TOWER = tower.name;

  /** Seat 1 has the turn before: at its end step, so the upkeep of seat 0 is next. */
  const upkeepWith = (cards: number) =>
    scenario()
      .define(tower)
      .seat(0)
      .life(20)
      .battlefield(TOWER)
      .hand(...Array.from({ length: cards }, () => 'Forest'))
      .library(...FILLER)
      .seat(1)
      .life(20)
      .library(...FILLER)
      .at('end', { active: 1, turn: 2 })
      .build();

  test('the card is valid', () => {
    expect(validateCard(tower)).toEqual([]);
  });

  test('a hand of 7 at the upkeep (the draw step is later) gains 3 life', () => {
    const g = upkeepWith(7);
    g.advanceTo('upkeep');
    g.passAll();
    g.expect.life(0, 23);
  });

  test('a hand of 4 or fewer gains nothing and loses nothing', () => {
    for (const cards of [4, 3, 0]) {
      const g = upkeepWith(cards);
      g.advanceTo('upkeep');
      g.passAll();
      g.expect.life(0, 20);
    }
  });

  test('a hand of 5 gains 1 life', () => {
    const g = upkeepWith(5);
    g.advanceTo('upkeep');
    g.passAll();
    g.expect.life(0, 21);
  });

  test("the trigger is for its controller's upkeep only: the opponent's upkeep gains nothing", () => {
    const g = scenario()
      .define(tower)
      .seat(0)
      .life(20)
      .battlefield(TOWER)
      .hand(...Array.from({ length: 7 }, () => 'Forest'))
      .library(...FILLER)
      .seat(1)
      .life(20)
      .library(...FILLER)
      .at('end', { active: 0, turn: 1 })
      .build();
    g.advanceTo('upkeep');
    g.passAll();
    g.expect.life(0, 20);
    g.expect.life(1, 20);
  });
});
