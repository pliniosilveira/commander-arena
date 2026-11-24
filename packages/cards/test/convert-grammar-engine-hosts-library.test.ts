// Hosts of Mordor, library group (issue 150): the REAL Oracle text (the corpus's golden.jsonl) goes through the grammar as cards with no override, is defined in an engine scenario and is
// played through applyAction, so the nodes the parser writes for the real text are what the engine runs. Games have three seats where the text speaks of each player or each opponent.
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const GOLDEN = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

function real(name: string, supported = true): CardDefinition {
  const card = GOLDEN.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  if (supported) {
    expect(imported.support.unparsed, name).toEqual([]);
    expect(imported.support.status, name).toBe('supported');
  }
  return imported.definition;
}

describe('Field of Ruin (CR 701.23a, 701.24, 110.2a: each player searches, puts the land onto the battlefield, shuffles)', () => {
  const FIELD = 'Field of Ruin';
  const TARGET = 'Command Tower';
  const field = real(FIELD);
  const tower = real(TARGET, false);

  const board = () =>
    scenario({ seats: 3 })
      .define(field)
      .define(tower)
      .seat(0)
      .battlefield(FIELD, 'Swamp', 'Swamp')
      .library('Forest', 'Plains')
      .seat(1)
      .battlefield(TARGET)
      .library('Island', 'Plains')
      .seat(2)
      .library('Mountain', 'Plains')
      .at('precombatMain', { active: 0 })
      .build();

  test('is valid', () => {
    expect(validateCard(field)).toEqual([]);
  });

  test('destroys the nonbasic land, then every player (three seats) fetches a basic land of their own', () => {
    const g = board();
    g.act(0).activate(FIELD, { ability: 1, targets: [TARGET], pay: true });
    g.passAll();
    g.expect.zone(TARGET, 'graveyard', { seat: 1 });
    for (const [seat, land] of [
      [0, 'Forest'],
      [1, 'Island'],
      [2, 'Mountain'],
    ] as const) {
      g.expect.pending('chooseCards', seat);
      g.act(seat).chooseCards(g.id(land));
    }
    g.expect.zone('Forest', 'battlefield', { seat: 0 });
    g.expect.zone('Island', 'battlefield', { seat: 1 });
    g.expect.zone('Mountain', 'battlefield', { seat: 2 });
    for (const seat of [0, 1, 2]) {
      g.expect.eventLog([{ kind: 'libraryShuffled', seat }], { since: 0 });
    }
    g.expect.invariants();
  });
});

describe('Extract from Darkness (CR 701.17, 404.1, 608.2d, 110.2a: mill, then choose a creature card from any graveyard)', () => {
  const EXTRACT = 'Extract from Darkness';
  const extract = real(EXTRACT);

  const board = (libraries: readonly (readonly string[])[], graveyard0: readonly string[] = []) => {
    const b = scenario({ seats: 3 }).define(extract).seat(0).hand(EXTRACT).pool('UUUBB');
    if (graveyard0.length > 0) b.graveyard(...graveyard0);
    libraries.forEach((cards, i) => {
      b.seat(i).library(...cards);
    });
    return b.at('precombatMain', { active: 0 }).build();
  };

  test('is valid', () => {
    expect(validateCard(extract)).toEqual([]);
  });

  test('every player mills two, then the controller takes a creature card milled from an opponent, under their control', () => {
    const g = board([
      ['Plains', 'Plains', 'Forest', 'Forest'],
      ['Giant Spider', 'Island', 'Island', 'Island'],
      ['Serra Angel', 'Plains', 'Plains', 'Plains'],
    ]);
    g.act(0).cast(EXTRACT, { pay: true });
    g.passAll();
    g.expect.librarySize(0, 2);
    g.expect.librarySize(1, 2);
    g.expect.librarySize(2, 2);
    g.expect.pending('chooseCards', 0);
    g.act(0).chooseCards(g.id('Serra Angel'));
    g.expect.zone('Serra Angel', 'battlefield', { seat: 0 });
    g.expect.zone('Giant Spider', 'graveyard', { seat: 1 });
    g.expect.invariants();
  });

  test('the creature card may be one in a graveyard from before, and nothing is asked with a single candidate', () => {
    const g = board(
      [
        ['Plains', 'Plains', 'Forest'],
        ['Island', 'Island', 'Island'],
        ['Plains', 'Plains', 'Plains'],
      ],
      ['Grizzly Bears'],
    );
    g.act(0).cast(EXTRACT, { pay: true });
    g.passAll();
    g.expect.zone('Grizzly Bears', 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('with no creature card in any graveyard it finishes resolving', () => {
    const g = board([
      ['Plains', 'Plains', 'Forest'],
      ['Island', 'Island', 'Island'],
      ['Plains', 'Plains', 'Plains'],
    ]);
    g.act(0).cast(EXTRACT, { pay: true });
    g.passAll();
    g.expect.stack([]);
    g.expect.zone(EXTRACT, 'graveyard', { seat: 0 });
    g.expect.invariants();
  });
});

describe('Notion Thief (CR 614.1a, 614.11, 504.1, 614.5: an opponent draw but the first of the draw step is skipped and the controller draws)', () => {
  const THIEF = 'Notion Thief';
  const thief = real(THIEF);
  const CARDS = ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest'] as const;

  /** `thieves[i]` Notion Thieves under seat i; seat `caster` casts Divination (draw two cards) on their own turn. */
  const board = (seats: number, thieves: readonly number[], caster: number) => {
    const b = scenario({ seats });
    b.define(thief);
    for (let seat = 0; seat < seats; seat += 1) {
      b.seat(seat).library(...CARDS);
      if (seat === caster) b.hand('Divination').pool('UUU');
      for (let n = 0; n < (thieves[seat] ?? 0); n += 1) b.battlefield(THIEF);
    }
    return b.at('precombatMain', { active: caster }).build();
  };

  test('is valid', () => {
    expect(validateCard(thief)).toEqual([]);
  });

  test('both cards an opponent would draw are drawn by the controller instead (three seats: the other opponent keeps their library)', () => {
    const g = board(3, [1, 0, 0], 1);
    g.act(1).cast('Divination', { pay: true });
    g.passAll();
    g.expect.handSize(1, 0);
    g.expect.handSize(0, 2);
    g.expect.handSize(2, 0);
    g.expect.librarySize(1, 5);
    g.expect.librarySize(0, 3);
    g.expect.eventLog([{ kind: 'drawSkipped', seat: 1 }], { since: 0 });
    g.expect.invariants();
  });

  test('the controller of the permanent draws normally', () => {
    const g = board(3, [1, 0, 0], 0);
    g.act(0).cast('Divination', { pay: true });
    g.passAll();
    g.expect.handSize(0, 2);
    g.expect.noEvent({ kind: 'drawSkipped' }, { since: 0 });
  });

  test('with no thief an opponent draws as usual', () => {
    const g = board(3, [0, 0, 0], 1);
    g.act(1).cast('Divination', { pay: true });
    g.passAll();
    g.expect.handSize(1, 2);
  });

  test('the first draw of the opponent draw step is not replaced', () => {
    const g = scenario({ seats: 3 })
      .define(thief)
      .seat(0)
      .library(...CARDS)
      .battlefield(THIEF)
      .seat(1)
      .library(...CARDS)
      .seat(2)
      .library(...CARDS)
      .at('upkeep', { active: 1 })
      .build();
    g.passAll();
    g.expect.step('draw');
    g.expect.handSize(1, 1);
    g.expect.handSize(0, 0);
  });

  test('two players each with a thief: the draw is replaced once by each effect and the player who would draw draws (the ruling of the card)', () => {
    const g = board(2, [1, 1], 1);
    g.act(1).cast('Divination', { pay: true });
    g.passAll();
    g.expect.handSize(1, 2);
    g.expect.handSize(0, 0);
    g.expect.invariants();
  });

  test('two thieves of one controller still give that controller one card per draw', () => {
    const g = board(2, [2, 0], 1);
    g.act(1).cast('Divination', { pay: true });
    g.passAll();
    g.expect.handSize(0, 2);
    g.expect.handSize(1, 0);
  });

  test('the card a thief makes its controller draw can be replaced by the thief of another opponent (the oldest permanent goes first)', () => {
    // Seat 2 would draw: the thief of seat 0 applies first, so seat 0 would draw, and the thief of seat 1 replaces that draw: seat 1 draws.
    const g = board(3, [1, 1, 0], 2);
    g.act(2).cast('Divination', { pay: true });
    g.passAll();
    g.expect.handSize(1, 2);
    g.expect.handSize(0, 0);
    g.expect.handSize(2, 0);
  });
});
