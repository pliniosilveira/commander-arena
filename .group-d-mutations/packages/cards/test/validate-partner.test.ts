/**
 * Partner-ability tests (CR 702.124). All cards are SYNTHETIC; Oracle text is hand-written.
 */
import { describe, expect, test } from 'vitest';
import {
  canPair,
  colorIdentityOf,
  eligibleCommanders,
  isBasicLand,
  legalPartnerPairs,
  validateDeck,
} from '../src/validate/index';
import { basicLand, card, fullMain, legend } from './validate-helpers';

const partnerA = legend('Synthetic Partner A', ['W'], { text: 'Partner (reminder text)' });
const partnerB = legend('Synthetic Partner B', ['U'], { text: 'Flying\nPartner' });

describe('canPair', () => {
  test('plain partner works in both directions', () => {
    expect(canPair(partnerA, partnerB)).toBe(true);
    expect(canPair(partnerB, partnerA)).toBe(true);
  });

  test('a card does not pair with itself', () => {
    expect(canPair(partnerA, partnerA)).toBe(false);
  });

  test('partner with: each names the other', () => {
    const x = legend('Synthetic Left, the First', ['R'], {
      text: 'Partner with Synthetic Right (When this enters, search.)',
    });
    const y = legend('Synthetic Right', ['G'], { text: 'Partner with Synthetic Left, the First' });
    expect(canPair(x, y)).toBe(true);
    expect(canPair(y, x)).toBe(true);
  });

  test('partner with does not pair with a third card, nor with plain partner', () => {
    const x = legend('Synthetic Left', ['R'], { text: 'Partner with Synthetic Right' });
    const y = legend('Synthetic Right', ['G'], { text: 'Partner with Synthetic Left' });
    const third = legend('Synthetic Third', ['G'], { text: 'Partner with Synthetic Other' });
    expect(canPair(x, third)).toBe(false);
    expect(canPair(x, partnerA)).toBe(false);
    expect(canPair(partnerA, x)).toBe(false);
    // one-sided naming is not enough
    const oneSided = legend('Synthetic One Sided', ['G'], { text: 'Partner' });
    expect(canPair(x, oneSided)).toBe(false);
    expect(canPair(x, y)).toBe(true);
  });

  test('partner--text variants pair only with the same text (CR 702.124i)', () => {
    const f1 = legend('Synthetic Friend 1', ['W'], { text: 'Partner—Friends forever (reminder)' });
    const f2 = legend('Synthetic Friend 2', ['U'], { text: 'Partner—Friends forever' });
    const survivor = legend('Synthetic Survivor', ['B'], { text: 'Partner—Survivors' });
    expect(canPair(f1, f2)).toBe(true);
    expect(canPair(f1, survivor)).toBe(false);
    expect(canPair(f1, partnerA)).toBe(false); // CR 702.124f: variants cannot be combined
  });

  test('choose a Background pairs with a legendary Background only (CR 702.124k)', () => {
    const chooser = legend('Synthetic Chooser', ['G'], {
      text: 'Choose a Background (You can have a Background as a second commander.)',
    });
    const background = card('Synthetic Background', {
      typeLine: 'Legendary Enchantment — Background',
      identity: ['R'],
    });
    const plainBackground = card('Synthetic Plain Background', {
      typeLine: 'Enchantment — Background',
    });
    expect(canPair(chooser, background)).toBe(true);
    expect(canPair(background, chooser)).toBe(true);
    expect(canPair(chooser, plainBackground)).toBe(false);
    expect(canPair(chooser, partnerA)).toBe(false);
    expect(canPair(background, partnerA)).toBe(false);
    const background2 = card('Synthetic Background Two', {
      typeLine: 'Legendary Enchantment — Background',
    });
    expect(canPair(background, background2)).toBe(false);
  });

  test("Doctor's companion pairs with a legendary Time Lord Doctor with no other types", () => {
    const companion = legend('Synthetic Companion', ['W'], { text: "Doctor's companion" });
    const doctor = card('Synthetic Doctor', {
      typeLine: 'Legendary Creature — Time Lord Doctor',
      power: '3',
      toughness: '3',
    });
    const mixedDoctor = card('Synthetic Mixed Doctor', {
      typeLine: 'Legendary Creature — Human Time Lord Doctor',
      power: '3',
      toughness: '3',
    });
    expect(canPair(companion, doctor)).toBe(true);
    expect(canPair(doctor, companion)).toBe(true);
    expect(canPair(companion, mixedDoctor)).toBe(false);
    expect(canPair(companion, partnerA)).toBe(false);
  });

  test('keywords back up unambiguous abilities when the text is missing', () => {
    const chooser = legend('Synthetic Keyword Chooser', [], { keywords: ['Choose a Background'] });
    const background = card('Synthetic Kw Background', {
      typeLine: 'Legendary Enchantment — Background',
    });
    expect(canPair(chooser, background)).toBe(true);
  });

  test('a non-legendary card never pairs', () => {
    const nonLegend = card('Synthetic Nonlegend', {
      typeLine: 'Creature — Bear',
      text: 'Partner',
      power: '1',
      toughness: '1',
    });
    expect(canPair(partnerA, nonLegend)).toBe(false);
  });
});

describe('validateDeck with two commanders', () => {
  test('an illegal pair is a partner error', () => {
    const plain = legend('Synthetic No Partner', ['G']);
    const result = validateDeck({ commanders: [partnerA, plain], main: fullMain(2) });
    expect(result.ok).toBe(false);
    expect(result.issues.map((i) => i.code)).toEqual(['partner']);
  });

  test('a lone Background is not an eligible commander', () => {
    const background = card('Synthetic Background', {
      typeLine: 'Legendary Enchantment — Background',
    });
    const result = validateDeck({ commanders: [background], main: fullMain(1) });
    expect(result.issues.map((i) => i.code)).toEqual(['commander']);
  });

  test('a Background beside a chooser is legal, and its identity counts', () => {
    const chooser = legend('Synthetic Chooser', ['G'], { text: 'Choose a Background' });
    const background = card('Synthetic Background', {
      typeLine: 'Legendary Enchantment — Background',
      identity: ['R'],
    });
    const red = card('Synthetic Red Card', { identity: ['R'] });
    const result = validateDeck({
      commanders: [chooser, background],
      main: fullMain(2, [{ card: red, count: 1 }]),
    });
    expect(result.ok).toBe(true);
  });

  test('a non-legendary second commander gets a commander error', () => {
    const bear = card('Synthetic Bear', { typeLine: 'Creature — Bear', text: 'Partner' });
    const result = validateDeck({ commanders: [partnerA, bear], main: fullMain(2) });
    expect(result.issues.map((i) => i.code)).toEqual(['commander']);
  });
});

describe('helpers', () => {
  test('legalPartnerPairs lists unordered pairs', () => {
    const plain = legend('Synthetic No Partner', ['G']);
    const pairs = legalPartnerPairs([partnerA, plain, partnerB]);
    expect(pairs.map(([a, b]) => [a.name, b.name])).toEqual([
      ['Synthetic Partner A', 'Synthetic Partner B'],
    ]);
  });

  test('colorIdentityOf unions in WUBRG order', () => {
    const a = legend('A', ['G', 'W']);
    const b = legend('B', ['U', 'G']);
    expect(colorIdentityOf([a, b])).toEqual(['W', 'U', 'G']);
    expect(colorIdentityOf([])).toEqual([]);
  });

  test('eligibleCommanders filters a list', () => {
    const bear = card('Synthetic Bear', { typeLine: 'Creature — Bear' });
    const vehicle = card('Synthetic Vehicle', {
      typeLine: 'Legendary Artifact — Vehicle',
      power: '4',
      toughness: '4',
    });
    const background = card('Synthetic Background', {
      typeLine: 'Legendary Enchantment — Background',
    });
    expect(eligibleCommanders([bear, partnerA, vehicle, background]).map((c) => c.name)).toEqual([
      'Synthetic Partner A',
      'Synthetic Vehicle',
    ]);
  });

  test('isBasicLand uses the Basic supertype of the front face', () => {
    expect(isBasicLand(basicLand('Synthetic Forest', 'G'))).toBe(true);
    expect(isBasicLand(card('Synthetic Dual', { typeLine: 'Land — Forest Island' }))).toBe(false);
    expect(
      isBasicLand(card('Synthetic Snow Basic', { typeLine: 'Basic Snow Land — Forest' })),
    ).toBe(true);
  });
});
