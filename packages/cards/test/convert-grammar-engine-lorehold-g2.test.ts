// The Lorehold Spirit deck (issue 86), group 2 (D-618 and later, provisional): the REAL Oracle text of Fateful Tempest and Quintorius, Loremaster (the corpus's golden.jsonl, taken from the
// issue) goes through the grammar as a card with no override, is defined in an engine scenario and is played through applyAction, so the nodes the parser writes for the real text are what the
// engine runs. The abilities of each real card are also the ones of its SYNTHETIC sibling of the engine fixtures (`synthetic-lorehold-g2.ts`), which the engine tests and the AI soak play.
// Pins: CR 701.38a (vote), 701.17a (mill), 202.3 (mana value), 611.2a (until the end of your next turn), 607.2a (linked abilities), 601.2 and 118.9 (cast without paying the mana cost), 614.1a
// (the spell goes to the bottom of the library instead of a graveyard), 603.3d (a trigger with no legal target is removed from the stack: it never resolves).
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

const TEMPEST = real('Fateful Tempest');
const QUINTORIUS = real('Quintorius, Loremaster');

const QUIN = 'Quintorius, Loremaster';
const BOLT = 'Lightning Bolt';
const MURDER = 'Murder';
const GOBLIN = 'Raging Goblin';
const FILLER = Array.from({ length: 8 }, () => 'Plains');

describe('every card is valid and has the abilities of its SYNTHETIC sibling', () => {
  test('Fateful Tempest', () => {
    expect(validateCard(TEMPEST)).toEqual([]);
    expect(TEMPEST.faces[0]?.spell).toEqual(
      syntheticCard('SYNTHETIC Verdict Tempest').faces[0]?.spell,
    );
  });

  test('Quintorius, Loremaster', () => {
    expect(validateCard(QUINTORIUS)).toEqual([]);
    expect(QUINTORIUS.faces[0]?.abilities).toEqual(
      syntheticCard('SYNTHETIC Lore Elephant').faces[0]?.abilities,
    );
  });
});

describe('Fateful Tempest', () => {
  const vote = (...library: string[]) => {
    const g = scenario()
      .define(TEMPEST)
      .seat(0)
      .life(20)
      .hand('Fateful Tempest')
      .library(...library)
      .battlefield('Mountain', 'Mountain', 'Mountain', 'Mountain')
      .seat(1)
      .life(20)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast('Fateful Tempest', { pay: true });
    g.passAll();
    return g;
  };

  test('both players vote for past: two cards are milled and their total mana value is dealt to the opponent', () => {
    const g = vote(BOLT, MURDER, ...FILLER);
    g.expect.pending('chooseOption', 0);
    g.act(0).chooseOption('past');
    g.expect.pending('chooseOption', 1);
    g.act(1).chooseOption('past');
    g.expect.zone(BOLT, 'graveyard', { seat: 0 });
    g.expect.zone(MURDER, 'graveyard', { seat: 0 });
    g.expect.life(1, 16);
    g.expect.life(0, 20);
    g.expect.invariants();
  });

  test('one past, one present: one card milled, the next exiled and playable until the end of your next turn', () => {
    const g = vote(MURDER, GOBLIN, ...FILLER);
    g.act(0).chooseOption('past');
    g.act(1).chooseOption('present');
    g.expect.zone(MURDER, 'graveyard', { seat: 0 });
    g.expect.life(1, 17);
    g.expect.zone(GOBLIN, 'exile', { seat: 0 });
    g.expect.legal(0, { cast: GOBLIN });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.expect.legal(0, { cast: GOBLIN });
    g.act(0).cast(GOBLIN, { pay: true });
    g.passAll();
    g.expect.zone(GOBLIN, 'battlefield', { seat: 0 });
  });

  test('two present votes: nothing is milled, no damage, two cards exiled', () => {
    const g = vote(GOBLIN, 'Mountain', BOLT, ...FILLER);
    g.act(0).chooseOption('present');
    g.act(1).chooseOption('present');
    g.expect.life(1, 20);
    g.expect.zone(GOBLIN, 'exile', { seat: 0 });
    g.expect.zone('Mountain', 'exile', { seat: 0 });
    g.expect.zone(BOLT, 'library', { seat: 0 });
  });
});

describe('Quintorius, Loremaster', () => {
  const board = (graveyard: string[]) =>
    scenario()
      .define(QUINTORIUS)
      .seat(0)
      .life(20)
      .library(...FILLER)
      .graveyard(...graveyard)
      .battlefield(QUIN, 'Mountain', 'Plains', 'Plains')
      .seat(1)
      .life(20)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();

  test('the end step exiles a noncreature, nonland card of your graveyard and creates a 3/2 Spirit', () => {
    const g = board([BOLT, 'Grizzly Bears', 'Plains']);
    g.advanceTo('postcombatMain');
    g.passAll();
    // One legal target: the Bolt (the creature card and the land are not).
    if (g.state.pending?.kind === 'targets') {
      g.act(0).chooseTargets({ name: BOLT, zone: 'graveyard', seat: 0 });
    }
    g.passAll();
    g.expect.zone(BOLT, 'exile', { seat: 0 });
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 0 });
    g.expect.pt('Spirit', 3, 2);
    g.expect.derived('Spirit', { subtypes: ['Spirit'], colors: ['R', 'W'] });
    expect(g.object(QUIN).linkedExile).toEqual([g.id({ name: BOLT, zone: 'exile' })]);
  });

  test('with only creature and land cards in the graveyard it does not trigger and creates nothing', () => {
    const g = board(['Grizzly Bears', 'Plains']);
    g.advanceTo('postcombatMain');
    g.passAll();
    g.expect.stack([]);
    expect(g.find({ name: 'Spirit', zone: 'battlefield' })).toHaveLength(0);
  });

  test('the next turn a Spirit is sacrificed to cast that card without paying its mana cost, and it goes to the bottom of the library', () => {
    const g = board([BOLT]);
    g.advanceTo('postcombatMain');
    g.passAll();
    if (g.state.pending?.kind === 'targets') {
      g.act(0).chooseTargets({ name: BOLT, zone: 'graveyard', seat: 0 });
    }
    g.passAll();
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.act(0).activate(QUIN, { targets: [{ name: BOLT, zone: 'exile', seat: 0 }], pay: true });
    g.passAll();
    expect(g.find({ name: 'Spirit', zone: 'battlefield' })).toHaveLength(0);
    g.expect.legal(0, { cast: BOLT, alternative: 'free' });
    g.act(0).cast(BOLT, { alternative: 'free', targets: [{ player: 1 }] });
    g.passAll();
    g.expect.life(1, 17);
    g.expect.zone(BOLT, 'library', { seat: 0 });
    expect(g.find({ name: BOLT, zone: 'graveyard' })).toHaveLength(0);
    const library = g.state.seats[0]?.library ?? [];
    expect(library[library.length - 1]).toBe(g.id({ name: BOLT, zone: 'library' }));
    g.expect.invariants();
  });
});
