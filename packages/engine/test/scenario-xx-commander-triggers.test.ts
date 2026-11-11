// "Whenever your commander enters or attacks" and "Whenever a commander you control enters or attacks" (D-149).
// Pins: CR 903.3 (a commander is a card a player designated; a token or a copy of one is not), CR 603.6a (enters), CR 508.1 (attacks), CR 122.1
// (a page counter), CR 602.2 and 118.3 (a cost that removes a counter). "Your commander" is one the ability's controller owns and
// designated, whoever controls it; "a commander you control" is any commander on the battlefield under their control.
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-commander-triggers.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const BOOK = 'SYNTHETIC Chronicle Book';
const ADMIRER = 'SYNTHETIC Command Admirer';
const COMMANDER = 'Isamaru, Hound of Konda'; // 2/2
const BEARS = 'Grizzly Bears';
const LIBRARY = Array.from({ length: 12 }, () => 'Plains');

describe('the cards are valid', () => {
  test.each([BOOK, ADMIRER])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });
});

describe('"Whenever your commander enters or attacks, put a page counter on this artifact"', () => {
  test('the commander is cast from the command zone: a counter', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .command(COMMANDER, { commander: true })
      .battlefield(BOOK, 'Plains', 'Plains')
      .seat(1)
      .build();
    g.expect.counters(BOOK, {});
    g.act(0).cast(COMMANDER, { pay: true });
    g.passAll();
    g.expect.counters(BOOK, { page: 1 });
  });

  test('the commander attacks: another counter', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(COMMANDER, { commander: true })
      .battlefield(BOOK)
      .seat(1)
      .library(...LIBRARY)
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack(COMMANDER);
    g.passAll();
    g.expect.counters(BOOK, { page: 1 });
  });

  test('a creature that is not a commander does nothing', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .hand(BEARS)
      .battlefield(BEARS, BOOK, 'Forest', 'Forest')
      .seat(1)
      .library(...LIBRARY)
      .build();
    g.act(0).cast(`${BEARS}[0]`, { pay: true });
    g.passAll();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack(`${BEARS}[0]`);
    g.passAll();
    g.expect.counters(BOOK, {});
  });

  test("another player's commander that I control is not mine", () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(BOOK)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(COMMANDER, { commander: true, controller: 0 })
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack(COMMANDER);
    g.passAll();
    g.expect.counters(BOOK, {});
  });

  test('a page counter is spent to draw a card: {1}, {T}, remove a page counter', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(BOOK, { counters: { page: 2 } })
      .battlefield('Plains')
      .seat(1)
      .build();
    g.act(0).activate(BOOK, { pay: true });
    g.passAll();
    g.expect.counters(BOOK, { page: 1 });
    g.expect.handSize(0, 1);
  });
});

describe('"Whenever a commander you control enters or attacks, you gain 1 life"', () => {
  test('my commander entering: 1 life', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .command(COMMANDER, { commander: true })
      .battlefield(ADMIRER, 'Plains', 'Plains')
      .seat(1)
      .library(...LIBRARY)
      .build();
    g.act(0).cast(COMMANDER, { pay: true });
    g.passAll();
    g.expect.life(0, 41);
  });

  test("a commander of the opponent's that I control counts: it is a commander I control", () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(ADMIRER)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(COMMANDER, { commander: true, controller: 0 })
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack(COMMANDER);
    g.passAll();
    g.expect.life(0, 41);
  });

  test("the opponent's commander under their control does not", () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(ADMIRER)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(COMMANDER, { commander: true })
      .at('precombatMain', { active: 1 })
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(1).attack(COMMANDER);
    g.passAll();
    g.expect.life(0, 40);
  });

  test('a creature that is not a commander does not', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(ADMIRER, BEARS)
      .seat(1)
      .library(...LIBRARY)
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack(BEARS);
    g.passAll();
    g.expect.life(0, 40);
  });
});
