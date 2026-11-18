// Wizened Mentor (issue 104): the REAL Oracle text (the corpus's golden.jsonl, taken from the issue) goes through the grammar as a card with no override, is defined in an engine
// scenario and is played through applyAction, so the nodes the parser writes for the real text are what the engine runs. Its ability is the one of its SYNTHETIC sibling
// (`synthetic-activates-ability.ts`). Pins: CR 602.2 (activating), CR 605.1a (a mana ability is not read), CR 603.2 (once each turn).
import { readFileSync } from 'node:fs';
import { type CardDefinition, syntheticCard, validateCard } from '@commander-arena/engine';
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

const NEEDLE = 'SYNTHETIC Needle Rogue';
const ELVES = 'Llanowar Elves';
const LIBRARY = Array.from({ length: 8 }, () => 'Swamp');
const mentor = real('Wizened Mentor');

describe('Wizened Mentor', () => {
  test('valid, with the ability of its SYNTHETIC sibling', () => {
    expect(validateCard(mentor)).toEqual([]);
    expect(mentor.faces[0]?.abilities).toEqual(
      syntheticCard('SYNTHETIC Ability Watcher').faces[0]?.abilities,
    );
  });

  const board = () =>
    scenario()
      .define(mentor)
      .define(syntheticCard(NEEDLE))
      .seat(0)
      .library(...LIBRARY)
      .battlefield(mentor.name)
      .battlefield('Grizzly Bears', { label: 'mine' })
      .seat(1)
      .library(...LIBRARY)
      .battlefield(NEEDLE, { label: 'a' })
      .battlefield(NEEDLE, { label: 'b' })
      .battlefield(ELVES, { label: 'elves' })
      .at('precombatMain', { active: 1 })
      .build();

  test('an opponent activating an ability makes one Zombie a turn', () => {
    const g = board();
    g.act(1).activate('a', { targets: ['mine'] });
    g.passAll();
    g.act(1).activate('b', { targets: ['mine'] });
    g.passAll();
    g.expect.zone('Zombie', 'battlefield', { seat: 0, count: 1 });
    g.expect.invariants();
  });

  test('a mana ability makes nothing', () => {
    const g = board();
    g.act(1).tapForMana('elves');
    g.passAll();
    g.expect.zone('Zombie', 'battlefield', { seat: 0, count: 0 });
  });
});
