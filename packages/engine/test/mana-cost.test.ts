import { describe, expect, test } from 'vitest';
import { manaValue, parseManaCost } from '../src/mana/index';
import { EMPTY_MANA_COST } from '../src/mana/types';

describe('parseManaCost (CR 107.4)', () => {
  test('empty cost equals EMPTY_MANA_COST', () => {
    expect(parseManaCost([])).toEqual(EMPTY_MANA_COST);
  });

  test('generic numbers add up, {0} is zero', () => {
    expect(parseManaCost(['2']).generic).toBe(2);
    expect(parseManaCost(['0']).generic).toBe(0);
    expect(parseManaCost(['10', '3']).generic).toBe(13);
  });

  test('colored and colorless symbols are counted per color', () => {
    const cost = parseManaCost(['W', 'W', 'U', 'B', 'R', 'G', 'C', 'C']);
    expect(cost.colored).toEqual({ W: 2, U: 1, B: 1, R: 1, G: 1, C: 2 });
    expect(cost.generic).toBe(0);
  });

  test('X symbols are counted, snow symbols are counted', () => {
    const cost = parseManaCost(['X', 'X', 'S', 'S', 'S']);
    expect(cost.x).toBe(2);
    expect(cost.snow).toBe(3);
  });

  test('hybrid symbols keep both colors in written order', () => {
    expect(parseManaCost(['W/U', 'R/G']).hybrid).toEqual([
      [{ color: 'W' }, { color: 'U' }],
      [{ color: 'R' }, { color: 'G' }],
    ]);
  });

  test('colorless hybrid {C/W}', () => {
    expect(parseManaCost(['C/W']).hybrid).toEqual([[{ color: 'C' }, { color: 'W' }]]);
  });

  test('monocolored hybrid {2/G}', () => {
    expect(parseManaCost(['2/G']).hybrid).toEqual([[{ generic: 2 }, { color: 'G' }]]);
  });

  test('Phyrexian symbols', () => {
    expect(parseManaCost(['W/P', 'B/P', 'W/P']).phyrexian).toEqual(['W', 'B', 'W']);
  });

  test('a mixed cost fills every field', () => {
    const cost = parseManaCost(['X', '2', 'W', 'W/U', '2/G', 'W/P', 'S', 'C']);
    expect(cost).toEqual({
      generic: 2,
      x: 1,
      colored: { W: 1, U: 0, B: 0, R: 0, G: 0, C: 1 },
      snow: 1,
      hybrid: [
        [{ color: 'W' }, { color: 'U' }],
        [{ generic: 2 }, { color: 'G' }],
      ],
      phyrexian: ['W'],
    });
  });

  test.each([
    '',
    'Q',
    'w',
    '{W}',
    '01',
    '-1',
    '1.5',
    'W/W',
    'W/X',
    'P',
    'P/W',
    'C/P',
    'C/C',
    'W/C',
    '3/W',
    '2/C',
    '2/2',
    'W/U/P',
    'W/',
    '/W',
    'W/U/B',
    'XX',
    'Y',
  ])('throws naming the offending symbol %j', (symbol) => {
    expect(() => parseManaCost(['W', symbol])).toThrow(
      new RegExp(`"${symbol.replace(/[/{}.\\-]/g, '\\$&')}"`),
    );
  });
});

describe('manaValue (CR 202.3)', () => {
  test.each([
    [[], 0],
    [['3', 'U', 'U'], 5], // CR 202.3 example: {3}{U}{U}
    [['0'], 0],
    [['X'], 0], // CR 202.3e: X is 0 off the stack
    [['X', 'X', 'R'], 1],
    [['1', 'W/U', 'W/U'], 3], // CR 202.3f example
    [['2/B', '2/B', '2/B'], 6], // CR 202.3f example
    [['C/W'], 1],
    [['1', 'W/P', 'W/P'], 3], // CR 202.3g example
    [['S', 'S'], 2],
    [['C', 'C', '2'], 4],
    [['W', 'U', 'B', 'R', 'G'], 5],
    [['X', '2', 'W', 'W/U', '2/G', 'W/P', 'S', 'C'], 2 + 1 + 1 + 2 + 1 + 1 + 1],
  ] as const)('%j has mana value %i', (symbols, expected) => {
    expect(manaValue(symbols)).toBe(expected);
  });

  test('throws on unknown symbols like parseManaCost', () => {
    expect(() => manaValue(['1', 'Z'])).toThrow(/"Z"/);
  });
});
