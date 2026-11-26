// Most Wanted deck, group 2: Rain of Riches, "The first spell you cast each turn that mana from a Treasure was spent to cast has cascade." (golden.jsonl, real Oracle text, issue 120),
// read by the grammar with no override and run by the engine. Pins (numbers looked up with `pnpm rule` in this session): CR 702.85a (Cascade triggers when its spell is cast), CR 601.2h
// (the mana spent to cast a spell is paid as the last step before it is cast), CR 601.2i (the spell becomes cast), CR 106.1 (mana comes from a source), CR 613.1f (a continuous effect
// gives an ability), CR 604.2 (a static ability).
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

const FILLER = Array.from({ length: 8 }, () => 'Island');
const RAIN = real('Rain of Riches');
const MAKER = parsed('SYNTHETIC Treasure Maker', 'Sorcery', 'Create two Treasure tokens.', {
  manaCost: '{R}',
});
const MAKER_TWO = parsed(
  'SYNTHETIC Second Treasure Maker',
  'Sorcery',
  'Create two Treasure tokens.',
  { manaCost: '{R}' },
);
const SPELL = parsed('SYNTHETIC Two Drop', 'Creature — Human', '', {
  manaCost: '{2}',
  power: '2',
  toughness: '2',
});
const OTHER = parsed('SYNTHETIC Other Two Drop', 'Creature — Human', '', {
  manaCost: '{2}',
  power: '2',
  toughness: '2',
});
const ELVES = 'Llanowar Elves'; // {G}: costs less than the two drops, so cascade finds it

describe('Rain of Riches: the first spell paid with Treasure mana has cascade (CR 702.85a, 601.2h)', () => {
  test('is valid; the line is a grant of cascade to the first such spell', () => {
    expect(validateCard(RAIN)).toEqual([]);
    expect(RAIN.faces[0]?.abilities[1]).toMatchObject({
      kind: 'static',
      static: {
        kind: 'grantKeywordToSpells',
        what: {
          controller: 'you',
          manaSpentFromSubtype: 'Treasure',
          firstManaSpentFromSubtypeThisTurn: true,
        },
        keyword: { kind: 'cascade' },
      },
    });
  });

  const start = (opts: { rain?: boolean; lands?: number } = {}) => {
    const { rain = true, lands = 0 } = opts;
    let b = scenario()
      .define(RAIN)
      .define(MAKER)
      .define(MAKER_TWO)
      .define(SPELL)
      .define(OTHER)
      .seat(0)
      .hand(MAKER.name, MAKER_TWO.name, SPELL.name, OTHER.name)
      .battlefield(...(rain ? [RAIN.name] : []), 'Mountain', 'Mountain');
    if (lands > 0) b = b.battlefield('Plains', { count: lands });
    return b
      .library(ELVES, ...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
  };

  /** Two Treasures from the maker, paid with a Mountain (no Treasure mana is spent on it). */
  const withTreasures = (g: ScenarioGame) => {
    g.act(0).cast(MAKER.name, { pay: true });
    g.passAll();
  };

  const cascades = (g: ScenarioGame) =>
    g.state.stack.some((id) => g.state.objects[id]?.stack?.kind === 'ability');

  test('a spell paid with Treasure mana cascades: the trigger goes above it on the stack', () => {
    const g = start();
    withTreasures(g);
    g.act(0).cast(SPELL.name, { pay: true });
    expect(cascades(g)).toBe(true);
    g.passAll();
    expect(g.state.pending).toMatchObject({ kind: 'confirmOptional', purpose: 'cascade' });
    g.expect.invariants();
  });

  test('the spell that made the Treasures was paid with a Mountain: no cascade', () => {
    const g = start();
    g.act(0).cast(MAKER.name, { pay: true });
    expect(cascades(g)).toBe(false);
  });

  test('without the enchantment it does not cascade', () => {
    const g = start({ rain: false });
    withTreasures(g);
    g.act(0).cast(SPELL.name, { pay: true });
    expect(cascades(g)).toBe(false);
  });

  test('a spell paid with lands only does not cascade, even with Treasures in play', () => {
    const g = start({ lands: 2 });
    g.act(0).cast(SPELL.name, { pay: true });
    expect(cascades(g)).toBe(false);
  });

  test('only the first such spell each turn: the second one paid with Treasure mana does not (CR 601.2i)', () => {
    const g = start();
    withTreasures(g);
    g.act(0).cast(SPELL.name, { pay: true });
    expect(cascades(g)).toBe(true);
    g.passAll();
    g.act(0).accept();
    g.passAll();
    g.act(0).cast(MAKER_TWO.name, { pay: true });
    g.passAll();
    g.act(0).cast(OTHER.name, { pay: true });
    expect(cascades(g)).toBe(false);
  });

  test("only the spells its controller casts: an opponent's spell paid with Treasure mana does not cascade (CR 613.1f)", () => {
    const g = scenario({ seats: 3 })
      .define(RAIN)
      .define(MAKER)
      .define(SPELL)
      .seat(0)
      .battlefield(RAIN.name)
      .library(...FILLER)
      .seat(1)
      .hand(MAKER.name, SPELL.name)
      .battlefield('Mountain')
      .library(ELVES, ...FILLER)
      .seat(2)
      .library(...FILLER)
      .at('precombatMain', { active: 1, turn: 3 })
      .build();
    g.act(1).cast(MAKER.name, { pay: true });
    g.passAll();
    g.act(1).cast(SPELL.name, { pay: true });
    expect(cascades(g)).toBe(false);
  });
});
