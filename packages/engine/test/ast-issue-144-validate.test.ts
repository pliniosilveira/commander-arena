// validateCard for the nodes of issue 144: `copySpell.newTarget` ("The copy targets that token", CR 707.10e) and the `thisWay` count `excessDamageDealt` (CR 120.10). Cards are defined here
// and SYNTHETIC.
import { describe, expect, test } from 'vitest';
import type { Ability, Effect } from '../src/ast/types';
import { validateCard } from '../src/ast/validate';
import type { CardDefinition } from '../src/cards/definition';
import { singleFace } from '../src/cards/fixtures/helpers';

function enchantment(abilities: readonly Ability[]): CardDefinition {
  return singleFace({
    name: 'SYNTHETIC Test Enchantment',
    manaCost: ['1'],
    types: ['enchantment'],
    subtypes: [],
    colors: [],
    colorIdentity: [],
    oracleText: 'test',
    abilities,
  });
}

function sorcery(effect: Effect): CardDefinition {
  return singleFace({
    name: 'SYNTHETIC Test Sorcery',
    manaCost: ['1'],
    types: ['sorcery'],
    subtypes: [],
    colors: [],
    colorIdentity: [],
    oracleText: 'test',
    spell: {
      targets: [{ id: 't1', what: { kind: 'object', filter: { types: ['creature'] } } }],
      effect,
    },
  });
}

const TOKEN: Effect = {
  kind: 'createToken',
  token: { kind: 'preset', preset: 'Treasure' },
  count: 1,
};
const COPY = {
  kind: 'copySpell',
  spell: { kind: 'triggerSubject' },
  newTargets: 'no',
  newTarget: { kind: 'moved' },
} as const satisfies Effect;

const castTrigger = (effect: Effect): Ability => ({
  kind: 'triggered',
  trigger: { kind: 'castSpell', filter: { stackKind: 'spell' }, by: 'you' },
  effect,
});
const messages = (def: CardDefinition) => validateCard(def).map((i) => i.message);

describe('copySpell.newTarget (CR 707.10e)', () => {
  test('a token made first, then a copy of the spell of the trigger that targets it, is valid', () => {
    expect(
      validateCard(enchantment([castTrigger({ kind: 'sequence', effects: [TOKEN, COPY] })])),
    ).toEqual([]);
  });

  test('without an effect before it that made the object, there is nothing to name', () => {
    expect(messages(enchantment([castTrigger(COPY)]))).toEqual([
      expect.stringContaining("'moved' needs an exile, destroy or moveToZone effect before it"),
    ]);
  });

  test('it is one copy with no choice: not with newTargets "may", a count, forEach or a copier', () => {
    const seq = (copy: Effect): Effect => ({ kind: 'sequence', effects: [TOKEN, copy] });
    for (const copy of [
      { ...COPY, newTargets: 'may' },
      { ...COPY, count: 2 },
      { ...COPY, forEach: { types: ['creature'] } },
      { ...COPY, copier: 'triggerPlayer' },
    ] as const) {
      expect(messages(enchantment([castTrigger(seq(copy))]))).toEqual([
        expect.stringContaining('a copy that targets an object is one copy of the spell'),
      ]);
    }
  });
});

describe('thisWay excessDamageDealt (CR 120.10)', () => {
  const DAMAGE: Effect = { kind: 'dealDamage', amount: 3, to: { kind: 'target', id: 't1' } };
  const MAKE: Effect = {
    kind: 'createToken',
    token: { kind: 'preset', preset: 'Treasure' },
    count: { kind: 'thisWay', what: 'excessDamageDealt' },
  };

  test('after a dealDamage effect of the same resolution it is valid', () => {
    expect(validateCard(sorcery({ kind: 'sequence', effects: [DAMAGE, MAKE] }))).toEqual([]);
  });

  test('without a dealDamage effect before it there is nothing counted', () => {
    expect(messages(sorcery(MAKE))).toEqual([expect.stringContaining('a dealDamage effect')]);
  });
});
