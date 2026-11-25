// Grand Larceny deck, group D2 (issue 119): Thieving Amalgam and Orochi Soul-Reaver (the REAL cards of the golden corpus), read through the grammar only and played through
// applyAction on three- and four-seat games. "You manifest the top card of that player's library" (CR 701.40a, 110.2a): the card of ANOTHER player's library is put onto
// the battlefield face down under the control of the player who manifests it, while its owner stays the player whose library it came from (CR 108.3).
// "A creature you control but don't own dies" (CR 700.4, 108.3, 603.10a): the owner of the creature loses 2 life and the controller gains 2.
import { readFileSync } from 'node:fs';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, type GoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const corpus: readonly GoldenCard[] = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);
function real(name: string) {
  const card = corpus.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  return importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
}

const AMALGAM = 'Thieving Amalgam';
const OROCHI = 'Orochi Soul-Reaver';
const amalgam = real(AMALGAM);
const orochi = real(OROCHI);
const BEARS = 'Grizzly Bears';
/** The top card of the library of each seat, one different card each, so a card is told from the library it came from. */
const TOPS = [undefined, BEARS, 'Giant Spider', 'Serra Angel'] as const;

describe('the cards are supported', () => {
  test.each([
    [AMALGAM, amalgam],
    [OROCHI, orochi],
  ])('%s has no ability left unread', (_name, imported) => {
    expect(imported.support.reasons).toEqual([]);
    expect(imported.support.unparsed).toEqual([]);
    expect(imported.support.status).toBe('supported');
  });

  test('Thieving Amalgam manifests from the library of the player of the upkeep, and its death trigger names owners and controllers', () => {
    const abilities = amalgam.definition.faces[0]?.abilities ?? [];
    expect(abilities[0]).toEqual({
      kind: 'triggered',
      trigger: { kind: 'step', step: 'upkeep', whose: 'opponent' },
      effect: {
        kind: 'manifest',
        player: { kind: 'you' },
        fromLibraryOf: { kind: 'triggerPlayer' },
      },
    });
    expect(abilities[1]).toMatchObject({
      kind: 'triggered',
      trigger: {
        kind: 'dies',
        what: { types: ['creature'], controller: 'you', notOwnedByYou: true },
      },
      effect: {
        kind: 'sequence',
        effects: [
          {
            kind: 'loseLife',
            player: { kind: 'ownerOf', of: { kind: 'triggerSubject' } },
            amount: 2,
          },
          { kind: 'gainLife', player: { kind: 'you' }, amount: 2 },
        ],
      },
    });
  });
});

/** Seat 0 has the card; it is the end of seat 0's turn in a game of `seats` players, and the next upkeep is advanced to. */
function upkeepOfNext(seats: 3 | 4) {
  const b = scenario({ seats })
    .define(amalgam.definition)
    .seat(0)
    .life(20)
    .battlefield(AMALGAM)
    .library('Plains', 'Plains');
  for (let s = 1; s < seats; s++) {
    b.seat(s as 1 | 2 | 3)
      .life(20)
      .library(TOPS[s] ?? BEARS, 'Llanowar Elves', 'Plains', 'Plains');
  }
  const g = b.seat(0).at('end', { active: 0 }).build();
  g.advanceTo('upkeep', { turn: 'next' });
  return g;
}

describe('Thieving Amalgam played (CR 701.40a, 110.2a, 108.3)', () => {
  test("at the upkeep of the next opponent, its controller manifests the top card of THAT player's library", () => {
    const g = upkeepOfNext(3);
    g.passAll();
    const manifested = g.object({ name: BEARS, zone: 'battlefield' });
    expect(manifested.faceDown).toBeDefined();
    // It is under the control of the player who manifested it, and the card is still owned by the library's player (CR 108.3).
    expect(manifested.controller).toBe(0);
    expect(manifested.owner).toBe(1);
    g.expect.librarySize(1, 3);
    g.expect.librarySize(2, 4);
    g.expect.librarySize(0, 2);
    g.expect.pt(BEARS, 2, 2);
    g.expect.invariants();
  });

  test('in a four-seat game the next upkeeps take from the library of the player whose turn it is, never from the others', () => {
    const g = upkeepOfNext(4);
    g.passAll();
    g.expect.librarySize(1, 3);
    g.expect.librarySize(2, 4);
    g.expect.librarySize(3, 4);
    expect(g.object({ name: BEARS, zone: 'battlefield' }).controller).toBe(0);
    g.expect.invariants();
  });

  test('its controller upkeep does nothing: only opponents upkeeps trigger it', () => {
    const b = scenario({ seats: 3 })
      .define(amalgam.definition)
      .seat(0)
      .life(20)
      .battlefield(AMALGAM)
      .library('Plains', 'Plains')
      .seat(1)
      .library('Plains', 'Plains')
      .seat(2)
      .library('Plains', 'Plains');
    const g = b.seat(0).at('end', { active: 2 }).build();
    g.advanceTo('upkeep', { turn: 'next' });
    g.passAll();
    g.expect.librarySize(1, 2);
    g.expect.librarySize(2, 2);
    g.expect.noObject(BEARS, { zone: 'battlefield' });
  });

  test('an empty library manifests nothing (CR 701.40f) and the game goes on', () => {
    const g = scenario({ seats: 3 })
      .define(amalgam.definition)
      .seat(0)
      .life(20)
      .battlefield(AMALGAM)
      .library('Plains', 'Plains')
      .seat(1)
      .life(20)
      .seat(2)
      .life(20)
      .library('Plains')
      .seat(0)
      .at('end', { active: 0 })
      .build();
    g.advanceTo('upkeep', { turn: 'next' });
    g.passAll();
    g.expect.librarySize(0, 2);
    g.expect.invariants();
  });

  describe('a creature you control but do not own dies', () => {
    const stolen = () => {
      const g = scenario({ seats: 3 })
        .define(amalgam.definition)
        .seat(0)
        .life(20)
        .battlefield(AMALGAM, 'Mountain')
        .hand('Lightning Bolt')
        .library('Plains', 'Plains')
        .seat(1)
        .life(20)
        .battlefield(BEARS, { controller: 0 })
        .battlefield('Llanowar Elves')
        .library('Plains', 'Plains')
        .seat(2)
        .life(20)
        .library('Plains', 'Plains')
        .seat(0)
        .at('precombatMain')
        .build();
      return g;
    };

    test("the owner of the dead creature loses 2 life and you gain 2: a player's own creature does not count", () => {
      const g = stolen();
      g.act(0).cast('Lightning Bolt', { targets: [BEARS], pay: true });
      g.passAll();
      g.expect.zone(BEARS, 'graveyard', { seat: 1 });
      g.passAll();
      g.expect.life(1, 18);
      g.expect.life(0, 22);
      g.expect.life(2, 20);
      g.expect.invariants();
    });

    test("another player's creature under that player's own control dying triggers nothing", () => {
      const g = stolen();
      g.act(0).cast('Lightning Bolt', { targets: ['Llanowar Elves'], pay: true });
      g.passAll();
      g.expect.zone('Llanowar Elves', 'graveyard', { seat: 1 });
      g.passAll();
      g.expect.life(1, 20);
      g.expect.life(0, 20);
    });

    test('Thieving Amalgam itself, owned and controlled by you, does not trigger it', () => {
      const g = stolen();
      g.act(0).cast('Lightning Bolt', { targets: [AMALGAM], pay: true });
      g.passAll();
      g.passAll();
      g.expect.life(0, 20);
      g.expect.life(1, 20);
    });
  });

  test("a manifested card of an opponent's library dying: its owner (the opponent) loses 2 life, you gain 2 (the whole card, end to end)", () => {
    const g = scenario({ seats: 3 })
      .define(amalgam.definition)
      .seat(0)
      .life(20)
      .battlefield(AMALGAM, 'Mountain')
      .hand('Lightning Bolt')
      .library('Plains', 'Plains')
      .seat(1)
      .life(20)
      .library(BEARS, 'Plains', 'Plains')
      .seat(2)
      .life(20)
      .library('Plains', 'Plains')
      .seat(0)
      .at('end', { active: 0 })
      .build();
    g.advanceTo('upkeep', { turn: 'next' });
    g.passAll();
    const manifested = g.object({ name: BEARS, zone: 'battlefield' });
    expect(manifested.controller).toBe(0);
    // Seat 1 is the active player and has priority first; it and seat 2 pass, and seat 0 (last in turn order) casts the instant.
    g.act(1).pass();
    g.act(2).pass();
    g.act(0).cast('Lightning Bolt', { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    g.passAll();
    g.expect.life(1, 18);
    g.expect.life(0, 22);
    g.expect.life(2, 20);
    g.expect.invariants();
  });
});

describe('Orochi Soul-Reaver played (CR 603.2c, 701.40a, 111.10)', () => {
  const orochiGame = (seats: 3 | 4) => {
    const b = scenario({ seats })
      .define(orochi.definition)
      .seat(0)
      .life(20)
      .battlefield(OROCHI)
      .library('Plains', 'Plains');
    for (let s = 1; s < seats; s++) {
      b.seat(s as 1 | 2 | 3)
        .life(20)
        .library(TOPS[s] ?? BEARS, 'Llanowar Elves', 'Plains', 'Plains');
    }
    return b.seat(0).at('precombatMain').build();
  };

  test('combat damage to a player: a Treasure and a manifest of the top card of the library of the player damaged', () => {
    const g = orochiGame(3);
    g.playCombat({ attack: [{ attacker: OROCHI, target: { player: 2 } }], until: 'combatDamage' });
    g.passAll();
    g.expect.life(2, 15);
    g.expect.zone('Treasure', 'battlefield', { seat: 0, count: 1 });
    const manifested = g.object({ name: TOPS[2], zone: 'battlefield' });
    expect(manifested.controller).toBe(0);
    expect(manifested.faceDown).toBeDefined();
    g.expect.librarySize(2, 3);
    g.expect.librarySize(1, 4);
    g.expect.invariants();
  });

  test('one trigger for each player damaged (CR 603.2c): two creatures hitting two players manifest from each library, two creatures hitting one player make one trigger', () => {
    const b = scenario({ seats: 4 })
      .define(orochi.definition)
      .seat(0)
      .life(20)
      .battlefield(OROCHI, 'Raging Goblin')
      .library('Plains', 'Plains');
    for (let s = 1; s < 4; s++) {
      b.seat(s as 1 | 2 | 3)
        .life(20)
        .library(TOPS[s] ?? BEARS, 'Llanowar Elves', 'Plains', 'Plains');
    }
    const g = b.seat(0).at('precombatMain').build();
    g.advanceTo('declareAttackers');
    g.act(0).declareAttackers([
      { attacker: OROCHI, target: { player: 1 } },
      { attacker: 'Raging Goblin', target: { player: 3 } },
    ]);
    g.advanceTo('combatDamage');
    // Two triggers (one for each player damaged) are put on the stack in the order seat 0 chooses (CR 603.3b).
    g.expect.pending('orderTriggers', 0);
    g.act(0).orderTriggers(0, 1);
    g.passAll();
    g.expect.zone('Treasure', 'battlefield', { seat: 0, count: 2 });
    g.expect.librarySize(1, 3);
    g.expect.librarySize(2, 4);
    g.expect.librarySize(3, 3);
    expect(g.object({ name: TOPS[1], zone: 'battlefield' }).controller).toBe(0);
    expect(g.object({ name: TOPS[3], zone: 'battlefield' }).controller).toBe(0);
    g.expect.invariants();
  });

  test('two creatures damaging the same player trigger it once', () => {
    const b = scenario({ seats: 3 })
      .define(orochi.definition)
      .seat(0)
      .life(20)
      .battlefield(OROCHI, 'Raging Goblin')
      .library('Plains', 'Plains');
    for (let s = 1; s < 3; s++) {
      b.seat(s as 1 | 2)
        .life(20)
        .library(TOPS[s] ?? BEARS, 'Llanowar Elves', 'Plains', 'Plains');
    }
    const g = b.seat(0).at('precombatMain').build();
    g.playCombat({
      attack: [
        { attacker: OROCHI, target: { player: 2 } },
        { attacker: 'Raging Goblin', target: { player: 2 } },
      ],
      until: 'combatDamage',
    });
    g.passAll();
    g.expect.zone('Treasure', 'battlefield', { seat: 0, count: 1 });
    g.expect.librarySize(2, 3);
    g.expect.librarySize(1, 4);
  });
});
