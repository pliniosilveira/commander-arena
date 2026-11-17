import { readFileSync } from 'node:fs';
import type { CardDefinition } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, type GoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES, parsed } from './convert-grammar-helpers';

const cards: readonly GoldenCard[] = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

function real(name: string): CardDefinition {
  const card = cards.find((candidate) => candidate.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.status, `${name}: ${JSON.stringify(imported.support)}`).toBe('supported');
  expect(imported.support.unparsed, name).toEqual([]);
  return imported.definition;
}

const DISTANT_MELODY = real('Distant Melody');
const RAISE_THE_PALISADE = real('Raise the Palisade');
const BEAR = parsed('SYNTHETIC Bear', 'Creature — Bear', '', {
  manaCost: '{1}{G}',
  power: '2',
  toughness: '2',
  colors: ['G'],
});
const ELF = parsed('SYNTHETIC Elf', 'Creature — Elf', '', {
  manaCost: '{1}{G}',
  power: '1',
  toughness: '1',
  colors: ['G'],
});
const FILLER = Array.from({ length: 20 }, () => 'Island');

describe('creature type choices as a spell resolves', () => {
  test('Distant Melody draws for each permanent of the chosen type', () => {
    const g = scenario()
      .define(DISTANT_MELODY)
      .define(BEAR)
      .define(ELF)
      .seat(0)
      .hand(DISTANT_MELODY.name)
      .battlefield('Island', { count: 4 })
      .battlefield(BEAR.name, { count: 2 })
      .battlefield(ELF.name)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();

    g.act(0).cast(DISTANT_MELODY.name, { pay: true });
    g.passAll();
    g.act(0).chooseOption('Bear');
    g.passAll();

    g.expect.handSize(0, 2);
    g.expect.invariants();
  });

  test('Raise the Palisade returns every creature outside the chosen type', () => {
    const g = scenario()
      .define(RAISE_THE_PALISADE)
      .define(BEAR)
      .define(ELF)
      .seat(0)
      .hand(RAISE_THE_PALISADE.name)
      .battlefield('Island', { count: 5 })
      .battlefield(BEAR.name)
      .library(...FILLER)
      .seat(1)
      .battlefield(BEAR.name)
      .battlefield(ELF.name)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();

    g.act(0).cast(RAISE_THE_PALISADE.name, { pay: true });
    g.passAll();
    g.act(0).chooseOption('Elf');
    g.passAll();

    g.expect.zone(BEAR.name, 'hand', { seat: 0 });
    g.expect.zone(BEAR.name, 'hand', { seat: 1 });
    g.expect.zone(ELF.name, 'battlefield', { seat: 1 });
    g.expect.invariants();
  });
});
