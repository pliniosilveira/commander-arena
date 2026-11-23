// Gemcutter Buccaneer (issue 134): "Whenever this creature or another Pirate you control enters, create a tapped Treasure token." and "Treasures you control are Equipment in
// addition to their other types and have "Equipped creature gets +2/+0," equip Pirate {1}, and equip {3}." The REAL Oracle text (the golden corpus) goes through the grammar
// with no override, is defined in an engine scenario and is played through applyAction. Pins: CR 613.1d (the Equipment type in layer 4), 613.1f (the abilities in layer 6),
// 613.4c (the +2/+0 in layer 7c), 702.6a and 702.6c (equip and "equip Pirate"), 301.5 and 704.5p (no longer an Equipment: unattached).
import { readFileSync } from 'node:fs';
import { type CardDefinition, getLegalActions, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';
import { dropped } from './parser-p5-helpers';

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

const LIBRARY = Array.from({ length: 8 }, () => 'Plains');
const BEARS = 'Grizzly Bears';
const TREASURE = 'Treasure';

describe('Gemcutter Buccaneer', () => {
  const gemcutter = real('Gemcutter Buccaneer');

  /** The Buccaneer is cast, so its own trigger makes the tapped Treasure. */
  const game = () => {
    const g = scenario()
      .define(gemcutter)
      .seat(0)
      .library(...LIBRARY)
      .hand(gemcutter.name)
      .battlefield(BEARS, 'Mountain', 'Mountain', 'Mountain', 'Mountain')
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(gemcutter.name, { pay: true });
    g.passAll(); // the creature spell
    g.passAll(); // its enters trigger
    return g;
  };

  /**
   * The index of a granted equip ability among the Treasure's abilities: the legal activations of the Treasure are its equip abilities, in the order the card gives them
   * ("equip Pirate {1}" first, then "equip {3}").
   */
  const equipIndex = (g: ReturnType<typeof game>, generic: '1' | '3') => {
    const treasure = g.object(TREASURE).id;
    const indexes = getLegalActions(g.state, 0)
      .flatMap((a) => (a.kind === 'activate' && a.object === treasure ? [a.abilityIndex] : []))
      .sort((x, y) => x - y);
    return (generic === '1' ? indexes[0] : indexes[1]) ?? -1;
  };

  test('the card is valid', () => {
    expect(validateCard(gemcutter)).toEqual([]);
  });

  test('entering makes a tapped Treasure that is an Equipment with two equip abilities', () => {
    const g = game();
    g.expect.zone(TREASURE, 'battlefield', { seat: 0, count: 1 });
    g.expect.tapped(TREASURE);
    g.expect.derived(TREASURE, { subtypes: ['Treasure', 'Equipment'] });
    // The opponent's turn, then the controller's next one: the lands and the Treasure are untapped.
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    expect(equipIndex(g, '1')).toBeGreaterThanOrEqual(0);
    expect(equipIndex(g, '3')).toBeGreaterThan(equipIndex(g, '1'));
  });

  test('equip {3} on any creature and equip Pirate {1} on a Pirate: the equipped creature gets +2/+0', () => {
    const g = game();
    // The opponent's turn, then the controller's next one: the lands and the Treasure are untapped.
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.act(0).activate(TREASURE, { ability: equipIndex(g, '3'), targets: [BEARS], pay: true });
    g.passAll();
    g.expect.attached(TREASURE, BEARS);
    g.expect.pt(BEARS, 4, 2);
    g.act(0).activate(TREASURE, {
      ability: equipIndex(g, '1'),
      targets: [gemcutter.name],
      pay: true,
    });
    g.passAll();
    g.expect.attached(TREASURE, gemcutter.name);
    g.expect.pt(BEARS, 2, 2);
    g.expect.pt(gemcutter.name, 3, 3);
    g.expect.invariants();
  });

  test.each([
    [
      'the type alone with a quoted ability and no equip',
      'Treasures you control are Equipment in addition to their other types and have "Equipped creature gets +2/+0."',
    ],
    [
      'an equip cost that is not mana',
      'Treasures you control are Equipment in addition to their other types and have "Equipped creature gets +2/+0," equip Pirate—Pay 2 life, and equip {3}.',
    ],
    [
      'another quoted ability',
      'Treasures you control are Equipment in addition to their other types and have "Equipped creature has flying," equip Pirate {1}, and equip {3}.',
    ],
  ])('%s is not read', (_what, text) => {
    expect(dropped(text, 'creature')).toBeDefined();
  });
});
