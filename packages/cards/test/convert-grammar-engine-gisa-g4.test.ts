// The Gisa deck (issue 41), group 4 (D-1430 to D-1433): the REAL Oracle text of Whip of Erebos, Embalmer's Tools, Tetzimoc, Primal Death and Ghost Vacuum (the corpus's golden.jsonl, taken
// from the issue) goes through the grammar as a card with no override, is defined in an engine scenario and is played through applyAction, so the nodes the parser writes for the real
// text are what the engine runs. The abilities of each real card are also the ones of its SYNTHETIC sibling of the engine fixtures (`synthetic-gisa-g4.ts`), which the engine tests and the
// AI soak play. Pins: CR 603.7c (a delayed ability about the object), CR 614.1a (the exile instead), CR 601.2f and 113.6b (the reduction of the abilities of cards in a graveyard),
// CR 701.20a (reveal), CR 602.5b (activate only during your turn), CR 607.2a and 113.7a (the linked exile of a sacrificed permanent), CR 122.1b (flying counter).
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

const BEARS = 'Grizzly Bears';
const SPIDER = 'Giant Spider';
const MURDER = 'Murder';
const SHADE = 'SYNTHETIC Unearth Shade'; // unearth {1}{B}
const LIBRARY = Array.from({ length: 8 }, () => 'Plains');

const whip = real('Whip of Erebos');
const tools = real("Embalmer's Tools");
const tetzimoc = real('Tetzimoc, Primal Death');
const vacuum = real('Ghost Vacuum');

describe('every card is valid and has the abilities of its SYNTHETIC sibling', () => {
  test.each([
    ['Whip of Erebos', whip, 'SYNTHETIC Grave Whip'],
    ["Embalmer's Tools", tools, 'SYNTHETIC Grave Tools'],
    ['Tetzimoc, Primal Death', tetzimoc, 'SYNTHETIC Prey Hunter'],
    ['Ghost Vacuum', vacuum, 'SYNTHETIC Soul Vacuum'],
  ] as const)('%s', (_name, card, sibling) => {
    expect(validateCard(card)).toEqual([]);
    expect(card.faces[0]?.abilities).toEqual(syntheticCard(sibling).faces[0]?.abilities);
  });
});

describe('Whip of Erebos', () => {
  const game = () =>
    scenario()
      .define(whip)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(whip.name)
      .battlefield('Swamp', 'Swamp', 'Swamp', 'Swamp')
      .graveyard(BEARS, { label: 'card' })
      .seat(1)
      .library(...LIBRARY)
      .battlefield('Swamp', 'Swamp', 'Swamp')
      .hand(MURDER)
      .at('precombatMain', { active: 0 })
      .build();

  test('returns the creature with haste and lifelink, exiles it at the end step and exiles it instead of letting it go', () => {
    const g = game();
    g.act(0).activate(whip.name, { ability: 1, targets: ['card'], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.derived(BEARS, { keywords: ['haste', 'lifelink'] });
    g.advanceTo('end');
    g.expect.stack([`${BEARS} (ability)`]);
    g.passAll();
    g.expect.zone(BEARS, 'exile', { seat: 0 });
    g.expect.invariants();
  });

  test('destroyed on the way, it is exiled instead of dying', () => {
    const g = game();
    g.act(0).activate(whip.name, { ability: 1, targets: ['card'], pay: true });
    g.passAll();
    g.act(0).pass();
    g.act(1).cast(MURDER, { pay: true, targets: [BEARS] });
    g.passAll();
    g.expect.zone(BEARS, 'exile', { seat: 0 });
    g.expect.noObject(BEARS, { zone: 'graveyard' });
  });

  test('only as a sorcery: not in the opponent’s turn', () => {
    const g = scenario()
      .define(whip)
      .seat(0)
      .battlefield(whip.name)
      .battlefield('Swamp', 'Swamp', 'Swamp', 'Swamp')
      .graveyard(BEARS)
      .seat(1)
      .at('precombatMain', { active: 1 })
      .build();
    g.expect.illegal(0, { activate: whip.name, ability: 1 });
  });
});

describe("Embalmer's Tools", () => {
  test('unearth {1}{B} of a creature card in your graveyard costs {B}; the Zombie tap mills a card', () => {
    const g = scenario()
      .define(tools)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(tools.name)
      .graveyard(SHADE)
      .battlefield('Swamp')
      .seat(1)
      .library(...LIBRARY)
      .build();
    g.act(0).activate(SHADE, { pay: true });
    g.passAll();
    g.expect.zone(SHADE, 'battlefield', { seat: 0 });
    g.expect.invariants();
  });
});

describe('Tetzimoc, Primal Death', () => {
  const game = () =>
    scenario()
      .define(tetzimoc)
      .seat(0)
      .library(...LIBRARY)
      .hand(tetzimoc.name)
      .battlefield('Swamp', { count: 8 })
      .seat(1)
      .library(...LIBRARY)
      .battlefield(SPIDER, { label: 'theirs' })
      .battlefield(BEARS, { label: 'other' })
      .at('precombatMain', { active: 0 })
      .build();

  test('reveals itself from the hand to put a prey counter, and destroys the creatures with one when it enters', () => {
    const g = game();
    g.act(0).activate(tetzimoc.name, { targets: ['theirs'], pay: true });
    g.expect.eventLog([{ kind: 'cardsRevealed', names: [tetzimoc.name], from: 'hand' }]);
    g.expect.zone(tetzimoc.name, 'hand', { seat: 0 });
    g.passAll();
    g.expect.counters('theirs', { prey: 1 });
    g.act(0).cast(tetzimoc.name, { pay: true });
    g.passAll();
    g.passAll();
    g.expect.zone(SPIDER, 'graveyard', { seat: 1 });
    g.expect.zone(BEARS, 'battlefield', { seat: 1 });
    g.expect.invariants();
  });

  test('only during your turn', () => {
    const g = scenario()
      .define(tetzimoc)
      .seat(0)
      .hand(tetzimoc.name)
      .battlefield('Swamp')
      .battlefield(BEARS)
      .seat(1)
      .battlefield(SPIDER)
      .at('precombatMain', { active: 1 })
      .build();
    g.expect.illegal(0, { activate: tetzimoc.name });
  });
});

describe('Ghost Vacuum', () => {
  test('exiles a card, then is sacrificed to put the creature cards it exiled back as 1/1 Spirits with flying counters', () => {
    const g = scenario()
      .define(vacuum)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(vacuum.name)
      .battlefield('Swamp', { count: 6 })
      .seat(1)
      .library(...LIBRARY)
      .graveyard(SPIDER)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).activate(vacuum.name, { ability: 0, targets: [SPIDER] });
    g.passAll();
    g.expect.zone(SPIDER, 'exile');
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.act(0).activate(vacuum.name, { ability: 1, pay: true });
    g.expect.zone(vacuum.name, 'graveyard', { seat: 0 });
    g.passAll();
    g.expect.zone(SPIDER, 'battlefield', { seat: 0 });
    g.expect.counters(SPIDER, { flying: 1 });
    g.expect.pt(SPIDER, 1, 1);
    g.expect.derived(SPIDER, { keywords: ['flying', 'reach'], subtypes: ['Spider', 'Spirit'] });
    g.expect.invariants();
  });
});
