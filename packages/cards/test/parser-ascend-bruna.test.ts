// Ascend and the city's blessing (D-264), the Bruna deck program (issue 5). The lines are the real Oracle text of Arch of Orazca (names replaced by ~) with the nodes the
// grammar produces; the other lines are SYNTHETIC siblings and the near misses the grammar must not read.
import { describe, expect, test } from 'vitest';
import { parseOnly, spellCard } from './convert-grammar-helpers';
import { syntheticCard } from './convert-helpers';
import { dropped, readAll } from './parser-p5-helpers';

const BLESSING_YOU = {
  kind: 'playerHasDesignation',
  player: { kind: 'you' },
  designation: 'citysBlessing',
};

describe('Ascend (CR 702.131b)', () => {
  test('the keyword alone, with and without its reminder text', () => {
    expect(readAll('Ascend', 'artifact').abilities).toEqual([
      { kind: 'keyword', keyword: { kind: 'ascend' } },
    ]);
    expect(
      readAll(
        "Ascend (If you control ten or more permanents, you get the city's blessing for the rest of the game.)",
        'artifact',
      ).abilities,
    ).toEqual([{ kind: 'keyword', keyword: { kind: 'ascend' } }]);
  });

  test('Ascend with a number or a suffix is not the keyword (SYNTHETIC)', () => {
    expect(dropped('Ascend 2', 'artifact').reason).toBeDefined();
    expect(dropped('Ascendant', 'artifact').reason).toBeDefined();
  });
});

describe('Arch of Orazca (Ascend, a mana ability, "Activate only if you have the city’s blessing")', () => {
  test('the whole card reads', () => {
    const parsed = readAll(
      "Ascend (If you control ten or more permanents, you get the city's blessing for the rest of the game.)\n{T}: Add {C}.\n{5}, {T}: Draw a card. Activate only if you have the city's blessing.",
      'land',
    );
    expect(parsed.abilities).toEqual([
      { kind: 'keyword', keyword: { kind: 'ascend' } },
      { kind: 'mana', cost: [{ kind: 'tap' }], production: { kind: 'fixed', mana: ['C'] } },
      {
        kind: 'activated',
        cost: [{ kind: 'mana', symbols: ['5'] }, { kind: 'tap' }],
        effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
        activateOnlyIf: BLESSING_YOU,
      },
    ]);
  });
});

describe('"you have the city’s blessing" as a condition (CR 702.131c)', () => {
  test('an intervening if of a trigger (SYNTHETIC)', () => {
    const parsed = readAll(
      "At the beginning of your end step, if you have the city's blessing, you gain 1 life.",
      'enchantment',
    );
    expect(parsed.abilities).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'endStep', whose: 'you' },
        interveningIf: BLESSING_YOU,
        effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 1 },
      },
    ]);
  });

  test('the negative and the opponent forms (SYNTHETIC)', () => {
    const not = readAll(
      "{T}: You gain 1 life. Activate only if you don't have the city's blessing.",
      'artifact',
    );
    expect(JSON.stringify(not.abilities)).toContain(
      '"activateOnlyIf":{"kind":"not","term":{"kind":"playerHasDesignation","player":{"kind":"you"},"designation":"citysBlessing"}}',
    );
    const theirs = readAll(
      "{T}: You gain 1 life. Activate only if an opponent has the city's blessing.",
      'artifact',
    );
    expect(JSON.stringify(theirs.abilities)).toContain(
      '"playerHasDesignation","player":{"kind":"eachOpponent"},"designation":"citysBlessing"',
    );
  });

  test('wordings that say something else are not read (SYNTHETIC)', () => {
    for (const text of [
      "{T}: You gain 1 life. Activate only if you have city's blessing.",
      "{T}: You gain 1 life. Activate only if each opponent has the city's blessing.",
      "{T}: You gain 1 life. Activate only if you have the city's blessing for the rest of the game.",
    ]) {
      expect(dropped(text, 'artifact').reason, text).toBeDefined();
    }
  });
});

describe('Ascend on an instant or a sorcery (CR 702.131a) is refused, not accepted and ignored', () => {
  for (const type of ['Instant', 'Sorcery'] as const) {
    test(`${type}: the card is unsupported (SYNTHETIC)`, () => {
      const imported = parseOnly(
        spellCard('SYNTHETIC Ascend Spell', 'Ascend\nDraw two cards.', { type }),
      );
      expect(imported.support.status).toBe('unsupported');
      expect(imported.support.reasons.join(' ')).toContain('Ascend');
    });
  }

  test('on a permanent of any type it is still read (SYNTHETIC)', () => {
    for (const typeLine of ['Artifact', 'Enchantment', 'Land', 'Creature — Human']) {
      const imported = parseOnly(
        syntheticCard({
          name: 'SYNTHETIC Ascend Permanent',
          typeLine,
          oracleText: 'Ascend',
          manaCost: typeLine === 'Land' ? '' : '{2}',
          ...(typeLine.startsWith('Creature') ? { power: '1', toughness: '1' } : {}),
        }),
      );
      expect(imported.support.status, typeLine).toBe('supported');
    }
  });
});
