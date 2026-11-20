// Sliver Swarm deck, group D (issue 133): Harsh Mercy, Titan of Littjara and Descendants' Fury. The REAL Oracle text of the corpus's golden.jsonl goes through the grammar with
// no override and is played through applyAction. Support cards (creatures) are SYNTHETIC. Pins: CR 101.4 (players who choose at the same time choose in APNAP order),
// CR 205.3m (creature types), CR 702.73a (a changeling has every creature type), CR 701.19c (a creature that can't be regenerated), CR 608.2d.
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES, parsed, parseOnly } from './convert-grammar-helpers';
import { syntheticCard as storedCard } from './convert-helpers';

const GOLDEN = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

function real(name: string): CardDefinition {
  const card = GOLDEN.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.unparsed, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  expect(validateCard(imported.definition), name).toEqual([]);
  return imported.definition;
}

const creature = (name: string, types: string, power = '2', toughness = '2', text = '') =>
  parsed(name, `Creature — ${types}`, text, {
    manaCost: '{1}{G}',
    power,
    toughness,
    colors: ['G'],
  });

const BEAR = creature('SYNTHETIC D Bear', 'Bear');
const ELF = creature('SYNTHETIC D Elf', 'Elf', '1', '1');
const GOBLIN = creature('SYNTHETIC D Goblin', 'Goblin', '1', '1');
const SHAPESHIFTER = creature('SYNTHETIC D Shifter', 'Shapeshifter', '1', '1', 'Changeling');
const FILLER = Array.from({ length: 20 }, () => 'Island');

describe('Harsh Mercy', () => {
  const HARSH_MERCY = real('Harsh Mercy');
  const build = () =>
    scenario()
      .define(HARSH_MERCY)
      .define(BEAR)
      .define(ELF)
      .define(GOBLIN)
      .define(SHAPESHIFTER)
      .seat(0)
      .hand(HARSH_MERCY.name)
      .battlefield('Plains', { count: 3 })
      .battlefield(BEAR.name)
      .battlefield(GOBLIN.name)
      .battlefield(SHAPESHIFTER.name)
      .library(...FILLER)
      .seat(1)
      .battlefield(BEAR.name)
      .battlefield(ELF.name)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();

  test('each player chooses in turn order, and creatures of none of the chosen types are destroyed', () => {
    const g = build();
    g.act(0).cast(HARSH_MERCY.name, { pay: true });
    g.passAll();
    g.expect.pending('chooseOption', 0);
    g.act(0).chooseOption('Goblin');
    g.expect.pending('chooseOption', 1);
    g.act(1).chooseOption('Elf');
    g.passAll();
    // Goblin (chosen by you) and Elf (chosen by the opponent) stay, and so does the changeling, which is every creature type (CR 702.73a).
    g.expect.zone(GOBLIN.name, 'battlefield', { seat: 0 });
    g.expect.zone(ELF.name, 'battlefield', { seat: 1 });
    g.expect.zone(SHAPESHIFTER.name, 'battlefield', { seat: 0 });
    g.expect.zone(BEAR.name, 'graveyard', { seat: 0 });
    g.expect.zone(BEAR.name, 'graveyard', { seat: 1 });
    g.expect.invariants();
  });

  test('both players choosing the same type leaves only that type (and the changeling)', () => {
    const g = build();
    g.act(0).cast(HARSH_MERCY.name, { pay: true });
    g.passAll();
    g.act(0).chooseOption('Bear');
    g.act(1).chooseOption('Bear');
    g.passAll();
    g.expect.zone(BEAR.name, 'battlefield', { seat: 0 });
    g.expect.zone(BEAR.name, 'battlefield', { seat: 1 });
    g.expect.zone(GOBLIN.name, 'graveyard', { seat: 0 });
    g.expect.zone(ELF.name, 'graveyard', { seat: 1 });
    g.expect.zone(SHAPESHIFTER.name, 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('the non-active player chooses second when the opponent is the one casting', () => {
    const g = scenario()
      .define(HARSH_MERCY)
      .define(BEAR)
      .define(ELF)
      .seat(0)
      .battlefield(BEAR.name)
      .library(...FILLER)
      .seat(1)
      .hand(HARSH_MERCY.name)
      .battlefield('Plains', { count: 3 })
      .battlefield(ELF.name)
      .library(...FILLER)
      .at('precombatMain', { active: 1, turn: 2 })
      .build();
    g.act(1).cast(HARSH_MERCY.name, { pay: true });
    g.passAll();
    g.expect.pending('chooseOption', 1);
    g.act(1).chooseOption('Elf');
    g.expect.pending('chooseOption', 0);
    g.act(0).chooseOption('Bear');
    g.passAll();
    g.expect.zone(BEAR.name, 'battlefield', { seat: 0 });
    g.expect.zone(ELF.name, 'battlefield', { seat: 1 });
    g.expect.invariants();
  });

  test('another count of choices or another player set is not read', () => {
    for (const text of [
      "Each opponent chooses a creature type. Destroy all creatures that aren't of a type chosen this way.",
      "Each player chooses two creature types. Destroy all creatures that aren't of a type chosen this way.",
      "Each player chooses a creature. Destroy all creatures that aren't of a type chosen this way.",
    ]) {
      const imported = parseOnly(
        storedCard({
          name: 'SYNTHETIC D Probe Mercy',
          typeLine: 'Sorcery',
          manaCost: '{2}{W}',
          oracleText: text,
        }),
      );
      expect(imported.support.status, text).toBe('unsupported');
    }
  });
});
