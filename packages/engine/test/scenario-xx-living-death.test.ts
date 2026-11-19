// "Each player exiles all creature cards from their graveyard, then sacrifices all creatures they control, then puts all cards they exiled this way onto the battlefield." (the Living Death
// shape, as the SYNTHETIC Mass Revival).
// Pins: CR 608.2c (a later instruction of a spell reads what an earlier one did: only the cards the first step exiled come back), CR 701.21a (each player sacrifices the creatures
// they control, all at once), CR 400.7j (the cards that were exiled are found in exile as new objects), CR 110.2 (each returned creature enters under its owner's control), CR 111.7
// (a sacrificed token ceases to exist). Cards are SYNTHETIC (src/cards/fixtures/synthetic-living-death.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { twoSeatGame } from './two-seat-helpers';

const SPELL = 'SYNTHETIC Mass Revival';
const CHANTER = 'SYNTHETIC Grave Chanter'; // enters: you gain 1 life
const MAKER = 'SYNTHETIC Zombie Maker'; // enters: create a 2/2 Zombie token
const SHROUD = 'SYNTHETIC Quiet Shroud'; // if a creature would die, exile it instead
const BEARS = 'Grizzly Bears';
const SPIDER = 'Giant Spider';
const ELVES = 'Llanowar Elves';
const RATS = 'Typhoid Rats';
const BOLT = 'Lightning Bolt';

const LANDS = { count: 5 } as const;

describe('the cards are valid', () => {
  test.each([SPELL, CHANTER, MAKER])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });
});

describe('each player exiles their creature cards, sacrifices their creatures, then gets the exiled cards back', () => {
  test('each player ends with the creature cards of their own graveyard; the sacrificed creatures are in the graveyards', () => {
    const g = twoSeatGame(
      (b) => b.hand(SPELL).battlefield('Swamp', LANDS).battlefield(BEARS).graveyard(ELVES, BOLT),
      (b) => b.battlefield(SPIDER).graveyard(RATS),
    );
    g.act(0).cast(SPELL, { pay: true });
    g.passAll();
    // What each had in their graveyard is on the battlefield under their control.
    g.expect.zone(ELVES, 'battlefield', { seat: 0, count: 1 });
    g.expect.zone(RATS, 'battlefield', { seat: 1, count: 1 });
    // The creatures they controlled were sacrificed after the exile: they are in their owners' graveyards, not back.
    g.expect.zone(BEARS, 'graveyard', { seat: 0, count: 1 });
    g.expect.zone(SPIDER, 'graveyard', { seat: 1, count: 1 });
    // A card that is not a creature card stays in the graveyard (and so does the spell, once it resolved).
    g.expect.zone(BOLT, 'graveyard', { seat: 0, count: 1 });
    g.expect.zone(SPELL, 'graveyard', { seat: 0, count: 1 });
    g.expect.invariants();
  });

  test('a creature card of one graveyard is never put under the other player', () => {
    const g = twoSeatGame(
      (b) => b.hand(SPELL).battlefield('Swamp', LANDS).graveyard(ELVES, BEARS),
      (b) => b.graveyard(RATS),
    );
    g.act(0).cast(SPELL, { pay: true });
    g.passAll();
    g.expect.zone(ELVES, 'battlefield', { seat: 0, count: 1 });
    g.expect.zone(BEARS, 'battlefield', { seat: 0, count: 1 });
    g.expect.zone(RATS, 'battlefield', { seat: 1, count: 1 });
    g.expect.noObject(RATS, { zone: 'battlefield', seat: 0 });
    g.expect.invariants();
  });

  test('a player with an empty graveyard just loses their creatures', () => {
    const g = twoSeatGame(
      (b) => b.hand(SPELL).battlefield('Swamp', LANDS).battlefield(BEARS),
      (b) => b.battlefield(SPIDER, ELVES),
    );
    g.act(0).cast(SPELL, { pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 0, count: 1 });
    g.expect.zone(SPIDER, 'graveyard', { seat: 1, count: 1 });
    g.expect.zone(ELVES, 'graveyard', { seat: 1, count: 1 });
    g.expect.noObject(BEARS, { zone: 'battlefield' });
    g.expect.noObject(SPIDER, { zone: 'battlefield' });
    g.expect.invariants();
  });

  test('nothing in any graveyard and no creature: nothing happens', () => {
    const g = twoSeatGame((b) => b.hand(SPELL).battlefield('Swamp', LANDS).graveyard(BOLT));
    g.act(0).cast(SPELL, { pay: true });
    g.passAll();
    g.expect.zone(BOLT, 'graveyard', { seat: 0, count: 1 });
    g.expect.invariants();
  });

  test('the returned creatures enter the battlefield: their enters triggers fire for their controller', () => {
    const g = twoSeatGame(
      (b) => b.hand(SPELL).battlefield('Swamp', LANDS).graveyard(CHANTER),
      (b) => b.graveyard(CHANTER),
    );
    g.act(0).cast(SPELL, { pay: true });
    g.passAll();
    g.expect.zone(CHANTER, 'battlefield', { seat: 0, count: 1 });
    g.expect.zone(CHANTER, 'battlefield', { seat: 1, count: 1 });
    // Each trigger is put on the stack and resolves: each player gains 1 life.
    g.passAll();
    g.expect.life(0, 21);
    g.expect.life(1, 21);
    g.expect.invariants();
  });

  test('a token that is sacrificed ceases to exist and is not returned', () => {
    const g = twoSeatGame(
      (b) => b.hand(MAKER, SPELL).battlefield('Swamp', { count: 7 }).graveyard(ELVES),
      (b) => b.graveyard(RATS),
    );
    g.act(0).cast(MAKER, { pay: true });
    g.passAll();
    g.expect.zone('Zombie', 'battlefield', { seat: 0, count: 1 });
    g.act(0).cast(SPELL, { pay: true });
    g.passAll();
    g.expect.noObject('Zombie');
    g.expect.zone(MAKER, 'graveyard', { seat: 0, count: 1 });
    g.expect.zone(ELVES, 'battlefield', { seat: 0, count: 1 });
    g.expect.zone(RATS, 'battlefield', { seat: 1, count: 1 });
    g.expect.invariants();
  });

  test('a creature that a replacement effect exiles instead of letting it die is not one of the cards put onto the battlefield', () => {
    // Only the cards the first instruction exiled come back: the sacrificed Bears are exiled by the Shroud, which is not "exiled this way".
    const g = twoSeatGame((b) =>
      b.hand(SPELL).battlefield('Swamp', LANDS).battlefield(BEARS, SHROUD).graveyard(ELVES),
    );
    g.act(0).cast(SPELL, { pay: true });
    g.passAll();
    g.expect.zone(ELVES, 'battlefield', { seat: 0, count: 1 });
    g.expect.zone(BEARS, 'exile', { seat: 0, count: 1 });
    g.expect.noObject(BEARS, { zone: 'battlefield' });
    g.expect.invariants();
  });
});
