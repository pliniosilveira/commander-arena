// validateCard for the condition `manaSpentFromSubtype` (CR 601.2h, 205.3i): the mana a source of a subtype made, spent on the spell that caused a cast trigger. Cards are SYNTHETIC.
import { describe, expect, test } from 'vitest';
import type { Ability, Condition } from '../src/ast/types';
import { validateCard } from '../src/ast/validate';
import type { CardDefinition } from '../src/cards/definition';
import { singleFace } from '../src/cards/fixtures/helpers';

function watcher(interveningIf: Condition): CardDefinition {
  const ability = {
    kind: 'triggered',
    trigger: { kind: 'castSpell', filter: {}, by: 'you' },
    interveningIf,
    effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 1 },
  } as unknown as Ability;
  return singleFace({
    name: 'SYNTHETIC Treasure Watcher',
    manaCost: ['1'],
    types: ['enchantment'],
    subtypes: [],
    colors: [],
    colorIdentity: [],
    oracleText: 'test',
    abilities: [ability],
  });
}

const messages = (c: Condition) => validateCard(watcher(c)).map((i) => i.message);

describe('Condition.manaSpentFromSubtype', () => {
  test('a subtype is valid in the intervening "if" of a cast trigger', () => {
    expect(messages({ kind: 'manaSpentFromSubtype', subtype: 'Treasure' })).toEqual([]);
  });

  test('an empty or missing subtype is refused', () => {
    expect(messages({ kind: 'manaSpentFromSubtype', subtype: '' })).toEqual([
      expect.stringContaining('subtype'),
    ]);
    expect(messages({ kind: 'manaSpentFromSubtype' } as unknown as Condition)).toEqual([
      expect.stringContaining('subtype'),
    ]);
  });
});
