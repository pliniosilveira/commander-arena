import { describe, expect, test } from 'vitest';
import { convertManaCost, importCard, parseTypeLine } from '../src/index';
import { syntheticCard } from './convert-helpers';

describe('type line conversion', () => {
  const table: [string, { supertypes: string[]; types: string[]; subtypes: string[] }][] = [
    ['Creature — Bear', { supertypes: [], types: ['creature'], subtypes: ['Bear'] }],
    [
      'Legendary Creature — Elf Druid',
      { supertypes: ['legendary'], types: ['creature'], subtypes: ['Elf', 'Druid'] },
    ],
    ['Basic Land — Forest', { supertypes: ['basic'], types: ['land'], subtypes: ['Forest'] }],
    [
      'Snow Land — Forest Island',
      { supertypes: ['snow'], types: ['land'], subtypes: ['Forest', 'Island'] },
    ],
    ['Instant', { supertypes: [], types: ['instant'], subtypes: [] }],
    [
      'Legendary Artifact Creature — Golem',
      { supertypes: ['legendary'], types: ['artifact', 'creature'], subtypes: ['Golem'] },
    ],
    ['Artifact — Equipment', { supertypes: [], types: ['artifact'], subtypes: ['Equipment'] }],
    [
      'Legendary Planeswalker — Jace',
      { supertypes: ['legendary'], types: ['planeswalker'], subtypes: ['Jace'] },
    ],
    ['Kindred Sorcery — Elf', { supertypes: [], types: ['kindred', 'sorcery'], subtypes: ['Elf'] }],
    [
      'Tribal Instant — Goblin',
      { supertypes: [], types: ['kindred', 'instant'], subtypes: ['Goblin'] },
    ],
    [
      'Creature — Time Lord Doctor',
      { supertypes: [], types: ['creature'], subtypes: ['Time Lord', 'Doctor'] },
    ],
    ['Battle — Siege', { supertypes: [], types: ['battle'], subtypes: ['Siege'] }],
  ];
  test.each(table)('%s', (line, expected) => {
    const parsed = parseTypeLine(line);
    expect(parsed.supertypes).toEqual(expected.supertypes);
    expect(parsed.types).toEqual(expected.types);
    expect(parsed.subtypes).toEqual(expected.subtypes);
    expect(parsed.unknown).toEqual([]);
  });

  test('unknown words are reported, not guessed', () => {
    const parsed = parseTypeLine('Conspiracy');
    expect(parsed.types).toEqual([]);
    expect(parsed.unknown).toEqual(['Conspiracy']);
    expect(parseTypeLine('Ongoing Scheme').unknown).toEqual(['Ongoing', 'Scheme']);
  });

  test('an unknown card type makes the card unsupported with a reason', () => {
    const card = importCard(syntheticCard({ name: 'SYNTHETIC Plot', typeLine: 'Conspiracy' }));
    expect(card.support.status).toBe('unsupported');
    expect(card.support.reasons).toContain('unsupported type or supertype "Conspiracy"');
  });

  test('a kindred card is unsupported because the engine does not run the type yet', () => {
    const card = importCard(
      syntheticCard({ name: 'SYNTHETIC Kin', typeLine: 'Kindred Sorcery — Elf', manaCost: '{G}' }),
    );
    expect(card.support.status).toBe('unsupported');
    expect(card.definition.faces[0]?.types).toEqual(['kindred', 'sorcery']);
  });
});

describe('mana cost conversion', () => {
  const table: [string, string[] | null][] = [
    ['', null],
    ['{G}', ['G']],
    ['{2}{W}{U/B}', ['2', 'W', 'U/B']],
    ['{X}{X}{R}', ['X', 'X', 'R']],
    ['{0}', ['0']],
    ['{10}', ['10']],
    ['{2/W}{2/W}', ['2/W', '2/W']],
    ['{W/P}', ['W/P']],
    ['{C}', ['C']],
    ['{S}{S}', ['S', 'S']],
    ['{C/W}', ['C/W']],
    ['{R/G}{G/U}', ['R/G', 'G/U']],
  ];
  test.each(table)('%j', (cost, symbols) => {
    expect(convertManaCost(cost)).toEqual({ symbols, problems: [] });
  });

  test('symbols the engine does not know are problems', () => {
    expect(convertManaCost('{Q}').problems).toEqual(['unknown mana symbol {Q}']);
    expect(convertManaCost('{½}').problems).toEqual(['unknown mana symbol {½}']);
    expect(convertManaCost('{U/W}').problems).toEqual(['unknown mana symbol {U/W}']);
    expect(convertManaCost('2W').problems.length).toBeGreaterThan(0);
  });

  test('hybrid Phyrexian symbols are valid symbols the cost parser cannot represent yet', () => {
    const converted = convertManaCost('{1}{G/W/P}');
    expect(converted.symbols).toEqual(['1', 'G/W/P']);
    expect(converted.problems).toHaveLength(1);
    const card = importCard(
      syntheticCard({
        name: 'SYNTHETIC Phyrexian',
        manaCost: '{1}{G/W/P}',
        power: '1',
        toughness: '1',
      }),
    );
    expect(card.support.status).toBe('unsupported');
  });
});

describe('power, toughness, loyalty and defense', () => {
  function face(overrides: Parameters<typeof syntheticCard>[0]) {
    return importCard(syntheticCard({ name: 'SYNTHETIC PT', ...overrides })).definition.faces[0];
  }

  test('integers become numbers, negatives included', () => {
    const f = face({ power: '3', toughness: '-1' });
    expect([f?.power, f?.toughness]).toEqual([3, -1]);
  });

  test('zero is a number, not null', () => {
    const f = face({ power: '0', toughness: '8' });
    expect([f?.power, f?.toughness]).toEqual([0, 8]);
  });

  test('* stays * and makes the card unsupported', () => {
    const card = importCard(syntheticCard({ name: 'SYNTHETIC Star', power: '*', toughness: '3' }));
    expect(card.definition.faces[0]?.power).toBe('*');
    expect(card.support.status).toBe('unsupported');
    expect(card.support.reasons.join('\n')).toContain('characteristic-defining');
  });

  test('1+* is reported and unsupported', () => {
    const card = importCard(
      syntheticCard({ name: 'SYNTHETIC Star', power: '1+*', toughness: '1+*' }),
    );
    expect(card.support.status).toBe('unsupported');
    expect(card.support.reasons).toContain('unsupported power value "1+*"');
  });

  test('loyalty and defense are non-negative integers; X loyalty is reported', () => {
    const walker = face({ typeLine: 'Legendary Planeswalker — Test', loyalty: '4' });
    expect(walker?.loyalty).toBe(4);
    const battle = face({ typeLine: 'Battle — Siege', defense: '5' });
    expect(battle?.defense).toBe(5);
    const odd = importCard(
      syntheticCard({ name: 'SYNTHETIC X', typeLine: 'Planeswalker — Test', loyalty: 'X' }),
    );
    expect(odd.support.reasons).toContain('unsupported loyalty value "X"');
    expect(odd.support.status).toBe('unsupported');
  });

  test('a creature without power is unsupported through engine validation', () => {
    const card = importCard(syntheticCard({ name: 'SYNTHETIC Broken' }));
    expect(card.support.status).toBe('unsupported');
    expect(card.support.reasons).toContain('faces[0].power: a creature needs power');
  });
});
