// Flint deck (issue 685), group 4: At Knifepoint, read from its REAL Oracle text (fixtures/corpus/golden.jsonl) with no override and played through applyAction on three seats.
// "During your turn, outlaws you control have first strike." (CR 611.3a, 700.12, 702.7) and "Whenever you commit a crime, create a 1/1 red Mercenary creature token with ...
// This ability triggers only once each turn." (CR 700.13, 603.2, D-150). Committing a crime is targeting an opponent, a permanent or card of theirs, or their stack objects, with a spell
// (CR 700.13); the second crime of the turn makes no second token.
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES, parsed } from './convert-grammar-helpers';

const GOLDEN = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);
function real(name: string): CardDefinition {
  const card = GOLDEN.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.unparsed, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

const KNIFEPOINT = real('At Knifepoint');
const ROGUE = parsed('SYNTHETIC Dock Rogue', 'Creature — Human Rogue', '', {
  manaCost: '{R}',
  power: '1',
  toughness: '1',
  colors: ['R'],
});
const BEARS = 'Grizzly Bears';
const BOLT = 'Lightning Bolt';
const FILLER = ['Plains', 'Plains', 'Plains', 'Plains'] as const;

const table = (active: 0 | 1 = 0) =>
  scenario({ seats: 3 })
    .define(KNIFEPOINT)
    .define(ROGUE)
    .seat(0)
    .life(20)
    .library(...FILLER)
    .hand(BOLT, BOLT)
    .pool('RR')
    .battlefield(KNIFEPOINT.name)
    .battlefield(ROGUE.name, { label: 'rogue' })
    .battlefield(BEARS, { label: 'bears' })
    .seat(1)
    .life(20)
    .library(...FILLER)
    .seat(2)
    .life(20)
    .library(...FILLER)
    .at('precombatMain', { active, turn: 3 })
    .build();

const mercenaries = (g: ScenarioGame) =>
  g.find({ name: 'Mercenary', zone: 'battlefield', seat: 0 }).length;

describe('At Knifepoint: outlaws have first strike during your turn (CR 611.3a, 700.12)', () => {
  test('is valid', () => {
    expect(validateCard(KNIFEPOINT)).toEqual([]);
  });

  test('on your turn an outlaw has first strike and a creature that is no outlaw does not', () => {
    const g = table(0);
    g.expect.derived('rogue', { keywords: ['firstStrike'] });
    g.expect.derived('bears', { keywords: [] });
  });

  test('on another player’s turn the outlaw has none', () => {
    const g = table(1);
    g.expect.derived('rogue', { keywords: [] });
  });
});

describe('At Knifepoint: a Mercenary when you commit a crime, once each turn (CR 700.13, 603.2)', () => {
  test('targeting an opponent with a spell makes one 1/1 red Mercenary token', () => {
    const g = table();
    expect(mercenaries(g)).toBe(0);
    g.act(0)
      .cast(`${BOLT}[0]`)
      .targets([{ player: 1 }])
      .pay();
    g.passAll();
    expect(mercenaries(g)).toBe(1);
  });

  test('a second crime in the same turn makes no second token', () => {
    const g = table();
    g.act(0)
      .cast(`${BOLT}[0]`)
      .targets([{ player: 1 }])
      .pay();
    g.passAll();
    g.act(0)
      .cast(`${BOLT}[0]`)
      .targets([{ player: 2 }])
      .pay();
    g.passAll();
    expect(mercenaries(g)).toBe(1);
  });

  test('targeting your own creature is no crime', () => {
    const g = table();
    g.act(0).cast(`${BOLT}[0]`).targets(['bears']).pay();
    g.passAll();
    expect(mercenaries(g)).toBe(0);
  });
});
