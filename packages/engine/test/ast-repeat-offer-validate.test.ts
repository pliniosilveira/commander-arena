// validateCard for a repeated process that ends in an offer to exile cards from your graveyard (Squirreled Away deck, group 4, Insatiable Frugivore; SYNTHETIC cards built here):
// "When ~ enters, create a Food token, then you may exile three cards from your graveyard. If you do, repeat this process." (CR 608.2c, 608.2d).
// Each pass takes a fixed number of cards out of the graveyard, so the repeat ends; the checks refuse the shapes where it would not.
import { describe, expect, test } from 'vitest';
import type { Condition, Effect } from '../src/ast/types';
import { validateCard } from '../src/ast/validate';
import { singleFace } from '../src/cards/fixtures/helpers';

const FOOD: Effect = { kind: 'createToken', token: { kind: 'preset', preset: 'Food' }, count: 1 };
const offer = (objects: Record<string, unknown> = {}): Effect =>
  ({
    kind: 'may',
    effect: {
      kind: 'moveToZone',
      objects: {
        kind: 'choose',
        filter: { zone: 'graveyard', controller: 'you' },
        count: 3,
        ...objects,
      },
      to: 'exile',
    },
  }) as Effect;

const card = (effects: readonly Effect[], condition: Condition = { kind: 'didPrevious' }) =>
  singleFace({
    name: 'SYNTHETIC Repeating Rat',
    manaCost: ['3', 'B'],
    types: ['creature'],
    subtypes: ['Rat'],
    colors: ['B'],
    colorIdentity: ['B'],
    power: 2,
    toughness: 4,
    oracleText: 'test',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
        effect: { kind: 'repeatWhile', effects, condition },
      },
    ],
  });

const issues = (effects: readonly Effect[], condition?: Condition) =>
  validateCard(card(effects, condition)).map((i) => `${i.path}: ${i.message}`);

describe('a repeated offer to exile cards from your graveyard', () => {
  test('a token, then the offer, repeated while it was taken, is valid', () => {
    expect(issues([FOOD, offer()])).toEqual([]);
  });

  test('the offer alone is valid too', () => {
    expect(issues([offer()])).toEqual([]);
  });

  test('the test must be whether the offer was taken', () => {
    expect(
      issues([FOOD, offer()], { kind: 'controlsAtLeast', filter: {}, count: 1 }).length,
    ).toBeGreaterThan(0);
  });

  test('anything but a token, life or cards drawn before the offer is refused (it could put cards into the graveyard)', () => {
    const mill: Effect = { kind: 'mill', player: { kind: 'you' }, count: 3 };
    expect(issues([mill, offer()]).length).toBeGreaterThan(0);
  });

  test('a choice of none up to the count, or of any number, is not a fixed number of cards', () => {
    expect(issues([FOOD, offer({ optional: true })]).length).toBeGreaterThan(0);
    expect(issues([FOOD, offer({ anyNumber: true, count: undefined })]).length).toBeGreaterThan(0);
  });

  test('an offer for no card, or from another zone, is refused', () => {
    expect(issues([FOOD, offer({ count: 0 })]).length).toBeGreaterThan(0);
    expect(
      issues([FOOD, offer({ filter: { zone: 'hand', controller: 'you' } })]).length,
    ).toBeGreaterThan(0);
  });

  test('an unconditional process that draws is still refused', () => {
    const draw: Effect = { kind: 'draw', player: { kind: 'you' }, count: 1 };
    expect(issues([FOOD, draw]).length).toBeGreaterThan(0);
  });
});
