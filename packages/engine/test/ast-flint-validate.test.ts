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

// Effects added for the Flint deck (issue 685): validateCard accepts the shapes the cards use and refuses the combinations the engine does not run.
import type { Effect } from '../src/ast/types';

function spellWith(effect: Effect): CardDefinition {
  return singleFace({
    name: 'SYNTHETIC Flint Spell',
    manaCost: ['1'],
    types: ['sorcery'],
    subtypes: [],
    colors: [],
    colorIdentity: [],
    oracleText: 'test',
    abilities: [],
    spell: { targets: [], effect },
  });
}
const problems = (e: Effect) => validateCard(spellWith(e)).map((i) => i.message);

describe('castFree.payInstead (The Infamous Cruelclaw)', () => {
  const base = { kind: 'castFree', objects: { kind: 'moved' } } as const;
  const refused = (e: Effect) => problems(e).some((m) => m.includes('payInstead'));
  test('one discard of one card is valid, anything else is refused', () => {
    expect(refused({ ...base, payInstead: [{ kind: 'discard', count: 1 }] })).toBe(false);
    expect(refused({ ...base, payInstead: [{ kind: 'discard', count: 2 }] })).toBe(true);
    expect(refused({ ...base, payInstead: [{ kind: 'payLife', amount: 2 }] as never })).toBe(true);
    expect(
      refused({
        ...base,
        objects: { kind: 'linkedExile' },
        payInstead: [{ kind: 'discard', count: 1 }],
      }),
    ).toBe(true);
  });
});

describe('lookAtTop with nothing taken (Orcish Spy)', () => {
  test('max 0 with the rest on top, of another player’s library, is valid; max 0 with a destination is not', () => {
    const look = {
      kind: 'lookAtTop',
      count: 3,
      from: { kind: 'you' },
      take: { filter: {}, max: 0 },
      rest: 'top',
    } as const;
    expect(problems(look)).toEqual([]);
    expect(problems({ ...look, take: { filter: {}, max: 0, to: 'hand' } })).not.toEqual([]);
    expect(problems({ ...look, rest: 'bottomRandom' })).not.toEqual([]);
  });
});
