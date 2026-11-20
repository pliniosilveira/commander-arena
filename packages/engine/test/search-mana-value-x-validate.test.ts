// What validateCard says about a search for "a creature card with mana value X or less" (Finale of Devastation, CR 107.3a, 202.3, 701.23): the X is the one announced for the spell, so
// a card with no X refuses it. Cards are SYNTHETIC probes built here.
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import { type CardDefinition, validateCard } from '../src/index';

const probe = (withX: boolean): CardDefinition =>
  singleFace({
    name: 'SYNTHETIC Search X Probe',
    manaCost: withX ? ['X', 'G'] : ['G'],
    types: ['sorcery'],
    colors: ['G'],
    colorIdentity: ['G'],
    oracleText: 'SYNTHETIC probe',
    spell: {
      ...(withX ? { x: true as const } : {}),
      effect: {
        kind: 'search',
        player: { kind: 'you' },
        filter: { types: ['creature'], manaValueAtMost: { kind: 'x' } },
        max: 1,
        zones: ['library', 'graveyard'],
        destinations: [{ zone: 'battlefield', count: 1 }],
        reveal: false,
        shuffle: false,
      },
    },
  });

describe('a search for a card with mana value X or less', () => {
  test('is valid in a spell with an X', () => {
    expect(validateCard(probe(true))).toEqual([]);
  });

  test('is refused where nothing has an X', () => {
    const found = validateCard(probe(false)).map((i) => `${i.path}: ${i.message}`);
    expect(found.some((m) => m.includes('nothing in this ability or spell has an X'))).toBe(true);
  });
});
