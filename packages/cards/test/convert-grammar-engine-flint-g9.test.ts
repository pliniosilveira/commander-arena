// Flint deck (issue 685), group 9: Rakdos, the Muscle, read from its REAL Oracle text (fixtures/corpus/golden.jsonl) with no override and played through applyAction on three seats.
// "Whenever you sacrifice another creature, exile cards equal to its mana value from the top of target player's library. Until your next end step, you may play those cards, and mana of
// any type can be spent to cast those spells." (CR 701.21, 701.13, 202.3, 603.10a, 609.4b, 611.2a) with its "Sacrifice another creature: Rakdos gains indestructible until end of turn. Tap
// it. Activate only once each turn." The sacrificed creature is the real Grizzly Bears ({1}{G}, mana value 2).
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
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
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

const MUSCLE = real('Rakdos, the Muscle');
const BEARS = 'Grizzly Bears';
const ELVES = 'Llanowar Elves'; // {G}
const FILLER = ['Plains', 'Plains', 'Plains', 'Plains'] as const;

describe('Rakdos, the Muscle (CR 701.21, 701.13, 202.3, 609.4b)', () => {
  test('is valid', () => {
    expect(validateCard(MUSCLE)).toEqual([]);
  });

  const table = () =>
    scenario({ seats: 3 })
      .define(MUSCLE)
      .seat(0)
      .library(...FILLER)
      .battlefield(MUSCLE.name, 'Mountain')
      .battlefield(BEARS, { label: 'fodder' })
      .seat(1)
      .library(ELVES, 'Forest', 'Forest', ...FILLER)
      .seat(2)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  const sacrifice = (g: ScenarioGame) => {
    g.act(0).activate(MUSCLE.name);
    g.passAll();
    if (g.state.pending?.kind === 'targets') g.act(0).chooseTargets({ player: 1 });
    g.passAll();
  };

  test('sacrificing a creature of mana value 2 exiles two cards of the chosen player', () => {
    const g = table();
    sacrifice(g);
    g.expect.zone(ELVES, 'exile', { seat: 1 });
    g.expect.zone('Forest', 'exile', { seat: 1, count: 1 });
    g.expect.zone('Forest', 'library', { seat: 1, count: 1 });
    g.expect.zone('Plains', 'library', { seat: 2, count: 4 });
  });

  test('the cards can be played, a spell with mana of any type, a land as a land', () => {
    const g = table();
    sacrifice(g);
    g.act(0).cast({ name: ELVES, seat: 1, zone: 'exile' }, { pay: true });
    g.passAll();
    g.expect.zone(ELVES, 'battlefield', { seat: 0 });
    g.act(0).playLand({ name: 'Forest', seat: 1, zone: 'exile' });
    g.expect.zone('Forest', 'battlefield', { seat: 0 });
  });
});
