// The Death Toll deck, group A: the REAL cards of the golden corpus that count the card types among the cards of a graveyard (delirium, CR 207.2c, 205.2a)
// read through the grammar only and played through applyAction. Stand-ins are SYNTHETIC (named so).
import { readFileSync } from 'node:fs';
import { type CardDefinition, getView } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, type GoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES, parsed } from './convert-grammar-helpers';

const cards: readonly GoldenCard[] = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

function real(name: string): CardDefinition {
  const card = cards.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.unparsed, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

const FILLER = Array.from({ length: 30 }, () => 'Island');
const SORC = parsed('SYNTHETIC Sorcery Card', 'Sorcery', 'You gain 1 life.', { manaCost: '{1}' });
const INST = parsed('SYNTHETIC Instant Card', 'Instant', 'You gain 1 life.', { manaCost: '{1}' });
const CRE = parsed('SYNTHETIC Creature Card', 'Creature — Elf', '', {
  manaCost: '{1}',
  power: '1',
  toughness: '1',
});
const CRE2 = parsed('SYNTHETIC Creature Card Two', 'Creature — Elf', '', {
  manaCost: '{1}',
  power: '1',
  toughness: '1',
});
const ART = parsed('SYNTHETIC Artifact Card', 'Artifact', '', { manaCost: '{1}' });

function game(def: CardDefinition, yard: readonly string[], opponentYard: readonly string[] = []) {
  return scenario()
    .define(def)
    .define(SORC)
    .define(INST)
    .define(CRE)
    .define(CRE2)
    .define(ART)
    .seat(0)
    .battlefield(def.name, { label: 'it' })
    .graveyard(...yard)
    .library(...FILLER)
    .seat(1)
    .graveyard(...opponentYard)
    .library(...FILLER)
    .at('precombatMain', { active: 0, turn: 1 })
    .build();
}

type G = ReturnType<typeof game>;
const statsOf = (g: G, name: string) => {
  const o = getView(g.state, 0).battlefield.find((v) => v.name === name);
  return [o?.power, o?.toughness];
};

const THREE = [SORC.name, INST.name, CRE.name];
const FOUR = [...THREE, ART.name];

describe('delirium statics: "as long as there are four or more card types among cards in your graveyard"', () => {
  test.each(['Grim Flayer', 'Gnarlwood Dryad'])(
    '%s gets +2/+2 with four types, not with three (CR 205.2a)',
    (name) => {
      const def = real(name);
      const [p = 0, t = 0] = statsOf(game(def, THREE), name);
      expect(statsOf(game(def, FOUR), name)).toEqual([p + 2, t + 2]);
    },
  );

  test('two creature cards are one type; the graveyard of another player is not counted', () => {
    const def = real('Grim Flayer');
    const none = statsOf(game(def, []), 'Grim Flayer');
    expect(statsOf(game(def, [...THREE, CRE2.name]), 'Grim Flayer')).toEqual(none);
    expect(statsOf(game(def, THREE, [ART.name]), 'Grim Flayer')).toEqual(none);
  });

  test('Deathcap Cultivator has deathtouch only with four types', () => {
    const def = real('Deathcap Cultivator');
    const three = game(def, THREE);
    three.expect.derived('it', { keywords: [] });
    const four = game(def, FOUR);
    four.expect.derived('it', { keywords: ['deathtouch'] });
  });
});
