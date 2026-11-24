import type { ObjectView } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { CARD_TOP_ASPECT, cardTopHeight, cardTopOf } from '../src/ui/board/card-top';

function obj(over: Partial<ObjectView> = {}): ObjectView {
  return {
    id: 'o1',
    owner: 0,
    controller: 0,
    zone: 'battlefield',
    name: 'Bears',
    manaCost: ['1', 'G'],
    supertypes: [],
    types: ['creature'],
    subtypes: ['Bear'],
    colors: ['G'],
    power: 2,
    toughness: 2,
    oracleText: '',
    tapped: false,
    damage: 0,
    counters: {},
    isCommander: false,
    summoningSick: false,
    isToken: false,
    keywords: [],
    protector: null,
    support: 'supported',
    targets: [],
    ...over,
  };
}

describe('the top of the printed card on a tile', () => {
  test('a tile is wider than tall, and keeps that shape at any width', () => {
    expect(CARD_TOP_ASPECT).toBeGreaterThan(1.05);
    expect(CARD_TOP_ASPECT).toBeLessThan(1.2);
    expect(cardTopHeight(150)).toBe(136);
    expect(cardTopHeight(135)).toBe(123);
  });

  test('a regular card shows its whole top; a planeswalker is covered under its higher type line', () => {
    expect(cardTopOf(obj())).toEqual({ cover: 1 });
    expect(cardTopOf(obj({ types: ['land'], subtypes: [] }))).toEqual({ cover: 1 });
    expect(cardTopOf(obj({ layout: 'transform', face: 1 }))).toEqual({ cover: 1 });
    const walker = cardTopOf(obj({ types: ['planeswalker'], subtypes: ['Ral'] }));
    expect(walker?.cover).toBeGreaterThan(0.8);
    expect(walker?.cover).toBeLessThan(1);
  });

  test.each([
    ['a face-down permanent', { faceDown: true, faceDownBy: 'manifest' }],
    ['a split card', { layout: 'split' }],
    ['a Saga', { layout: 'saga', types: ['enchantment'], subtypes: ['Saga'] }],
    ['a Class', { layout: 'class', types: ['enchantment'], subtypes: ['Class'] }],
    ['a Case', { types: ['enchantment'], subtypes: ['Case'] }],
    ['a battle', { types: ['battle'], subtypes: ['Siege'] }],
  ] as [string, Partial<ObjectView>][])('%s keeps the drawn frame', (_, over) => {
    expect(cardTopOf(obj(over))).toBeNull();
  });

  test('a melded permanent shows the top of its combined face, cut at its own type line', () => {
    const meld = { components: [], manaValue: 13 };
    const melded = cardTopOf(obj({ meld }));
    expect(melded?.cover).toBeGreaterThan(0.95);
    expect(melded?.cover).toBeLessThan(1);
    const urza = cardTopOf(obj({ meld, types: ['planeswalker'] }));
    const walker = cardTopOf(obj({ types: ['planeswalker'] }));
    expect(urza?.cover).toBeGreaterThan(walker?.cover ?? 1);
    expect(urza?.cover).toBeLessThan(melded?.cover ?? 0);
  });

  test('a token is cut where a card is', () => {
    expect(cardTopOf(obj({ isToken: true }))).toEqual({ cover: 1 });
  });
});
