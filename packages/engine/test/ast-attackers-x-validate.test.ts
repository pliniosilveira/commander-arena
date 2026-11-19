// Validation of `attackersGreatestPower`, `xIs`, `noMaxHandSizeForGame` and an amount as the count of `untap` (issue 337). CR 508.1 (the creatures
// of an attack declaration), CR 107.3a (the X of a spell), CR 402.2 and 514.1 (maximum hand size), CR 701.26a (untap).
import { describe, expect, test } from 'vitest';
import {
  type Ability,
  type CardDefinition,
  type Effect,
  SUPPORTED_FEATURES,
  validateCard,
} from '../src/index';
import { singleFaceCard } from './dsl-helpers';

const untapLands = (count: unknown): Effect =>
  ({
    kind: 'untap',
    objects: { kind: 'choose', filter: { types: ['land'] }, count, upTo: true },
  }) as Effect;

function creature(ability: Ability): CardDefinition {
  return singleFaceCard({
    name: 'SYNTHETIC Validation Probe',
    manaCost: ['1'],
    types: ['creature'],
    subtypes: ['Treefolk'],
    colors: [],
    colorIdentity: [],
    power: 1,
    toughness: 1,
    oracleText: '',
    abilities: [ability],
  });
}

function spell(effect: Effect, withX: boolean): CardDefinition {
  return singleFaceCard({
    name: 'SYNTHETIC Validation Probe',
    manaCost: withX ? ['X', 'U'] : ['U'],
    types: ['sorcery'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: '',
    spell: { effect, ...(withX ? { x: true } : {}) },
  });
}

const messages = (c: CardDefinition) => validateCard(c).map((i) => `${i.path}: ${i.message}`);

describe('the kinds are supported', () => {
  test('they are in SUPPORTED_FEATURES', () => {
    expect(SUPPORTED_FEATURES.amountKinds).toContain('attackersGreatestPower');
    expect(SUPPORTED_FEATURES.conditionKinds).toContain('xIs');
    expect(SUPPORTED_FEATURES.effectKinds).toContain('noMaxHandSizeForGame');
  });
});

describe('attackersGreatestPower', () => {
  const trigger = (kind: 'attackBatch' | 'attacks'): Ability =>
    kind === 'attackBatch'
      ? {
          kind: 'triggered',
          trigger: { kind: 'attackBatch', who: 'you', atLeast: 1 },
          effect: untapLands({ kind: 'attackersGreatestPower' }),
        }
      : {
          kind: 'triggered',
          trigger: { kind: 'attacks', what: { kind: 'this' } },
          effect: untapLands({ kind: 'attackersGreatestPower' }),
        };

  test('is valid in the effect of an attackBatch trigger', () => {
    expect(messages(creature(trigger('attackBatch')))).toEqual([]);
  });

  test('is refused in the effect of any other trigger', () => {
    expect(messages(creature(trigger('attacks'))).join('\n')).toContain(
      'attackersGreatestPower reads the creatures of an attackBatch trigger',
    );
  });

  test('is refused in a spell', () => {
    expect(
      messages(spell(untapLands({ kind: 'attackersGreatestPower' }), false)).join('\n'),
    ).toContain('attackersGreatestPower reads the creatures of an attackBatch trigger');
  });
});

describe('untap up to an amount', () => {
  test('a number must still be positive', () => {
    expect(messages(spell(untapLands(0), false)).join('\n')).toContain(
      'the number of permanents to untap is a positive integer',
    );
    expect(messages(spell(untapLands(3), false))).toEqual([]);
  });

  test('X is an amount where the spell has an X, and an error where it has none', () => {
    expect(messages(spell(untapLands({ kind: 'x' }), true))).toEqual([]);
    expect(messages(spell(untapLands({ kind: 'x' }), false)).join('\n')).toContain('X is used');
  });
});

describe('xIs', () => {
  const instead = (compare: unknown): Effect =>
    ({
      kind: 'conditional',
      condition: { kind: 'xIs', compare },
      effect: { kind: 'draw', player: { kind: 'you' }, count: 2 },
      else: { kind: 'draw', player: { kind: 'you' }, count: 1 },
    }) as Effect;

  test('is valid in a conditional effect of a spell with an X', () => {
    expect(messages(spell(instead({ cmp: 'atLeast', value: 10 }), true))).toEqual([]);
  });

  test('is refused where nothing has an X', () => {
    expect(messages(spell(instead({ cmp: 'atLeast', value: 10 }), false)).join('\n')).toContain(
      'xIs is used but nothing in this ability or spell has an X',
    );
  });

  test('needs a known comparison and a whole number', () => {
    expect(messages(spell(instead({ cmp: 'over', value: 10 }), true)).join('\n')).toContain(
      'unknown comparison',
    );
    expect(messages(spell(instead({ cmp: 'atLeast', value: -1 }), true)).join('\n')).toContain(
      'non-negative whole number',
    );
  });

  test('is refused as a plain condition (an ability cost or a static condition)', () => {
    const card = creature({
      kind: 'triggered',
      trigger: { kind: 'step', step: 'upkeep', whose: 'you' },
      interveningIf: { kind: 'xIs', compare: { cmp: 'atLeast', value: 1 } },
      effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
    } as Ability);
    expect(messages(card).join('\n')).toContain('xIs reads the X of the spell or ability');
  });
});

describe('noMaxHandSizeForGame', () => {
  test('is a valid effect with no parameters', () => {
    expect(messages(spell({ kind: 'noMaxHandSizeForGame' }, false))).toEqual([]);
  });
});
