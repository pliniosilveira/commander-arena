// The World Shaper deck (Edge of Eternities Commander), cards of the "Windgrace" group: the REAL Oracle text of each card (the corpus's golden.jsonl, taken from the issue) goes through the
// grammar as a card with no override, is defined in an engine scenario and is played through applyAction, so the nodes the parser writes for the real text are what the engine runs.
import { readFileSync } from 'node:fs';
import { type CardDefinition, syntheticCard, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const GOLDEN = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

function real(name: string): CardDefinition {
  const card = GOLDEN.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.unparsed, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

describe('Sprouting Goblin: "search ... for a land card with a basic land type" if kicked (CR 701.23, 205.3i, 702.33, 603.4)', () => {
  const GOBLIN = 'Sprouting Goblin';
  const TIDE = 'SYNTHETIC Tide Pool';
  const goblin = real(GOBLIN);

  const board = () =>
    scenario()
      .define(goblin)
      .define(syntheticCard(TIDE))
      .seat(0)
      .library('Swamp', 'Grizzly Bears', TIDE)
      .hand(GOBLIN)
      .battlefield('Mountain', 'Mountain', 'Forest')
      .seat(1)
      .library('Island', 'Island')
      .at('precombatMain', { active: 0 })
      .build();

  test('is valid', () => {
    expect(validateCard(goblin)).toEqual([]);
  });

  test('kicked: finds a nonbasic land that has a basic land type, reveals it and shuffles', () => {
    const g = board();
    g.act(0).cast(GOBLIN, { kicked: true, pay: true });
    g.passAll();
    g.expect.pending('chooseCards', 0);
    g.act(0).chooseCards(g.id(TIDE));
    g.expect.zone(TIDE, 'hand', { seat: 0 });
    g.expect.eventLog(
      [
        { kind: 'librarySearched', seat: 0, found: 1 },
        { kind: 'libraryShuffled', seat: 0 },
      ],
      { since: 0 },
    );
    g.expect.invariants();
  });

  test('kicked: a creature card is not offered; a basic land is', () => {
    const g = board();
    g.act(0).cast(GOBLIN, { kicked: true, pay: true });
    g.passAll();
    expect(() => g.act(0).chooseCards(g.id('Grizzly Bears'))).toThrow();
    g.act(0).chooseCards(g.id('Swamp'));
    g.expect.zone('Swamp', 'hand', { seat: 0 });
  });

  test('not kicked: nothing is searched for', () => {
    const g = board();
    g.act(0).cast(GOBLIN, { kicked: false, pay: true });
    g.passAll();
    g.expect.noEvent({ kind: 'librarySearched' }, { since: 0 });
    g.expect.zone(TIDE, 'library', { seat: 0 });
  });
});

describe('Soul of Windgrace: "put a land card from a graveyard onto the battlefield tapped under your control" (CR 404.1, 608.2d, 110.2a, 603.2)', () => {
  const SOUL = 'Soul of Windgrace';
  const soul = real(SOUL);

  const board = (seats: 2 | 3 = 2) => {
    const b = scenario({ seats })
      .define(soul)
      .seat(0)
      .library('Swamp', { count: 4 })
      .hand(SOUL)
      .graveyard('Forest')
      .battlefield('Swamp', 'Mountain', 'Forest', 'Forest')
      .seat(1)
      .library('Island', { count: 4 })
      .graveyard('Island', 'Grizzly Bears');
    return (seats === 3 ? b.seat(2).library('Plains', { count: 4 }).graveyard('Plains') : b)
      .at('precombatMain', { active: 0 })
      .build();
  };

  test('is valid', () => {
    expect(validateCard(soul)).toEqual([]);
  });

  test('entering: a land card of any graveyard, an opponent as well, enters tapped under your control', () => {
    const g = board();
    g.act(0).cast(SOUL, { pay: true });
    g.passAll();
    g.passAll();
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    g.expect.pending('chooseCards', 0);
    g.act(0).chooseCards(g.id({ name: 'Island', zone: 'graveyard' }));
    g.expect.zone('Island', 'battlefield', { seat: 0 });
    g.expect.tapped({ name: 'Island', zone: 'battlefield' });
    g.expect.zone('Island', 'graveyard', { count: 0 });
    g.expect.invariants();
  });

  test('a card that is not a land is not offered', () => {
    const g = board();
    g.act(0).cast(SOUL, { pay: true });
    g.passAll();
    g.passAll();
    g.act(0).accept();
    expect(() => g.act(0).chooseCards(g.id('Grizzly Bears'))).toThrow();
  });

  test('"you may": the player can put none', () => {
    const g = board();
    g.act(0).cast(SOUL, { pay: true });
    g.passAll();
    g.passAll();
    g.act(0).decline();
    g.expect.zone('Island', 'graveyard', { seat: 1 });
    g.expect.zone('Forest', 'graveyard', { seat: 0 });
  });

  test('attacking triggers it again', () => {
    const g = scenario()
      .define(soul)
      .seat(0)
      .library('Swamp', { count: 4 })
      .battlefield(SOUL)
      .seat(1)
      .library('Island', { count: 4 })
      .graveyard('Island')
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack(SOUL);
    g.passAll();
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    // The only land card of any graveyard: nothing left to choose among.
    g.expect.zone('Island', 'battlefield', { seat: 0 });
    g.expect.tapped({ name: 'Island', zone: 'battlefield' });
  });

  test('with three seats the lands of both opponents are candidates', () => {
    const g = board(3);
    g.act(0).cast(SOUL, { pay: true });
    g.passAll();
    g.passAll();
    g.passAll();
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    g.expect.pending('chooseCards', 0);
    g.act(0).chooseCards(g.id({ name: 'Plains', zone: 'graveyard', seat: 2 }));
    g.expect.zone('Plains', 'battlefield', { seat: 0 });
    g.expect.zone('Island', 'graveyard', { seat: 1 });
  });
});

describe('Loamcrafter Faun: a reflexive trigger whose number of targets is the lands discarded (CR 603.12, 601.2c, 701.9, ruling 2023-09-01)', () => {
  const FAUN = 'Loamcrafter Faun';
  const faun = real(FAUN);

  const board = () =>
    scenario()
      .define(faun)
      .seat(0)
      .library('Swamp', { count: 4 })
      .hand(FAUN, 'Forest', 'Mountain', 'Plains', 'Lightning Bolt')
      .graveyard('Grizzly Bears', 'Llanowar Elves', 'Serra Angel', 'Swamp', 'Lightning Bolt')
      .battlefield('Forest', 'Forest', 'Forest')
      .seat(1)
      .library('Island', { count: 4 })
      .at('precombatMain', { active: 0 })
      .build();

  const castToDiscard = () => {
    const g = board();
    g.act(0).cast(FAUN, { pay: true });
    g.passAll();
    g.passAll();
    // "You may discard one or more": the choice of none to all of the lands is the offer.
    g.expect.pending('chooseCards', 0);
    return g;
  };

  test('is valid', () => {
    expect(validateCard(faun)).toEqual([]);
  });

  test('discarding two lands allows up to two targets among the nonland permanent cards of the graveyard, and they return to the hand', () => {
    const g = castToDiscard();
    g.act(0).chooseCards('Forest', 'Mountain');
    g.passAll();
    g.expect.pending('targets', 0);
    g.act(0).chooseTargets('Grizzly Bears', 'Serra Angel');
    g.passAll();
    g.expect.zone('Grizzly Bears', 'hand', { seat: 0 });
    g.expect.zone('Serra Angel', 'hand', { seat: 0 });
    g.expect.zone('Llanowar Elves', 'graveyard', { seat: 0 });
    g.expect.invariants();
  });

  test('three targets are refused after discarding two lands; a land card or an instant is not a legal target', () => {
    const g = castToDiscard();
    g.act(0).chooseCards('Forest', 'Mountain');
    g.passAll();
    expect(() =>
      g.act(0).chooseTargets('Grizzly Bears', 'Serra Angel', 'Llanowar Elves'),
    ).toThrow();
    expect(() => g.act(0).chooseTargets({ name: 'Swamp', zone: 'graveyard' })).toThrow();
    expect(() => g.act(0).chooseTargets({ name: 'Lightning Bolt', zone: 'graveyard' })).toThrow();
  });

  test('discarding one land allows one target at most', () => {
    const g = castToDiscard();
    g.act(0).chooseCards('Plains');
    g.passAll();
    expect(() => g.act(0).chooseTargets('Grizzly Bears', 'Serra Angel')).toThrow();
    g.act(0).chooseTargets('Llanowar Elves');
    g.passAll();
    g.expect.zone('Llanowar Elves', 'hand', { seat: 0 });
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 0 });
  });

  test('a nonland card cannot be discarded for it', () => {
    const g = castToDiscard();
    expect(() => g.act(0).chooseCards({ name: 'Lightning Bolt', zone: 'hand' })).toThrow();
  });

  test('discarding none creates no reflexive ability', () => {
    const g = castToDiscard();
    g.act(0).chooseCards();
    g.passAll();
    g.expect.stack([]);
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 0 });
  });
});

describe("Windgrace's Judgment: one target for each of any number of opponents (CR 115.1, 601.2c, 701.8a)", () => {
  const JUDGMENT = "Windgrace's Judgment";
  const judgment = real(JUDGMENT);
  const OWN = "Healer's Hawk";

  const board = (seats: 2 | 3 | 4) => {
    let b = scenario({ seats })
      .define(judgment)
      .seat(0)
      .library('Swamp', { count: 4 })
      .hand(JUDGMENT)
      .battlefield('Swamp', 'Swamp', 'Swamp', 'Forest', 'Forest', OWN)
      .seat(1)
      .library('Island', { count: 4 })
      .battlefield('Grizzly Bears', 'Llanowar Elves', 'Island');
    if (seats >= 3)
      b = b.seat(2).library('Plains', { count: 4 }).battlefield('Serra Angel', 'Plains');
    if (seats >= 4)
      b = b.seat(3).library('Mountain', { count: 4 }).battlefield('Grizzly Bears', 'Mountain');
    return b.at('precombatMain', { active: 0 }).build();
  };

  test('is valid', () => {
    expect(validateCard(judgment)).toEqual([]);
  });

  test('with three seats a target of each opponent is destroyed, and nothing else', () => {
    const g = board(3);
    g.act(0).cast(JUDGMENT, { targets: ['Grizzly Bears', 'Serra Angel'], pay: true });
    g.passAll();
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 1 });
    g.expect.zone('Serra Angel', 'graveyard', { seat: 2 });
    g.expect.zone('Llanowar Elves', 'battlefield', { seat: 1 });
    g.expect.zone(OWN, 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('any number: one opponent alone is enough, and so is none', () => {
    const g = board(3);
    g.act(0).cast(JUDGMENT, { targets: ['Serra Angel'], pay: true });
    g.passAll();
    g.expect.zone('Serra Angel', 'graveyard', { seat: 2 });
    g.expect.zone('Grizzly Bears', 'battlefield', { seat: 1 });
    const none = board(3);
    none.act(0).cast(JUDGMENT, { targets: [], pay: true });
    none.passAll();
    none.expect.zone('Grizzly Bears', 'battlefield', { seat: 1 });
    none.expect.zone('Serra Angel', 'battlefield', { seat: 2 });
  });

  test('two targets controlled by one opponent are refused: one target for each opponent', () => {
    const g = board(3);
    expect(() =>
      g.act(0).cast(JUDGMENT, { targets: ['Grizzly Bears', 'Llanowar Elves'], pay: true }),
    ).toThrow();
  });

  test('your own permanent and a land are not legal targets', () => {
    const own = board(3);
    expect(() => own.act(0).cast(JUDGMENT, { targets: [OWN], pay: true })).toThrow();
    const land = board(3);
    expect(() =>
      land.act(0).cast(JUDGMENT, { targets: [{ name: 'Island', zone: 'battlefield' }], pay: true }),
    ).toThrow();
  });

  test('with four seats there can be three targets, one for each opponent, and no more', () => {
    const g = board(4);
    g.act(0).cast(JUDGMENT, {
      targets: [
        { name: 'Grizzly Bears', seat: 1 },
        'Serra Angel',
        { name: 'Grizzly Bears', seat: 3 },
      ],
      pay: true,
    });
    g.passAll();
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 1 });
    g.expect.zone('Serra Angel', 'graveyard', { seat: 2 });
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 3 });
    g.expect.zone('Llanowar Elves', 'battlefield', { seat: 1 });
    const h = board(4);
    expect(() =>
      h.act(0).cast(JUDGMENT, {
        targets: [
          { name: 'Grizzly Bears', seat: 1 },
          'Llanowar Elves',
          'Serra Angel',
          { name: 'Grizzly Bears', seat: 3 },
        ],
        pay: true,
      }),
    ).toThrow();
  });

  test('with two seats it destroys the one opponent permanent chosen', () => {
    const g = board(2);
    g.act(0).cast(JUDGMENT, { targets: ['Llanowar Elves'], pay: true });
    g.passAll();
    g.expect.zone('Llanowar Elves', 'graveyard', { seat: 1 });
    g.expect.zone('Grizzly Bears', 'battlefield', { seat: 1 });
  });
});
