// Gideon Jura (First Flight starter commander decks): the REAL Oracle text (the corpus's golden.jsonl) goes through the grammar as a card with no override, is defined in an engine
// scenario and is played through applyAction, so the nodes the parser writes for the real text are what the engine runs. Its abilities are those of its SYNTHETIC sibling
// (`synthetic-attack-magnet.ts`). Pins: CR 508.1d (a requirement is obeyed when able), 508.1a-c (a creature attacks a player or a planeswalker), 611.2c (the requirement reaches
// creatures that arrive later), 606 (loyalty abilities), 615 (prevention), 205.1b-style type addition (the walker stays a planeswalker).
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
  expect(imported.support.reasons, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

const gideon = real('Gideon Jura');
const GIDEON = gideon.name;
const BEARS = 'Grizzly Bears';
const HAWK = "Healer's Hawk";
const LIBRARY = Array.from({ length: 12 }, () => 'Plains');

describe('Gideon Jura', () => {
  test('valid, with the abilities of its SYNTHETIC sibling', () => {
    expect(validateCard(gideon)).toEqual([]);
    expect(gideon.faces[0]?.abilities).toEqual(
      syntheticCard('SYNTHETIC Magnet Walker').faces[0]?.abilities,
    );
    expect(gideon.faces[0]?.loyalty).toBe(6);
  });

  const board = () =>
    scenario()
      .define(gideon)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(GIDEON, 'Plains')
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS, HAWK, 'Mountain')
      .hand('Lightning Bolt')
      .at('precombatMain', { active: 0 })
      .build();

  test('+2: the opponent must attack Gideon with everything that can attack, on their next turn only', () => {
    const g = board();
    g.act(0).activate(GIDEON, { ability: 0, targets: [{ player: 1 }] });
    g.pass();
    g.pass();
    g.expect.counters(GIDEON, { loyalty: 8 });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('declareAttackers', { attack: false });
    expect(g.act(1).try.declareAttackers([]).ok).toBe(false);
    expect(g.act(1).try.declareAttackers([{ attacker: BEARS }, { attacker: HAWK }]).ok).toBe(false);
    g.act(1).attack([BEARS, HAWK], GIDEON);
    g.expect.invariants();
  });

  test('+2 does not bind the creatures once their turn is over', () => {
    const g = board();
    g.act(0).activate(GIDEON, { ability: 0, targets: [{ player: 1 }] });
    g.pass();
    g.pass();
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('declareAttackers', { attack: false });
    expect(g.act(1).try.declareAttackers([]).ok).toBe(true);
  });

  test('-2: destroys a tapped creature', () => {
    const g = scenario()
      .define(gideon)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(GIDEON)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS, { tapped: true })
      .battlefield(HAWK)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).activate(GIDEON, { ability: 1, targets: [BEARS] });
    g.pass();
    g.pass();
    g.expect.counters(GIDEON, { loyalty: 4 });
    g.expect.zone(BEARS, 'graveyard');
    g.expect.zone(HAWK, 'battlefield');
  });

  test('0: a 6/6 Human Soldier creature that is still a planeswalker, and damage to it is prevented', () => {
    const g = board();
    g.act(0).activate(GIDEON, { ability: 2 });
    g.pass();
    g.pass();
    g.expect.pt(GIDEON, 6, 6);
    g.expect.derived(GIDEON, {
      types: ['planeswalker', 'creature'],
      subtypes: ['Gideon', 'Human', 'Soldier'],
    });
    g.act(0).pass();
    g.act(1).cast('Lightning Bolt', { targets: [GIDEON], pay: true });
    g.pass();
    g.pass();
    g.expect.counters(GIDEON, { loyalty: 6 });
    g.expect.zone(GIDEON, 'battlefield');
  });
});
