// The shapes group 3 of the Counter Intelligence deck adds are checked by `validateCard`: `entersAsCopy.addTypes` (CR 707.9b, 205.1b), `asEntersChoose` of `cardType` among listed
// `options` and the filter quality `chosenCardType` (CR 205.2a, 607.2d), `chooseObjects.anyNumber` and `fromMoved` (CR 608.2c, 701.34a), and a delayed sacrifice of the targets of the
// ability (CR 603.7c). The cards are SYNTHETIC shapes built from a fixture, not real cards.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';

const base = syntheticCard('SYNTHETIC Cursed Looking Glass');
const face = base.faces[0];
if (face === undefined) throw new Error('no face');
const withAbilities = (abilities: unknown[]) =>
  ({ ...base, faces: [{ ...face, abilities }] }) as never;

const entersAsCopy = (extra: Record<string, unknown>) => ({
  kind: 'replacement',
  replacement: {
    kind: 'entersAsCopy',
    what: { types: ['creature'] },
    duration: 'permanent',
    ...extra,
  },
});
const asEntersChoose = (extra: Record<string, unknown>) => ({
  kind: 'replacement',
  replacement: { kind: 'asEntersChoose', what: 'cardType', ...extra },
});
const reduction = (spells: Record<string, unknown>) => ({
  kind: 'static',
  static: { kind: 'costReduction', spells, amount: 1 },
});
const onEnters = (effect: unknown) => ({
  kind: 'triggered',
  trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
  effect,
});
const proliferateThen = (effect: Record<string, unknown>) =>
  onEnters({
    kind: 'sequence',
    effects: [{ kind: 'proliferate' }, { kind: 'chooseObjects', ...effect }],
  });

describe('entersAsCopy.addTypes (CR 707.9b, 205.1b)', () => {
  test('a list of card types is valid', () => {
    expect(validateCard(withAbilities([entersAsCopy({ addTypes: ['artifact'] })]))).toEqual([]);
  });
  test('an empty list, an unknown type and a non-list are refused', () => {
    for (const bad of [[], ['gadget'], 'artifact']) {
      expect(
        validateCard(withAbilities([entersAsCopy({ addTypes: bad })])).length,
        JSON.stringify(bad),
      ).toBeGreaterThan(0);
    }
  });
});

describe('asEntersChoose of cardType among listed options (CR 205.2a)', () => {
  const key = (options: unknown) => [
    asEntersChoose(options === undefined ? {} : { options }),
    reduction({ controller: 'you', chosenCardType: true }),
  ];
  test('some different card types are valid, and so is a choice among every card type', () => {
    expect(validateCard(withAbilities(key(['artifact', 'creature', 'instant'])))).toEqual([]);
    expect(validateCard(withAbilities(key(undefined)))).toEqual([]);
  });
  test('one type, a repeat, a word that is no card type and a non-list are refused', () => {
    for (const bad of [
      ['artifact'],
      ['artifact', 'artifact'],
      ['artifact', 'goblin'],
      'artifact',
    ]) {
      expect(validateCard(withAbilities(key(bad))).length, JSON.stringify(bad)).toBeGreaterThan(0);
    }
  });
  test('only a choice among options or card types lists options', () => {
    expect(
      validateCard(
        withAbilities([
          {
            kind: 'replacement',
            replacement: {
              kind: 'asEntersChoose',
              what: 'color',
              options: ['artifact', 'creature'],
            },
          },
        ]),
      ).length,
    ).toBeGreaterThan(0);
  });
});

describe('the chosenCardType quality of a filter (CR 607.2d)', () => {
  test('it reads a card type the card chooses as it enters', () => {
    expect(
      validateCard(
        withAbilities([asEntersChoose({}), reduction({ controller: 'you', chosenCardType: true })]),
      ),
    ).toEqual([]);
  });
  test('without that choice it is refused, and it is a flag', () => {
    expect(
      validateCard(withAbilities([reduction({ controller: 'you', chosenCardType: true })])).length,
    ).toBeGreaterThan(0);
    expect(
      validateCard(
        withAbilities([
          asEntersChoose({}),
          reduction({ controller: 'you', chosenCardType: false }),
        ]),
      ).length,
    ).toBeGreaterThan(0);
  });
});

describe('chooseObjects.anyNumber and fromMoved (Ripples of Potential, CR 608.2c, 701.34a)', () => {
  const choose = { id: 'x', filter: { controller: 'you' }, count: 1 };
  test('any number of the permanents a proliferate gave counters to is valid', () => {
    expect(
      validateCard(
        withAbilities([proliferateThen({ ...choose, anyNumber: true, fromMoved: true })]),
      ),
    ).toEqual([]);
  });
  test('fromMoved needs an effect before it that produced objects', () => {
    expect(
      validateCard(withAbilities([onEnters({ kind: 'chooseObjects', ...choose, fromMoved: true })]))
        .length,
    ).toBeGreaterThan(0);
  });
  test('anyNumber and fromMoved are flags, and any number is not "exactly"', () => {
    for (const bad of [
      { anyNumber: false },
      { fromMoved: false },
      { anyNumber: true, exactly: true },
    ]) {
      expect(
        validateCard(withAbilities([proliferateThen({ ...choose, ...bad })])).length,
        JSON.stringify(bad),
      ).toBeGreaterThan(0);
    }
  });
});

describe('a delayed sacrifice of the targets of the ability (CR 603.7c)', () => {
  const target = (extra: Record<string, unknown> = {}) => ({
    kind: 'triggered',
    trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
    targets: [
      {
        id: 't0',
        what: { kind: 'object', filter: { types: ['artifact'], controller: 'you' } },
        anyNumber: true,
      },
    ],
    effect: {
      kind: 'delayedTrigger',
      at: { step: 'endStep', whose: 'each' },
      effect: { kind: 'sacrifice', objects: { kind: 'target', id: 't0' } },
    },
    ...extra,
  });
  test('the slot the ability declares is valid', () => {
    expect(validateCard(withAbilities([target()]))).toEqual([]);
  });
  test('a target no slot declares is refused', () => {
    expect(validateCard(withAbilities([target({ targets: [] })])).length).toBeGreaterThan(0);
  });
  test('a sacrifice of any other kind of object is still refused', () => {
    expect(
      validateCard(
        withAbilities([
          onEnters({
            kind: 'delayedTrigger',
            at: { step: 'endStep', whose: 'each' },
            effect: { kind: 'sacrifice', objects: { kind: 'this' } },
          }),
        ]),
      ).length,
    ).toBeGreaterThan(0);
  });
});
