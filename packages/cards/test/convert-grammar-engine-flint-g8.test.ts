// Flint deck (issue 685), group 8: Laughing Jasper Flint, read from its REAL Oracle text (fixtures/corpus/golden.jsonl) with no override and played through applyAction on three seats.
// "Creatures you control but don't own are Mercenaries in addition to their other types." (CR 108.3, 205.1b, 613.1d) and "At the beginning of your upkeep, exile the top X cards of target
// opponent's library, where X is the number of outlaws you control. Until end of turn, you may cast spells from among those cards, and mana of any type can be spent to cast those spells."
// (CR 701.13, 700.12, 601.2, 609.4b): a land among the cards is not a spell, so it stays in exile. The stolen creature is the real Grizzly Bears, owned by seat 1 and controlled by seat 0.
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
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
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

const FLINT = real('Laughing Jasper Flint');
const BEARS = 'Grizzly Bears';
const ELVES = 'Llanowar Elves'; // {G}
const FILLER = ['Plains', 'Plains', 'Plains', 'Plains'] as const;

describe('Laughing Jasper Flint: creatures you control but don’t own are Mercenaries (CR 108.3, 613.1d)', () => {
  test('is valid', () => {
    expect(validateCard(FLINT)).toEqual([]);
  });

  const table = () =>
    scenario({ seats: 3 })
      .define(FLINT)
      .seat(0)
      .library(...FILLER)
      .battlefield(FLINT.name)
      .battlefield(BEARS, { label: 'mine' })
      .seat(1)
      .library(...FILLER)
      .battlefield(BEARS, { label: 'stolen', controller: 0 })
      .battlefield(BEARS, { label: 'theirs' })
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('a creature of another owner that you control is a Mercenary, in addition to its types', () => {
    const g = table();
    g.expect.derived('stolen', { subtypes: ['Bear', 'Mercenary'] });
  });

  test('your own creature and a creature another player controls are not', () => {
    const g = table();
    g.expect.derived('mine', { subtypes: ['Bear'] });
    g.expect.derived('theirs', { subtypes: ['Bear'] });
  });
});

describe('Laughing Jasper Flint: the upkeep exile (CR 701.13, 700.12, 609.4b)', () => {
  const table = (withStolen: boolean) => {
    const b = scenario({ seats: 3 })
      .define(FLINT)
      .seat(0)
      .library(...FILLER)
      .battlefield(FLINT.name, 'Mountain')
      .seat(1)
      .library(ELVES, 'Forest', ...FILLER)
      .seat(2)
      .library(...FILLER);
    return (withStolen ? b.battlefield(BEARS, { label: 'stolen', controller: 0 }) : b)
      .at('end', { active: 2, turn: 2 })
      .build();
  };

  test('with Flint and one stolen Mercenary, X is 2: two cards are exiled from the chosen opponent, and the spell takes any mana', () => {
    const g = table(true);
    g.advanceTo('upkeep', { turn: 3 });
    if (g.state.pending?.kind === 'targets') g.act(0).chooseTargets({ player: 1 });
    g.passAll();
    g.expect.zone(ELVES, 'exile', { seat: 1 });
    g.expect.zone('Forest', 'exile', { seat: 1 });
    g.expect.zone('Plains', 'library', { seat: 1, count: 4 });
    // The land is no spell: it cannot be played with this permission; the Elves are cast with red mana for {G}.
    g.advanceTo('precombatMain');
    g.expect.illegal(0, { playLand: { name: 'Forest', seat: 1, zone: 'exile' } });
    g.act(0).cast({ name: ELVES, seat: 1, zone: 'exile' }, { pay: true });
    g.passAll();
    g.expect.zone(ELVES, 'battlefield', { seat: 0 });
  });

  test('with Flint alone X is 1: one card is exiled', () => {
    const g = table(false);
    g.advanceTo('upkeep', { turn: 3 });
    if (g.state.pending?.kind === 'targets') g.act(0).chooseTargets({ player: 1 });
    g.passAll();
    g.expect.zone(ELVES, 'exile', { seat: 1 });
    g.expect.zone('Forest', 'library', { seat: 1 });
  });
});
