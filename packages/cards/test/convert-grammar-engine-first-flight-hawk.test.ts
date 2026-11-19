// The First Flight starter commander decks, the group of Cartographer's Hawk: the REAL Oracle text goes through the grammar as a card with no override and is played through
// applyAction, so the nodes the parser writes for the real text are what the engine runs. Stand-ins are SYNTHETIC (named so). Pins: CR 510.2 (combat damage is dealt at once),
// CR 603.2 (a condition of the event is read as it happens), CR 608.2c ("if you do"), CR 701.23 (Search), CR 701.24 (Shuffle), CR 205.3i (land types).
import { type CardDefinition, FIXTURE_CARDS } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const HAWK_TEXT =
  "Flying\nWhen this creature deals combat damage to a player who controls more lands than you, return it to its owner's hand. If you do, you may search your library for a Plains card, put it onto the battlefield tapped, then shuffle.";

const HAWK: CardDefinition = parsed("Cartographer's Hawk", 'Creature — Bird', HAWK_TEXT, {
  manaCost: '{1}{W}',
  power: '2',
  toughness: '1',
});
const DUAL: CardDefinition = parsed(
  'SYNTHETIC Plains Forest Land',
  'Land — Plains Forest',
  '({T}: Add {W} or {G}.)',
);

const LIBRARY = ['Island', 'Plains', DUAL.name, 'Forest'];
const SPIDER = FIXTURE_CARDS['Giant Spider']?.faces[0]?.name ?? 'Giant Spider';

/** Seat 0 attacks seat 1 with the Hawk; seat 0 holds `mine` Swamps and seat 1 `theirs` Forests and a Mountain. */
function attack(mine: number, theirs: number, blocked = false) {
  const g = scenario()
    .define(HAWK)
    .define(DUAL)
    .seat(0)
    .battlefield(HAWK.name, ...Array.from({ length: mine }, () => 'Swamp'))
    .library(...LIBRARY)
    .seat(1)
    .library('Island', 'Island')
    .battlefield(...Array.from({ length: theirs }, () => 'Forest'), ...(blocked ? [SPIDER] : []))
    .hand('Lightning Bolt')
    .battlefield('Mountain')
    .seat(0)
    .at('beginningOfCombat', { active: 0 })
    .build();
  g.advanceTo('declareAttackers');
  g.act(0).attack([{ name: HAWK.name, seat: 0 }]);
  if (blocked) {
    g.advanceTo('declareBlockers');
    g.act(1).declareBlockers([
      { blocker: { name: SPIDER, seat: 1 }, attacker: { name: HAWK.name, seat: 0 } },
    ]);
  }
  g.advanceTo('combatDamage');
  return g;
}

describe("Cartographer's Hawk, as the grammar reads the real text", () => {
  test('the damaged player controls more lands: the Hawk returns and a Plains comes in tapped', () => {
    const g = attack(1, 2);
    g.expect.stack([`${HAWK.name} (ability)`]);
    g.passAll();
    g.expect.zone(HAWK.name, 'hand', { seat: 0, count: 1 });
    g.act(0).accept();
    g.act(0).chooseCards('Plains');
    const found = g.find({ name: 'Plains', zone: 'battlefield', seat: 0 });
    expect(found).toHaveLength(1);
    expect(found.every((p) => p.tapped)).toBe(true);
    g.expect.eventLog(
      [
        { kind: 'librarySearched', seat: 0, found: 1 },
        { kind: 'libraryShuffled', seat: 0 },
      ],
      { since: 0 },
    );
    g.expect.invariants();
  });

  test('a land that is not basic but has the land type Plains is found too', () => {
    const g = attack(0, 1);
    g.passAll();
    g.act(0).accept();
    g.act(0).chooseCards(DUAL.name);
    g.expect.zone(DUAL.name, 'battlefield', { seat: 0, count: 1 });
    g.expect.tapped(DUAL.name, true);
  });

  test('declining: the Hawk is in hand, and nothing is searched or shuffled', () => {
    const g = attack(0, 1);
    g.passAll();
    g.act(0).decline();
    g.expect.zone(HAWK.name, 'hand', { seat: 0, count: 1 });
    g.expect.noEvent({ kind: 'librarySearched' }, { since: 0 });
    g.expect.noEvent({ kind: 'libraryShuffled' }, { since: 0 });
  });

  test('as many lands (the Mountain counts), or fewer: no trigger', () => {
    for (const [mine, theirs] of [
      [2, 1],
      [3, 1],
    ] as const) {
      const g = attack(mine, theirs);
      g.expect.stack([]);
      g.expect.zone(HAWK.name, 'battlefield', { seat: 0, count: 1 });
    }
  });

  test('the Hawk is gone when the ability resolves: "if you do" is false and nothing is searched', () => {
    const g = attack(0, 1);
    g.expect.stack([`${HAWK.name} (ability)`]);
    g.act(0).pass();
    g.act(1)
      .cast('Lightning Bolt')
      .targets([{ name: HAWK.name, seat: 0 }])
      .pay();
    g.passAll();
    g.expect.zone(HAWK.name, 'graveyard', { seat: 0, count: 1 });
    g.expect.noEvent({ kind: 'librarySearched' }, { since: 0 });
    g.expect.pending('priority', 0);
  });

  test('damage to a creature never triggers it', () => {
    const g = attack(0, 1, true);
    g.expect.stack([]);
    g.expect.noEvent({ kind: 'librarySearched' }, { since: 0 });
  });
});
