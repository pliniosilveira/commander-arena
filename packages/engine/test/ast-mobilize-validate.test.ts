// Mobilize (issue 101, CR 702.181a): what `validateCard` allows of the keyword node, printed and granted.
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import { type Ability, GRANTABLE_KEYWORDS, validateCard } from '../src/index';

const creature = (abilities: readonly Ability[]) =>
  singleFace({
    name: 'SYNTHETIC Test Subject',
    manaCost: ['2'],
    types: ['creature'],
    colors: [],
    colorIdentity: [],
    power: 2,
    toughness: 2,
    oracleText: 'Test.',
    abilities,
  });

const messages = (card: Parameters<typeof validateCard>[0]) =>
  validateCard(card)
    .map((i) => i.message)
    .join(' | ');

const printed = (count: unknown): Ability => ({
  kind: 'keyword',
  keyword: { kind: 'mobilize', count } as never,
});

const granted = (count: unknown): Ability => ({
  kind: 'static',
  static: {
    kind: 'grantKeyword',
    subject: { kind: 'filter', filter: { types: ['creature'] } },
    keyword: { kind: 'mobilize', count } as never,
  },
});

describe('Mobilize N (CR 702.181a)', () => {
  test('a printed mobilize takes a positive whole number or its power', () => {
    expect(validateCard(creature([printed(2)]))).toEqual([]);
    expect(validateCard(creature([printed('power')]))).toEqual([]);
    for (const count of [0, -1, 1.5, 'x']) {
      expect(messages(creature([printed(count)])), String(count)).toContain(
        'mobilize needs a positive integer or its power',
      );
    }
  });

  test('a granted mobilize is checked the same way', () => {
    expect(GRANTABLE_KEYWORDS).toContain('mobilize');
    expect(validateCard(creature([granted(3)]))).toEqual([]);
    expect(validateCard(creature([granted('power')]))).toEqual([]);
    expect(messages(creature([granted(0)]))).toContain(
      'mobilize needs a positive integer or its power',
    );
  });
});

describe('Fabricate N (CR 702.123a)', () => {
  const fabricate = (count: unknown): Ability => ({
    kind: 'keyword',
    keyword: { kind: 'fabricate', count } as never,
  });

  test('a printed fabricate takes a positive whole number', () => {
    expect(validateCard(creature([fabricate(2)]))).toEqual([]);
    for (const count of [0, -1, 1.5, 'power']) {
      expect(messages(creature([fabricate(count)])), String(count)).toContain(
        'fabricate needs a positive integer',
      );
    }
  });

  test('it cannot be granted: only keywords without parameters, afflict, mobilize and the like can', () => {
    expect(GRANTABLE_KEYWORDS).not.toContain('fabricate');
  });
});
