// What `validateCard` allows of the `tapPermanents` alternative cost and of a keyword in the subject of a static ability (D-149).
import { describe, expect, test } from 'vitest';
import type { Ability, AlternativeCost, ObjectFilter } from '../src/ast/types';
import { kw, singleFace } from '../src/cards/fixtures/helpers';
import { validateCard } from '../src/index';

const FLYER: ObjectFilter = { types: ['creature'], keywords: ['flying'] };
const tapAlt = (over: Partial<Extract<AlternativeCost, { kind: 'tapPermanents' }>> = {}) =>
  ({
    kind: 'tapPermanents',
    cost: [{ kind: 'mana', symbols: ['W'] }],
    filter: FLYER,
    count: 4,
    ...over,
  }) as AlternativeCost;

const card = (
  alternative: AlternativeCost,
  over: { types?: readonly ['land'] | readonly ['creature']; abilities?: readonly Ability[] } = {},
) =>
  singleFace({
    name: 'SYNTHETIC Validation Angel',
    manaCost: ['4', 'W'],
    types: over.types ?? ['creature'],
    colors: ['W'],
    colorIdentity: ['W'],
    power: 3,
    toughness: 3,
    oracleText: '',
    alternativeCosts: [alternative],
    ...(over.abilities === undefined ? {} : { abilities: over.abilities }),
  });

const messages = (c: ReturnType<typeof card>) => validateCard(c).map((i) => i.message);

describe('the tapPermanents alternative cost', () => {
  test('a mana cost, a count and a filter of untapped permanents you control is valid', () => {
    expect(messages(card(tapAlt()))).toEqual([]);
  });

  test.each([0, -1, 1.5])('a count of %s is refused', (count) => {
    expect(messages(card(tapAlt({ count }))).join('|')).toContain('positive integer');
  });

  test('a filter that names the opponent, tapped permanents or another zone is refused', () => {
    expect(
      messages(card(tapAlt({ filter: { ...FLYER, controller: 'opponent' } }))).join('|'),
    ).toContain('only permanents you control');
    expect(messages(card(tapAlt({ filter: { ...FLYER, tapped: true } }))).join('|')).toContain(
      'untapped',
    );
    expect(messages(card(tapAlt({ filter: { ...FLYER, zone: 'graveyard' } }))).join('|')).toContain(
      'battlefield',
    );
  });

  test('a cost that is not mana is refused', () => {
    expect(messages(card(tapAlt({ cost: [{ kind: 'payLife', amount: 2 }] }))).join('|')).toContain(
      'mana only',
    );
  });

  test('another kind with a filter or a count is refused', () => {
    const bad = {
      kind: 'dash',
      cost: [{ kind: 'mana', symbols: ['R'] }],
      count: 2,
    } as unknown as AlternativeCost;
    expect(messages(card(bad)).join('|')).toContain('only tapPermanents taps permanents');
  });

  test('on a land it is refused', () => {
    expect(messages(card(tapAlt(), { types: ['land'] })).join('|')).toContain('not on a land');
  });

  test('with convoke it is refused', () => {
    const abilities: Ability[] = [{ kind: 'keyword', keyword: { kind: 'convoke' } }];
    expect(messages(card(tapAlt(), { abilities })).join('|')).toContain('convoke');
  });

  test('two of it on a face are refused', () => {
    const c = card(tapAlt());
    const face = c.faces[0];
    if (face === undefined) throw new Error('no face');
    const twice = { ...c, faces: [{ ...face, alternativeCosts: [tapAlt(), tapAlt()] }] };
    expect(messages(twice).join('|')).toContain('more than one alternative cost');
  });
});

describe('a keyword in the subject of a static ability', () => {
  const stat = (static_: Extract<Ability, { kind: 'static' }>['static']) =>
    singleFace({
      name: 'SYNTHETIC Subject Angel',
      manaCost: ['W'],
      types: ['creature'],
      colors: ['W'],
      colorIdentity: ['W'],
      power: 1,
      toughness: 1,
      oracleText: '',
      abilities: [kw('flying'), { kind: 'static', static: static_ }],
    });

  test('a keyword grant may name a keyword (with or without)', () => {
    expect(
      validateCard(
        stat({
          kind: 'grantKeyword',
          subject: { kind: 'filter', filter: FLYER, other: true },
          keyword: { kind: 'indestructible' },
        }),
      ),
    ).toEqual([]);
    expect(
      validateCard(
        stat({
          kind: 'grantKeyword',
          subject: { kind: 'filter', filter: { types: ['creature'], notKeywords: ['flying'] } },
          keyword: { kind: 'flying' },
        }),
      ),
    ).toEqual([]);
  });

  test('any other static ability may not', () => {
    const issues = validateCard(
      stat({
        kind: 'modifyPt',
        subject: { kind: 'filter', filter: FLYER },
        power: 1,
        toughness: 1,
      }),
    );
    expect(issues.map((i) => i.message).join('|')).toContain(
      'only a static ability that grants a keyword',
    );
    const restricted = validateCard(
      stat({
        kind: 'restriction',
        subject: { kind: 'filter', filter: FLYER },
        restriction: 'cantAttack',
      }),
    );
    expect(restricted.map((i) => i.message).join('|')).toContain('grants a keyword');
  });
});
