import { readFileSync } from 'node:fs';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, type GoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const CORPUS = new URL('./fixtures/corpus/golden.jsonl', import.meta.url);
const cards: readonly GoldenCard[] = parseGolden(readFileSync(CORPUS, 'utf8'));

function real(name: string) {
  const card = cards.find((entry) => entry.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  return importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
}

describe('Cryotheory Adept, activated from the graveyard', () => {
  const imported = real('Cryotheory Adept');

  test('pays {3}{U}, exiles itself, taps the target and puts a stun counter on it', () => {
    const g = scenario()
      .define(imported.definition)
      .seat(0)
      .graveyard(imported.definition.name)
      .battlefield('Island', { count: 4 })
      .seat(1)
      .battlefield('Grizzly Bears')
      .at('precombatMain')
      .build();

    expect(imported.support.status).toBe('supported');
    g.act(0).activate(imported.definition.name, {
      targets: ['Grizzly Bears'],
      pay: true,
    });
    g.expect.zone(imported.definition.name, 'exile', { seat: 0 });
    resolveTop(g);
    g.expect.tapped('Grizzly Bears', true);
    g.expect.counters('Grizzly Bears', { stun: 1 });
    g.expect.invariants();
  });

  test('cannot activate the ability while Cryotheory Adept is on the battlefield', () => {
    const g = scenario()
      .define(imported.definition)
      .seat(0)
      .battlefield(imported.definition.name)
      .at('precombatMain')
      .build();

    g.expect.illegal(0, { activate: imported.definition.name });
  });
});

function resolveTop(g: ScenarioGame): void {
  g.pass();
  g.pass();
}
