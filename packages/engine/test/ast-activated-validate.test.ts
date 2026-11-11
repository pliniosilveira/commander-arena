// Validation of activated abilities, Cycling and the new costs (SPEC 17.2 A7, D-007): what is
// malformed (validateCardStructure) and what is well-formed but not executable (validateCard).
// Pins CR 602.1 (cost and effect), CR 113.6b (zones an ability functions in), CR 702.29a (Cycling),
// CR 701.21a (a player sacrifices only permanents they control), CR 605.1a (mana abilities).
import { describe, expect, test } from 'vitest';
import type { Ability, Keyword } from '../src/ast/types';
import { validateAbility, validateCard, validateCardStructure } from '../src/ast/validate';
import { singleFace } from '../src/cards/fixtures/helpers';
import { syntheticCard } from '../src/index';

const draw = { kind: 'draw', player: { kind: 'you' }, count: 1 } as const;
const card = (abilities: Ability[]) =>
  singleFace({
    name: 'SYNTHETIC Test Subject',
    manaCost: ['1'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText: '',
    abilities,
  });
const activated = (
  cost: Extract<Ability, { kind: 'activated' }>['cost'],
  extra: Partial<Extract<Ability, { kind: 'activated' }>> = {},
): Ability => ({ kind: 'activated', cost, effect: draw, ...extra });
const structure = (a: Ability) => validateCardStructure(card([a])).map((i) => i.message);
const gate = (a: Ability) => validateCard(card([a])).map((i) => i.message);

describe('every synthetic activated-ability card is executable', () => {
  test('the cards of the S3 slice pass validateCard', () => {
    for (const name of [
      'SYNTHETIC Pump Bear',
      'SYNTHETIC Firebreather',
      'SYNTHETIC Coach',
      'SYNTHETIC Altar',
      'SYNTHETIC Snack',
      'SYNTHETIC Life Tap',
      'SYNTHETIC Charge Battery',
      'SYNTHETIC Slow Scholar',
      'SYNTHETIC Cycling Bear',
      'SYNTHETIC Cycling Land',
      'SYNTHETIC Life Cycler',
      'SYNTHETIC Pinger',
      'SYNTHETIC Shrink',
    ]) {
      expect(validateCard(syntheticCard(name)), name).toEqual([]);
    }
  });
});

describe('the costs the engine pays are accepted', () => {
  test('tap, mana, life, sacrifice (this and a filter), counters', () => {
    for (const cost of [
      [{ kind: 'tap' }],
      [{ kind: 'mana', symbols: ['2', 'U'] }],
      [{ kind: 'payLife', amount: 3 }],
      [{ kind: 'sacrifice', what: { kind: 'this' } }],
      [{ kind: 'sacrifice', what: { types: ['creature'], other: true } }],
      [{ kind: 'removeCounters', counter: 'charge', count: 2 }],
      [{ kind: 'mana', symbols: ['1'] }, { kind: 'tap' }, { kind: 'payLife', amount: 1 }],
    ] as const) {
      expect(gate(activated(cost)), JSON.stringify(cost)).toEqual([]);
    }
  });

  test('discardThis, only for an ability that functions from the hand', () => {
    const hand = activated([{ kind: 'mana', symbols: ['1'] }, { kind: 'discardThis' }], {
      functionsIn: 'hand',
    });
    expect(gate(hand)).toEqual([]);
    expect(structure(activated([{ kind: 'discardThis' }]))).toEqual([
      expect.stringContaining("discardThis needs functionsIn: 'hand'"),
    ]);
  });
});

describe('costs and abilities that are malformed or not executable', () => {
  test('a hand ability cannot tap, sacrifice or remove counters from a card in hand', () => {
    for (const kind of ['tap', 'untap'] as const) {
      expect(structure(activated([{ kind }], { functionsIn: 'hand' }))).toEqual([
        expect.stringContaining('functions from the hand'),
      ]);
    }
    expect(
      structure(
        activated([{ kind: 'sacrifice', what: { kind: 'this' } }], { functionsIn: 'hand' }),
      ),
    ).toEqual([expect.stringContaining('functions from the hand')]);
    expect(
      structure(
        activated([{ kind: 'removeCounters', counter: 'x', count: 1 }], { functionsIn: 'hand' }),
      ),
    ).toEqual([expect.stringContaining('functions from the hand')]);
  });

  test('an unknown functionsIn or timing is malformed', () => {
    expect(structure(activated([{ kind: 'tap' }], { functionsIn: 'exile' as never }))).toEqual([
      expect.stringContaining('unknown zone'),
    ]);
    expect(structure(activated([{ kind: 'tap' }], { timing: 'later' as never }))).toEqual([
      expect.stringContaining('unknown timing'),
    ]);
  });

  test('a sacrifice cost cannot name an opponent permanent or another zone (CR 701.21a)', () => {
    expect(structure(activated([{ kind: 'sacrifice', what: { controller: 'opponent' } }]))).toEqual(
      [expect.stringContaining('only sacrifice permanents they control')],
    );
    expect(structure(activated([{ kind: 'sacrifice', what: { zone: 'graveyard' } }]))).toEqual([
      expect.stringContaining('on the battlefield'),
    ]);
  });

  test('costs the engine does not pay are rejected as supported, but fine as structure', () => {
    for (const [cost, kind] of [[{ kind: 'untap' }, 'untap']] as const) {
      expect(structure(activated([cost])), kind).toEqual([]);
      expect(gate(activated([cost])), kind).toEqual([
        expect.stringContaining(`cost "${kind}" is not implemented`),
      ]);
    }
  });

  test('an {X} in an activation cost is executable (D-103); two sacrifice costs are not', () => {
    // The ability's effect does not read X, which is allowed: the player still announces it.
    expect(gate(activated([{ kind: 'mana', symbols: ['X'] }]))).toEqual([]);
    expect(gate(activated([{ kind: 'mana', symbols: ['X'] }, { kind: 'payXLife' }]))).toEqual([]);
    expect(
      gate(
        activated([
          { kind: 'sacrifice', what: { kind: 'this' } },
          { kind: 'sacrifice', what: { types: ['creature'] } },
        ]),
      ),
    ).toEqual([expect.stringContaining('more than one sacrifice cost')]);
  });

  test('an unsupported effect inside an activated ability is reported with its path', () => {
    const a: Ability = {
      kind: 'activated',
      cost: [{ kind: 'tap' }],
      effect: {
        kind: 'modifyPt',
        objects: { kind: 'this' },
        power: 1,
        toughness: 1,
        duration: 'permanent',
      },
    };
    const issues = validateCard(card([a]));
    expect(issues.map((i) => i.path)).toEqual(['faces[0].abilities[0].effect.duration']);
  });

  test('an activated ability that adds mana with no target must be a mana ability', () => {
    const a: Ability = {
      kind: 'activated',
      cost: [{ kind: 'tap' }],
      effect: { kind: 'addMana', mana: { kind: 'fixed', mana: ['G'] } },
    };
    expect(validateAbility(a).map((i) => i.message)).toEqual([
      expect.stringContaining('must be kind'),
    ]);
  });
});

describe('cycling', () => {
  const cycling = (
    cost: Keyword extends infer K
      ? K extends { kind: 'cycling'; cost: infer C }
        ? C
        : never
      : never,
  ): Ability => ({
    kind: 'keyword',
    keyword: { kind: 'cycling', cost },
  });

  test('a mana cost and a life cost are executable', () => {
    expect(gate(cycling([{ kind: 'mana', symbols: ['2'] }]))).toEqual([]);
    expect(gate(cycling([{ kind: 'payLife', amount: 2 }]))).toEqual([]);
  });

  test('listing discardThis again is malformed; other costs are not executable', () => {
    expect(structure(cycling([{ kind: 'discardThis' }]))).toEqual([
      expect.stringContaining('already discards'),
    ]);
    expect(gate(cycling([{ kind: 'discard', count: 1 }]))).toEqual([
      expect.stringContaining('cost "discard" is not implemented'),
    ]);
    expect(gate(cycling([{ kind: 'sacrifice', what: { types: ['land'] } }]))).toEqual([
      expect.stringContaining('cost "sacrifice" is not implemented'),
    ]);
    // X is announced for an ability's own cost, not for a keyword's (D-103).
    expect(gate(cycling([{ kind: 'mana', symbols: ['X'] }]))[0]).toContain(
      'X in the cost of a keyword',
    );
  });

  test('an empty cycling cost is malformed (CR 602.1: an ability with no cost says {0})', () => {
    expect(structure(cycling([]))).toEqual([expect.stringContaining('cost list is empty')]);
  });
});
