// The Jeskai free-cast cards (deck support issue 100): Electrodominance and its relatives, read through the whole grammar. The first line of each describe is the
// real Oracle text of the acceptance card of the golden corpus (names replaced by ~); the other lines are SYNTHETIC siblings and near misses. The engine runs what is
// lowered in convert-grammar-engine-jeskai-castfree.test.ts.
import { describe, expect, test } from 'vitest';
import { dropped, readAll } from './parser-p5-helpers';

const X = { kind: 'x' } as const;
const FROM_HAND = (filter: object) => ({
  kind: 'castFree',
  objects: { kind: 'choose', filter: { zone: 'hand', ...filter } },
});

describe('Electrodominance: "You may cast a spell with mana value X or less from your hand without paying its mana cost." (CR 107.3a, 202.3, 608.2g, 118.9)', () => {
  test('the real text: the damage, then the free cast limited by the X of the spell', () => {
    const parsed = readAll(
      '~ deals X damage to any target. You may cast a spell with mana value X or less from your hand without paying its mana cost.',
      'instant',
    );
    expect(parsed.spell).toMatchObject({
      x: true,
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'dealDamage', amount: X },
          FROM_HAND({ notTypes: ['land'], manaValueAtMost: X }),
        ],
      },
    });
  });

  test('another type of spell (SYNTHETIC)', () => {
    const parsed = readAll(
      '~ deals X damage to any target. You may cast a creature spell with mana value X or less from your hand without paying its mana cost.',
      'sorcery',
    );
    expect(parsed.spell?.effect).toMatchObject({
      kind: 'sequence',
      effects: [{ kind: 'dealDamage' }, FROM_HAND({ types: ['creature'], manaValueAtMost: X })],
    });
  });

  test.each([
    // An X nothing announces: a permanent's ability has no X of its own.
    '{T}: You may cast a spell with mana value X or less from your hand without paying its mana cost.',
  ])('not read: %s', (text) => {
    expect(dropped(text, 'artifact').reason).toBeDefined();
  });
});
