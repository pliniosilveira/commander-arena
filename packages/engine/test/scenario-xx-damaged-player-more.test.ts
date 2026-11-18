// "Whenever this creature deals combat damage to a player who controls more lands than you, return it to its owner's hand. If you do, you may search your library for a Plains
// card, put it onto the battlefield tapped, then shuffle." (Cartographer's Hawk, as the SYNTHETIC Map Hawk of src/cards/fixtures/synthetic-player-more.ts): the trigger's own
// condition `triggerPlayerHasMore` compares the player damaged with the controller of the ability as the damage is dealt, and is not read again as the ability resolves.
// Pins: CR 603.2 (a trigger's event, read as it happens; a trigger condition that is not an intervening "if" is not checked again, CR 603.4), CR 510.2 (combat damage is dealt at
// once), CR 608.2c ("if you do" reads whether the instruction before was done), CR 701.23 (Search) and 701.24 (Shuffle), CR 205.3i (land types: a nonbasic land can have Plains).
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const HAWK = 'SYNTHETIC Map Hawk';
const DUAL = 'SYNTHETIC Plains Forest Dual';
const LIBRARY = ['Island', 'Plains', DUAL, 'Forest'];

describe('the card is valid', () => {
  test(HAWK, () => {
    expect(validateCard(syntheticCard(HAWK))).toEqual([]);
  });
});

/** Seat 0 attacks seat 1 with the Hawk (and holds `mine` Swamps); seat 1 has `theirs` Forests. */
function attack(mine: number, theirs: number) {
  const g = scenario()
    .define(syntheticCard(HAWK))
    .seat(0)
    .battlefield(HAWK, ...Array.from({ length: mine }, () => 'Swamp'))
    .library(...LIBRARY)
    .seat(1)
    .library('Island', 'Island')
    .battlefield(...Array.from({ length: theirs }, () => 'Forest'))
    .seat(0)
    .at('beginningOfCombat', { active: 0 })
    .build();
  g.advanceTo('declareAttackers');
  g.act(0).attack([{ name: HAWK, seat: 0 }]);
  g.advanceTo('combatDamage');
  return g;
}

describe('the damaged player must control strictly more lands than you', () => {
  test('more lands: the ability triggers, the Hawk returns to its owner hand and a Plains is fetched tapped', () => {
    const g = attack(1, 2);
    g.expect.stack([`${HAWK} (ability)`]);
    g.passAll();
    g.expect.zone(HAWK, 'hand', { seat: 0, count: 1 });
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    g.expect.pending('chooseCards', 0);
    g.act(0).chooseCards('Plains');
    g.expect.zone('Plains', 'battlefield', { seat: 0, count: 1 });
    g.expect.eventLog(
      [
        { kind: 'librarySearched', seat: 0, found: 1 },
        { kind: 'libraryShuffled', seat: 0 },
      ],
      { since: 0 },
    );
    g.expect.librarySize(0, LIBRARY.length - 1);
    g.expect.invariants();
  });

  test('the Plains comes onto the battlefield tapped', () => {
    const g = attack(0, 1);
    g.passAll();
    g.act(0).accept();
    g.act(0).chooseCards('Plains');
    const found = g.find({ name: 'Plains', zone: 'battlefield', seat: 0 });
    expect(found).toHaveLength(1);
    expect(found.every((p) => p.tapped)).toBe(true);
  });

  test('a nonbasic land with the land type Plains can be found', () => {
    const g = attack(0, 1);
    g.passAll();
    g.act(0).accept();
    g.act(0).chooseCards(DUAL);
    g.expect.zone(DUAL, 'battlefield', { seat: 0, count: 1 });
    g.expect.tapped(DUAL, true);
  });

  test('declining the search: the Hawk is back in hand and nothing is searched or shuffled', () => {
    const g = attack(0, 1);
    g.passAll();
    g.act(0).decline();
    g.expect.zone(HAWK, 'hand', { seat: 0, count: 1 });
    g.expect.noEvent({ kind: 'librarySearched' }, { since: 0 });
    g.expect.noEvent({ kind: 'libraryShuffled' }, { since: 0 });
    g.expect.librarySize(0, LIBRARY.length);
  });

  test('as many lands: no trigger, the Hawk stays on the battlefield', () => {
    const g = attack(2, 2);
    g.expect.stack([]);
    g.expect.zone(HAWK, 'battlefield', { seat: 0, count: 1 });
  });

  test('fewer lands: no trigger', () => {
    const g = attack(3, 1);
    g.expect.stack([]);
    g.expect.zone(HAWK, 'battlefield', { seat: 0, count: 1 });
  });
});

describe('"if you do": the Hawk must have been returned', () => {
  test('the Hawk is gone when the ability resolves: nothing is returned and nothing is searched', () => {
    const g = scenario()
      .define(syntheticCard(HAWK))
      .seat(0)
      .battlefield(HAWK, 'Swamp')
      .library(...LIBRARY)
      .seat(1)
      .library('Island', 'Island')
      .battlefield('Forest', 'Forest', 'Mountain')
      .hand('Lightning Bolt')
      .seat(0)
      .at('beginningOfCombat', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack([{ name: HAWK, seat: 0 }]);
    g.advanceTo('combatDamage');
    g.expect.stack([`${HAWK} (ability)`]);
    g.act(0).pass();
    g.act(1)
      .cast('Lightning Bolt')
      .targets([{ name: HAWK, seat: 0 }])
      .pay();
    g.passAll();
    g.expect.zone(HAWK, 'graveyard', { seat: 0, count: 1 });
    g.expect.noEvent({ kind: 'librarySearched' }, { since: 0 });
    g.expect.noEvent({ kind: 'libraryShuffled' }, { since: 0 });
    g.expect.pending('priority', 0);
  });
});

describe('damage to something that is not a player never triggers it', () => {
  test('blocked: the Hawk deals combat damage to a creature, not to a player', () => {
    const g = scenario()
      .define(syntheticCard(HAWK))
      .seat(0)
      .battlefield(HAWK)
      .library(...LIBRARY)
      .seat(1)
      .library('Island', 'Island')
      .battlefield('Forest', 'Forest', 'Giant Spider')
      .seat(0)
      .at('beginningOfCombat', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack([{ name: HAWK, seat: 0 }]);
    g.advanceTo('declareBlockers');
    g.act(1).declareBlockers([
      { blocker: { name: 'Giant Spider', seat: 1 }, attacker: { name: HAWK, seat: 0 } },
    ]);
    g.advanceTo('combatDamage');
    g.expect.stack([]);
    g.expect.noEvent({ kind: 'librarySearched' }, { since: 0 });
  });
});
