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

describe('Deluge of Doom (all creatures get -X/-X, X the card types among cards in your graveyard)', () => {
  const DELUGE = real('Deluge of Doom');
  const BIG = parsed('SYNTHETIC Big Beast', 'Creature — Beast', '', {
    manaCost: '{1}',
    power: '5',
    toughness: '5',
  });
  const run = (yard: readonly string[]) => {
    const g = scenario()
      .define(DELUGE)
      .define(BIG)
      .define(SORC)
      .define(INST)
      .define(CRE)
      .define(ART)
      .seat(0)
      .hand(DELUGE.name)
      .battlefield('Swamp', { count: 3 })
      .battlefield(BIG.name)
      .graveyard(...yard)
      .library(...FILLER)
      .seat(1)
      .battlefield(BIG.name)
      .graveyard(ART.name)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.act(0).cast(DELUGE.name, { pay: true });
    g.passAll();
    return g;
  };
  const power = (g: ReturnType<typeof run>, seat: 0 | 1) =>
    getView(g.state, seat).battlefield.find((v) => v.name === BIG.name)?.power;

  test('counts each type once, of the graveyard of the controller only, as it resolves (CR 205.2a)', () => {
    // Two creature cards and a sorcery are two types; the artifact in the opponent's graveyard is not counted. The spell is a third type only once it is in the graveyard,
    // and it leaves the stack after the effect has been worked out (CR 608.2k), so X is 2 and 3 would be a bug.
    const g = run([CRE.name, CRE.name, SORC.name]);
    expect(power(g, 0)).toBe(3);
    expect(power(g, 1)).toBe(3);
    g.expect.invariants();
  });

  test('an empty graveyard gives -0/-0', () => {
    expect(power(run([]), 0)).toBe(5);
  });
});
