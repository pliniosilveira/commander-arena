// The Jeskai free-cast cards (deck support issue 100): the REAL Oracle text of the acceptance cards (fixtures/corpus/golden.jsonl, taken from the issue) goes through the
// grammar as a card with no override, is defined in an engine scenario and is played through applyAction, so the nodes the parser writes for the real text are what the engine runs.
// Pins: CR 107.3a (the X announced), CR 202.3 (mana value), CR 608.2g and 118.9 (cast without paying its mana cost), CR 107.3b (X is 0 for it).
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const CARDS = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

/** The real card, imported through the grammar only; it must read as supported. */
function real(name: string): CardDefinition {
  const card = CARDS.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the fixture`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.unparsed, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

const BOLT = 'Lightning Bolt'; // {R}, mana value 1
const BEARS = 'Grizzly Bears'; // {1}{G}, mana value 2
const SPIDER = 'Giant Spider'; // {3}{G}, mana value 4

describe('Electrodominance', () => {
  const CARD = real('Electrodominance');
  const NAME = CARD.name;
  const game = (hand: readonly string[]) =>
    scenario()
      .define(CARD)
      .seat(0)
      .hand(NAME, ...hand)
      .battlefield('Mountain', 'Mountain', 'Mountain', 'Mountain')
      .seat(1)
      .life(20)
      .build();

  test('it reads as supported and is valid', () => {
    expect(validateCard(CARD)).toEqual([]);
  });

  test('X = 2: two damage, and a spell of mana value 2 or less is cast for free, the Spider is not offered', () => {
    const g = game([BOLT, BEARS, SPIDER]);
    g.act(0).cast(NAME, { x: 2, targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.life(1, 18);
    g.act(0).chooseCards(BOLT);
    g.act(0).chooseTargets({ player: 1 });
    g.passAll();
    g.expect.life(1, 15);
    g.expect.zone(BOLT, 'graveyard', { seat: 0 });
    g.expect.zone(SPIDER, 'hand', { seat: 0 });
  });

  test('X = 0 offers no spell: it deals nothing and the game goes on', () => {
    const g = game([BOLT]);
    g.act(0).cast(NAME, { x: 0, targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.life(1, 20);
    g.expect.zone(BOLT, 'hand', { seat: 0 });
    g.expect.pending('priority', 0);
  });
});

describe('Velomachus Lorehold', () => {
  const CARD = real('Velomachus Lorehold');
  const NAME = CARD.name;
  const ISLANDS = Array.from({ length: 7 }, () => 'Island');
  const game = (library: readonly string[]) =>
    scenario()
      .define(CARD)
      .seat(0)
      .life(20)
      .battlefield(NAME)
      .library(...library, ...ISLANDS)
      .seat(1)
      .life(20)
      .library(...ISLANDS)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('it reads as supported and is valid', () => {
    expect(validateCard(CARD)).toEqual([]);
  });

  test('attacking: the instants and sorceries of the top seven with mana value 5 or less are offered, one is cast for free', () => {
    const g = game([BOLT, 'Murder', 'Divination', BEARS]);
    g.advanceTo('declareAttackers');
    g.act(0).attack(NAME);
    g.passAll();
    const decision = g.state.pending;
    expect(decision?.kind).toBe('chooseCards');
    if (decision?.kind !== 'chooseCards') return;
    expect(decision.purpose).toBe('cast');
    // Divination is a sorcery, mana value 3: offered; the creature is not an instant or sorcery.
    expect([...decision.legal].sort()).toEqual(
      [g.id(BOLT), g.id('Murder'), g.id('Divination')].sort(),
    );
    g.act(0).chooseCards(BOLT);
    g.act(0).chooseTargets({ player: 1 });
    g.passAll();
    g.expect.zone(BOLT, 'graveyard', { seat: 0 });
    g.expect.life(1, 17);
  });
});

describe('Baral and Kari Zev', () => {
  const CARD = real('Baral and Kari Zev');
  const NAME = CARD.name;
  const MURDER = 'Murder';
  const game = (hand: readonly string[]) =>
    scenario()
      .define(CARD)
      .seat(0)
      .life(20)
      .hand(...hand)
      .battlefield(NAME, 'Swamp', 'Swamp', 'Swamp', 'Mountain')
      .library('Island', 'Island')
      .seat(1)
      .life(20)
      .battlefield('Typhoid Rats')
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('it reads as supported and is valid', () => {
    expect(validateCard(CARD)).toEqual([]);
  });

  test('the first instant of the turn, a Murder: the Bolt (lesser, an instant) is cast for free, and no token is created', () => {
    const g = game([MURDER, BOLT]);
    g.act(0).cast(MURDER, { targets: [{ name: 'Typhoid Rats' }], pay: true });
    g.passAll();
    g.act(0).chooseCards(BOLT);
    g.act(0).chooseTargets({ player: 1 });
    g.passAll();
    g.expect.life(1, 17);
    expect(g.find({ name: 'First Mate Ragavan', zone: 'battlefield' })).toHaveLength(0);
  });

  test('"If you don\'t": declining creates the legendary token, with haste until end of turn', () => {
    const g = game([MURDER, BOLT]);
    g.act(0).cast(MURDER, { targets: [{ name: 'Typhoid Rats' }], pay: true });
    g.passAll();
    g.act(0).chooseCards();
    const token = g.view(0).battlefield.find((o) => o.name === 'First Mate Ragavan');
    expect(token?.supertypes).toContain('legendary');
    expect(token?.power).toBe(2);
    expect(token?.toughness).toBe(1);
    expect(token?.keywords).toContain('haste');
  });

  test('nothing lesser in hand: the token without a question; the second instant of the turn triggers nothing more', () => {
    const g = game([BOLT, MURDER]);
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    expect(g.find({ name: 'First Mate Ragavan', zone: 'battlefield' })).toHaveLength(1);
    g.act(0).cast(MURDER, { targets: [{ name: 'Typhoid Rats' }], pay: true });
    g.passAll();
    expect(g.find({ name: 'First Mate Ragavan', zone: 'battlefield' })).toHaveLength(1);
    g.expect.pending('priority', 0);
  });
});

describe('Transforming Flourish', () => {
  const CARD = real('Transforming Flourish');
  const NAME = CARD.name;
  const game = (library: readonly string[]) =>
    scenario()
      .define(CARD)
      .seat(0)
      .life(20)
      .hand(NAME)
      .battlefield('Mountain', 'Mountain', 'Mountain')
      .seat(1)
      .life(20)
      .battlefield(BEARS)
      .library(...library, 'Island', 'Island')
      .build();

  test('it reads as supported and is valid', () => {
    expect(validateCard(CARD)).toEqual([]);
  });

  test('destroying the Bears: the opponent exiles to the Bolt, and casts it for free at the caster', () => {
    const g = game(['Island', BOLT]);
    g.act(0).cast(NAME, { targets: [{ name: BEARS }], pay: true });
    // Demonstrate: the copy is declined (CR 702.144a).
    g.passAll();
    g.act(0).decline();
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    g.expect.pending('chooseCards', 1);
    g.act(1).chooseCards(BOLT);
    g.act(1).chooseTargets({ player: 0 });
    g.passAll();
    g.expect.life(0, 17);
    g.expect.zone(BOLT, 'graveyard', { seat: 1 });
  });
});

describe('Transcendent Dragon', () => {
  const CARD = real('Transcendent Dragon');
  const NAME = CARD.name;
  const SIX = Array.from({ length: 6 }, () => 'Island');
  const respond = () => {
    const g = scenario()
      .define(CARD)
      .seat(0)
      .life(20)
      .hand(NAME)
      .battlefield(...SIX)
      .seat(1)
      .life(20)
      .hand(BOLT)
      .battlefield('Mountain')
      .at('precombatMain', { active: 1, turn: 2 })
      .build();
    g.act(1).cast(BOLT, { targets: [{ player: 0 }], pay: true });
    g.act(1).pass();
    return g;
  };

  test('it reads as supported and is valid', () => {
    expect(validateCard(CARD)).toEqual([]);
  });

  test('cast with flash in response: the Bolt is countered and exiled, and cast for free by the Dragon controller', () => {
    const g = respond();
    g.act(0).cast(NAME, { pay: true });
    g.passAll();
    g.expect.zone(BOLT, 'exile');
    g.act(0).chooseCards({ name: BOLT, zone: 'exile', seat: 1 });
    g.act(0).chooseTargets({ player: 1 });
    g.passAll();
    g.expect.life(0, 20);
    g.expect.life(1, 17);
    g.expect.zone(NAME, 'battlefield', { seat: 0 });
  });

  test('a Dragon that was not cast (put onto the battlefield by a scenario) does not trigger', () => {
    const g = scenario()
      .define(CARD)
      .seat(0)
      .life(20)
      .battlefield(NAME)
      .seat(1)
      .hand(BOLT)
      .battlefield('Mountain')
      .build();
    g.expect.zone(NAME, 'battlefield', { seat: 0 });
    g.expect.stack([]);
  });
});
