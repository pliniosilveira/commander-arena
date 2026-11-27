// The Miracle Worker deck (issue 109), group B: REAL cards of the golden corpus read through the grammar only and played in an engine scenario: the once-a-turn cast permission
// (`castOnceEachTurn`, CR 118.9, 601.2b), "You may play lands and cast spells from the top of your library" (CR 305.1, 601.3), "the sacrificed enchantment's mana value" (CR 202.3,
// 113.7a) and "excess damage dealt this way" (CR 120.10).
import { readFileSync } from 'node:fs';
import { validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, type GoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const cards: readonly GoldenCard[] = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);
const real = (name: string) => {
  const golden = cards.find((c) => c.name === name);
  if (golden === undefined) throw new Error(`${name} is not in the golden corpus`);
  return importCard(fromGoldenCard(golden), undefined, NO_OVERRIDES);
};

const DEMON = real("Demon of Fate's Design");
const VENTS = real('Cramped Vents // Access Maze');
const MULTIVERSE = real('One with the Multiverse');

describe('the cards read', () => {
  test.each([DEMON, VENTS, MULTIVERSE])(
    '$definition.name: supported, validateCard is clean',
    (card) => {
      expect(card.support.status).toBe('supported');
      expect(card.support.unparsed).toEqual([]);
      expect(validateCard(card.definition)).toEqual([]);
    },
  );

  test('Demon: an enchantment spell for life; the sacrificed enchantment’s mana value', () => {
    const abilities = DEMON.definition.faces[0]?.abilities ?? [];
    expect(abilities).toContainEqual({
      kind: 'static',
      static: {
        kind: 'castOnceEachTurn',
        spells: { types: ['enchantment'] },
        alternative: 'lifeForMana',
      },
    });
    expect(JSON.stringify(abilities)).toContain('"manaValueOf"');
  });

  test('Access Maze: any spell of the hand for life; Cramped Vents gains the excess', () => {
    expect(VENTS.definition.faces[1]?.abilities).toContainEqual({
      kind: 'static',
      static: { kind: 'castOnceEachTurn', spells: {}, from: ['hand'], alternative: 'lifeForMana' },
    });
    expect(JSON.stringify(VENTS.definition.faces[0]?.abilities)).toContain('excessDamageDealt');
  });

  test('One with the Multiverse: land and spell play from the top, and the free cast', () => {
    const abilities = MULTIVERSE.definition.faces[0]?.abilities ?? [];
    const kinds = abilities.flatMap((a) => (a.kind === 'static' ? [a.static.kind] : []));
    expect(kinds).toEqual([
      'lookAtTopOfLibrary',
      'playLandsFromTopOfLibrary',
      'castFromTopOfLibrary',
      'castOnceEachTurn',
    ]);
  });
});

describe('the engine runs what the grammar produced', () => {
  test('One with the Multiverse: the top card of the library is cast without paying, once', () => {
    const g = scenario()
      .seat(0)
      .define(MULTIVERSE.definition)
      .battlefield('One with the Multiverse')
      .library('Lightning Bolt', 'Lightning Bolt', 'Island', 'Island')
      .seat(1)
      .library('Island', 'Island')
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    const bolt = { name: 'Lightning Bolt', zone: 'library', seat: 0, nth: 0 } as const;
    g.expect.legal(0, { cast: bolt, alternative: 'free' });
    g.act(0).cast(bolt, { alternative: 'free', targets: [{ player: 1 }] });
    g.passAll();
    g.expect.life(1, 37);
    g.expect.illegal(0, { cast: { ...bolt }, alternative: 'free' });
  });
});
