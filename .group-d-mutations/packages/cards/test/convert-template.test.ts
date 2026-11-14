import { describe, expect, test } from 'vitest';
import { analyzeTemplates, formatTemplateReport, importCard, templateOf } from '../src/index';
import { syntheticCard } from './convert-helpers';

describe('templateOf', () => {
  test.each([
    ['When ~ enters, draw a card.', 'When ~ enters, draw a card.'],
    ['Draw two cards.', 'Draw N cards.'],
    ['Draw 3 cards.', 'Draw N cards.'],
    ['~ deals 3 damage to any target.', '~ deals N damage to any target.'],
    [
      '{2}{R}, {T}: ~ deals 1 damage to target creature.',
      '{M}, {T}: ~ deals N damage to target creature.',
    ],
    ['Put a +1/+1 counter on ~.', 'Put a +N/+N counter on ~.'],
    [
      'Target creature gets -2/-2 until end of turn.',
      'Target creature gets -N/-N until end of turn.',
    ],
    ['Ward {X}', 'Ward {X}'],
    ['Pay {U/B} or lose 4 life.', 'Pay {M} or lose N life.'],
  ])('%s', (text, expected) => {
    expect(templateOf(text)).toBe(expected);
  });

  test('two cards with the same shape share one template', () => {
    expect(templateOf('~ deals 2 damage to target creature.')).toBe(
      templateOf('~ deals 5 damage to target creature.'),
    );
  });
});

describe('analyzeTemplates', () => {
  const seer = (name: string, text: string) =>
    importCard(
      syntheticCard({
        name,
        typeLine: 'Creature — Test',
        oracleText: text,
        power: '1',
        toughness: '1',
      }),
    );

  test('groups unparsed abilities by shape, most blocking first, and ignores supported cards', () => {
    const cards = [
      seer('SYNTHETIC A', 'When ~ enters, amass 1.'),
      seer('SYNTHETIC B', 'When ~ enters, amass 2.'),
      seer('SYNTHETIC C', 'Flying'),
      seer('SYNTHETIC D', 'Draw two cards.'),
      seer('SYNTHETIC E', 'Draw three cards.'),
      seer('SYNTHETIC F', 'When ~ enters, amass 3.\nDraw two cards.'),
    ];
    const analysis = analyzeTemplates(cards);
    expect(analysis.unsupportedCards).toBe(5);
    // Both shapes block three cards; ties are ordered by the template text.
    expect(analysis.templates.map((t) => [t.template, t.cards.length])).toEqual([
      ['Draw N cards.', 3],
      ['When ~ enters, amass N.', 3],
    ]);
    expect(analysis.templates[0]?.abilities).toBe(3);
    expect(analysis.templates[1]?.cards).toEqual(['SYNTHETIC A', 'SYNTHETIC B', 'SYNTHETIC F']);
  });

  test('keeps non-parse reasons apart and formats a pasteable report', () => {
    const odd = importCard(
      syntheticCard({
        name: 'SYNTHETIC Odd',
        typeLine: 'Creature — Test',
        power: '*',
        toughness: '1',
      }),
    );
    const analysis = analyzeTemplates([odd, seer('SYNTHETIC A', 'Draw two cards.')]);
    expect(analysis.unsupportedCards).toBe(2);
    expect(analysis.reasons.length).toBeGreaterThan(0);
    const text = formatTemplateReport('Deck', analysis);
    expect(text).toContain('Template report for "Deck": 2 unsupported card(s).');
    expect(text).toContain('Draw N cards.');
    expect(text).toContain('SYNTHETIC Odd');
  });

  test('an empty or fully supported list gives an empty analysis', () => {
    expect(analyzeTemplates([]).templates).toEqual([]);
    expect(analyzeTemplates([seer('SYNTHETIC C', 'Flying')]).unsupportedCards).toBe(0);
  });
});
