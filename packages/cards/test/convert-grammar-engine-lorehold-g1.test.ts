// The Lorehold Spirit deck (issue 86), group 1 (D-583 to D-589, provisional): the REAL Oracle text of Claim Jumper, Containment Construct, Conspiracy Theorist, Perpetual Timepiece and
// Wave of Reckoning (the corpus's golden.jsonl, taken from the issue) goes through the grammar as a card with no override, is defined in an engine scenario and is played through
// applyAction, so the nodes the parser writes for the real text are what the engine runs. The abilities of each real card are also the ones of its SYNTHETIC sibling of the engine fixtures
// (`synthetic-lorehold-g1.ts`), which the engine tests and the AI soak play. Pins: CR 701.23 (search), 701.24c-d (shuffle), 701.9a (discard), 603.2c (a batch trigger), 603.12 and 608.2c
// ("if you do"), 601.2 and 305.1 (cast and play from exile), 120.3 (damage dealt by a creature to itself), 704.5g (lethal damage).
import { readFileSync } from 'node:fs';
import { type CardDefinition, syntheticCard, validateCard } from '@commander-arena/engine';
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

const JUMPER = real('Claim Jumper');
const CONSTRUCT = real('Containment Construct');
const THEORIST = real('Conspiracy Theorist');
const TIMEPIECE = real('Perpetual Timepiece');
const WAVE = real('Wave of Reckoning');

const BOLT = 'Lightning Bolt';
const GOBLIN = 'Raging Goblin';
const BEARS = 'Grizzly Bears';
const SPIDER = 'Giant Spider';
const LOOT = 'SYNTHETIC Loot'; // {U}: draw a card, then discard a card
const PAIR = 'SYNTHETIC Twin Discard'; // {R}: discard two cards
const FILLER = Array.from({ length: 8 }, () => 'Mountain');

describe('every card is valid and has the abilities of its SYNTHETIC sibling', () => {
  test.each([
    ['Claim Jumper', JUMPER, 'SYNTHETIC Land Claimer'],
    ['Containment Construct', CONSTRUCT, 'SYNTHETIC Quarantine Golem'],
    ['Conspiracy Theorist', THEORIST, 'SYNTHETIC Doubting Seer'],
    ['Perpetual Timepiece', TIMEPIECE, 'SYNTHETIC Memory Clock'],
  ] as const)('%s', (_name, card, sibling) => {
    expect(validateCard(card)).toEqual([]);
    expect(card.faces[0]?.abilities).toEqual(syntheticCard(sibling).faces[0]?.abilities);
  });

  test('Wave of Reckoning', () => {
    expect(validateCard(WAVE)).toEqual([]);
    expect(WAVE.faces[0]?.spell).toEqual(syntheticCard('SYNTHETIC Reckoning Tide').faces[0]?.spell);
  });
});

describe('Claim Jumper', () => {
  const board = (mine: number, theirs: number) =>
    scenario()
      .define(JUMPER)
      .seat(0)
      .hand('Claim Jumper')
      .library('Plains', 'Plains', 'Plains', 'Island')
      .battlefield(...Array.from({ length: mine }, () => 'Plains'))
      .seat(1)
      .library(...FILLER)
      .battlefield(...Array.from({ length: theirs }, () => 'Swamp'))
      .at('precombatMain', { active: 0 })
      .build();

  test('with more lands on the other side it searches for a Plains onto the battlefield tapped, twice at most, and shuffles once', () => {
    const g = board(3, 6);
    g.act(0).cast('Claim Jumper', { pay: true });
    g.passAll();
    g.act(0).accept();
    g.act(0).chooseCards('Plains[0]');
    g.act(0).accept();
    g.act(0).chooseCards('Plains[0]');
    g.expect.pending('priority', 0);
    expect(g.find({ name: 'Plains', zone: 'battlefield', seat: 0 })).toHaveLength(5);
    const events = g.eventsSince(0);
    expect(events.filter((e) => e.kind === 'librarySearched')).toHaveLength(2);
    expect(events.filter((e) => e.kind === 'libraryShuffled' && e.seat === 0)).toHaveLength(1);
    g.expect.invariants();
  });

  test('declining both searches shuffles nothing', () => {
    const g = board(3, 6);
    g.act(0).cast('Claim Jumper', { pay: true });
    g.passAll();
    g.act(0).decline();
    g.act(0).decline();
    g.expect.noEvent({ kind: 'libraryShuffled' }, { since: 0 });
    expect(g.find({ name: 'Plains', zone: 'battlefield', seat: 0 })).toHaveLength(3);
  });

  test('with as many lands the ability does not trigger', () => {
    const g = board(3, 3);
    g.act(0).cast('Claim Jumper', { pay: true });
    g.passAll();
    g.expect.pending('priority', 0);
    g.expect.noEvent({ kind: 'librarySearched' }, { since: 0 });
  });
});

describe('Containment Construct', () => {
  const board = () =>
    scenario()
      .define(CONSTRUCT)
      .define(syntheticCard(LOOT))
      .seat(0)
      .hand(LOOT, GOBLIN)
      .library('Mountain', ...FILLER)
      .battlefield('Containment Construct')
      .battlefield('Mountain', 'Mountain', 'Island')
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();

  test('a card discarded is exiled when the player says so and may be cast this turn', () => {
    const g = board();
    g.act(0).cast(LOOT, { pay: true });
    g.passAll();
    g.act(0).chooseCards(GOBLIN);
    g.passAll();
    g.act(0).accept();
    g.expect.zone(GOBLIN, 'exile', { seat: 0 });
    g.act(0).cast(GOBLIN, { pay: true });
    g.passAll();
    g.expect.zone(GOBLIN, 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('declining leaves it in the graveyard', () => {
    const g = board();
    g.act(0).cast(LOOT, { pay: true });
    g.passAll();
    g.act(0).chooseCards(GOBLIN);
    g.passAll();
    g.act(0).decline();
    g.expect.zone(GOBLIN, 'graveyard', { seat: 0 });
    g.expect.illegal(0, { cast: GOBLIN });
  });
});

describe('Conspiracy Theorist', () => {
  const attackBoard = (hand: readonly string[]) =>
    scenario()
      .define(THEORIST)
      .seat(0)
      .hand(...hand)
      .library('Island', 'Swamp', ...FILLER)
      .battlefield('Conspiracy Theorist', { label: 'theorist' })
      .battlefield('Mountain', 'Mountain', 'Mountain')
      .seat(1)
      .library(...FILLER)
      .at('beginningOfCombat', { active: 0 })
      .build();

  test('attacking: pay {1} and discard a card to draw a card, and the card discarded may be exiled and cast', () => {
    const g = attackBoard([BOLT, GOBLIN]);
    g.passAll();
    g.act(0).attack('theorist');
    g.passAll();
    g.act(0).accept();
    g.act(0).chooseCards(BOLT);
    g.act(0).payAuto();
    g.expect.zone(BOLT, 'graveyard', { seat: 0 });
    g.expect.zone('Island', 'hand', { seat: 0 });
    // The discard of a nonland card is its second ability: one or more nonland cards.
    g.passAll();
    g.expect.pending('chooseCards', 0);
    g.act(0).chooseCards(BOLT);
    g.expect.zone(BOLT, 'exile', { seat: 0 });
    g.expect.legal(0, { cast: BOLT });
    g.expect.invariants();
  });

  test('two cards discarded at once are one trigger', () => {
    const g = scenario()
      .define(THEORIST)
      .define(syntheticCard(PAIR))
      .seat(0)
      .hand(PAIR, GOBLIN, BOLT)
      .library(...FILLER)
      .battlefield('Conspiracy Theorist')
      .battlefield('Mountain', 'Mountain')
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(PAIR, { pay: true });
    g.passAll();
    g.expect.pending('chooseCards', 0);
    g.act(0).chooseCards(GOBLIN);
    g.expect.zone(GOBLIN, 'exile', { seat: 0 });
    g.expect.zone(BOLT, 'graveyard', { seat: 0 });
    g.expect.legal(0, { cast: GOBLIN });
  });

  test('a land card discarded is not among the cards: it triggers nothing', () => {
    const g = scenario()
      .define(THEORIST)
      .define(syntheticCard(PAIR))
      .seat(0)
      .hand(PAIR, 'Forest', 'Swamp')
      .library(...FILLER)
      .battlefield('Conspiracy Theorist')
      .battlefield('Mountain', 'Mountain')
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(PAIR, { pay: true });
    g.passAll();
    g.expect.pending('priority', 0);
  });
});

describe('Perpetual Timepiece', () => {
  const board = () =>
    scenario()
      .define(TIMEPIECE)
      .seat(0)
      .library('Island', 'Swamp', 'Forest', 'Mountain')
      .graveyard(BEARS, { label: 'bears' })
      .graveyard(SPIDER, { label: 'spider' })
      .battlefield('Perpetual Timepiece')
      .battlefield('Plains', 'Plains')
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();

  test('{T}: mill two cards', () => {
    const g = board();
    g.act(0).activate('Perpetual Timepiece', { ability: 0 });
    g.passAll();
    g.expect.zone('Island', 'graveyard', { seat: 0 });
    g.expect.zone('Swamp', 'graveyard', { seat: 0 });
    g.expect.librarySize(0, 2);
  });

  test('{2}, exile it: any number of target cards go into the library, which is shuffled', () => {
    const g = board();
    g.act(0).activate('Perpetual Timepiece', { ability: 1 }).targets(['bears', 'spider']).pay();
    g.passAll();
    g.expect.zone('Perpetual Timepiece', 'exile', { seat: 0 });
    g.expect.zone(BEARS, 'library', { seat: 0 });
    g.expect.zone(SPIDER, 'library', { seat: 0 });
    g.expect.librarySize(0, 6);
    g.expect.eventLog([{ kind: 'libraryShuffled', seat: 0 }], { since: 0 });
    g.expect.invariants();
  });

  test('with no target the library is shuffled anyway', () => {
    const g = board();
    g.act(0).activate('Perpetual Timepiece', { ability: 1 }).targets([]).pay();
    g.passAll();
    g.expect.eventLog([{ kind: 'libraryShuffled', seat: 0 }], { since: 0 });
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
  });
});

describe('Wave of Reckoning', () => {
  test('each creature is dealt damage equal to its own power: the small ones die, the big ones survive', () => {
    const g = scenario()
      .define(WAVE)
      .seat(0)
      .hand('Wave of Reckoning')
      .battlefield('Plains', 'Plains', 'Plains', 'Plains', 'Plains')
      .battlefield(BEARS, { label: 'mine' })
      .battlefield(SPIDER, { label: 'spider' })
      .seat(1)
      .battlefield('Serra Angel', { label: 'angel' })
      .battlefield('Wall of Stone', { label: 'wall' })
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast('Wave of Reckoning', { pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.zone('Serra Angel', 'graveyard', { seat: 1 });
    g.expect.damage('spider', 2);
    g.expect.damage('wall', 0);
    g.expect.zone(SPIDER, 'battlefield', { seat: 0 });
    g.expect.zone('Wall of Stone', 'battlefield', { seat: 1 });
    g.expect.invariants();
  });
});
