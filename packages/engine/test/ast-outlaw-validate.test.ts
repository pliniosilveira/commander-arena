// validateCard and the filter test for `ObjectFilter.outlaw` (CR 700.12: an object with the Assassin, Mercenary, Pirate, Rogue and/or Warlock creature types). Cards are SYNTHETIC and
// defined here.
import { describe, expect, test } from 'vitest';
import type { Ability, ObjectFilter } from '../src/ast/types';
import { validateCard } from '../src/ast/validate';
import type { CardDefinition } from '../src/cards/definition';
import { singleFace } from '../src/cards/fixtures/helpers';
import { isOutlaw, OUTLAW_CREATURE_TYPES } from '../src/index';

function spell(filter: ObjectFilter): CardDefinition {
  const ability = {
    kind: 'triggered',
    trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
    targets: [{ id: 't1', what: { kind: 'object', filter } }],
    effect: { kind: 'destroy', objects: { kind: 'target', id: 't1' } },
  } as Ability;
  return singleFace({
    name: 'SYNTHETIC Outlaw Hunter',
    manaCost: ['1'],
    types: ['creature'],
    subtypes: ['Bear'],
    colors: [],
    colorIdentity: [],
    power: 1,
    toughness: 1,
    oracleText: 'test',
    abilities: [ability],
  });
}

const messages = (filter: ObjectFilter) => validateCard(spell(filter)).map((i) => i.message);

describe('ObjectFilter.outlaw validates as a boolean', () => {
  test('true and false are valid', () => {
    expect(messages({ types: ['creature'], outlaw: true })).toEqual([]);
    expect(messages({ types: ['creature'], outlaw: false })).toEqual([]);
  });

  test('anything else is refused', () => {
    expect(messages({ types: ['creature'], outlaw: 'yes' } as unknown as ObjectFilter)).toEqual([
      expect.stringContaining('outlaw must be a boolean'),
    ]);
  });
});

describe('the outlaw predicate (CR 700.12)', () => {
  test.each(OUTLAW_CREATURE_TYPES)('a %s is an outlaw', (type) => {
    expect(isOutlaw([type])).toBe(true);
    expect(isOutlaw(['Elf', type])).toBe(true);
  });

  test('an object with no outlaw type is none, and no subtype is called Outlaw', () => {
    expect(isOutlaw(['Elf', 'Druid'])).toBe(false);
    expect(isOutlaw([])).toBe(false);
    expect(isOutlaw(['Outlaw'])).toBe(false);
  });
});
