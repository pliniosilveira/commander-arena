// Flint deck (issue 685), group 16: Petty Larceny, read from its REAL Oracle text (fixtures/corpus/golden.jsonl) with no override and played through applyAction on three seats.
// "Freerunning {1}{B}" (CR 702.173a, 118.9, 601.2b: the cost is paid rather than {3}{B} if the caster dealt combat damage to a player this turn with an Assassin or commander) and "Look at the top two
// cards of target opponent's library and exile those cards face down. You may play those cards for as long as they remain exiled, and mana of any type can be spent to cast them. Create a Treasure
// token." (CR 401.2, 406.3, 701.20, 609.4b, 111.10a). The Assassin is a SYNTHETIC Human Assassin; the commander case is a commander of seat 0.
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

const PETTY = real('Petty Larceny');
const ASSASSIN = parsed('SYNTHETIC Dock Assassin', 'Creature — Human Assassin', '', {
  manaCost: '{B}',
  power: '2',
  toughness: '2',
  colors: ['B'],
});
const BEARS = 'Grizzly Bears';
const ELVES = 'Llanowar Elves'; // {G}
const FILLER = ['Plains', 'Plains', 'Plains', 'Plains'] as const;

describe('Petty Larceny (CR 702.173a, 118.9, 401.2, 406.3, 609.4b)', () => {
  test('is valid and lists a freerunning cost', () => {
    expect(validateCard(PETTY)).toEqual([]);
    expect(PETTY.faces[0]?.alternativeCosts?.some((a) => a.kind === 'freerunning')).toBe(true);
  });

  const table = (attacker: string, commander = false) =>
    scenario({ seats: 3 })
      .define(PETTY)
      .define(ASSASSIN)
      .seat(0)
      .life(20)
      .library(...FILLER)
      .hand(PETTY.name)
      .battlefield('Swamp', 'Swamp')
      .battlefield(attacker, commander ? { label: 'hitter', commander: true } : { label: 'hitter' })
      .seat(1)
      .life(20)
      .library(ELVES, 'Forest', ...FILLER)
      .seat(2)
      .life(20)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  const hit = (g: ScenarioGame) => {
    g.playCombat({
      attack: [{ attacker: 'hitter', target: { player: 1 } }],
      until: 'combatDamage',
    });
    g.advanceTo('postcombatMain');
  };

  test('after an Assassin hit a player, it can be cast for {1}{B}', () => {
    const g = table(ASSASSIN.name);
    hit(g);
    g.act(0).cast(PETTY.name, { alternative: 'freerunning', targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.zone(PETTY.name, 'graveyard', { seat: 0 });
    g.expect.zone(ELVES, 'exile', { seat: 1 });
    g.expect.zone('Forest', 'exile', { seat: 1 });
    expect(g.find({ name: 'Treasure', zone: 'battlefield', seat: 0 })).toHaveLength(1);
  });

  test('damage dealt by a commander counts as well', () => {
    const g = table(BEARS, true);
    hit(g);
    g.act(0).cast(PETTY.name, { alternative: 'freerunning', targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.zone(PETTY.name, 'graveyard', { seat: 0 });
  });

  test('with no damage dealt, the freerunning cost is not available', () => {
    const g = table(ASSASSIN.name);
    expect(() =>
      g
        .act(0)
        .cast(PETTY.name, { alternative: 'freerunning', targets: [{ player: 1 }], pay: true }),
    ).toThrow();
  });

  test('damage dealt by a creature that is no Assassin and no commander does not count', () => {
    const g = table(BEARS);
    hit(g);
    expect(() =>
      g
        .act(0)
        .cast(PETTY.name, { alternative: 'freerunning', targets: [{ player: 1 }], pay: true }),
    ).toThrow();
  });

  test('the exiled cards can be played with mana of any type', () => {
    const g = table(ASSASSIN.name);
    hit(g);
    g.act(0).cast(PETTY.name, { alternative: 'freerunning', targets: [{ player: 1 }], pay: true });
    g.passAll();
    // The Treasure pays {G}: any type of mana can be spent on the spell cast from exile.
    g.act(0).cast({ name: ELVES, seat: 1, zone: 'exile' }, { pay: true });
    g.passAll();
    g.expect.zone(ELVES, 'battlefield', { seat: 0 });
  });
});
