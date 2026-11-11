// Validation of the mana spent to cast a spell (D-183, the Korvold slice 5): where `manaSpent` may be read and what its card type may be
// (CR 601.2h, 601.2i, 614.12). The cards are SYNTHETIC (src/cards/fixtures/synthetic-mana-spent.ts) or built here from them.
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import type { Ability, CardDefinition, Effect } from '../src/index';
import { isFeatureSupported, SYNTHETIC_CARDS, syntheticCard, validateCard } from '../src/index';

const messages = (card: CardDefinition): string[] => validateCard(card).map((i) => i.message);

const draw = (count: unknown): Effect =>
  ({ kind: 'draw', player: { kind: 'you' }, count }) as unknown as Effect;

const withAbility = (ability: Ability): CardDefinition =>
  singleFace({
    name: 'SYNTHETIC Test Card',
    manaCost: ['2'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText: 'text',
    abilities: [ability],
  });

const castTrigger = (effect: Effect): Ability => ({
  kind: 'triggered',
  trigger: { kind: 'castSpell', filter: { stackKind: 'spell' }, by: 'you', self: true },
  effect,
});

const enters = (count: unknown): Ability =>
  ({
    kind: 'replacement',
    replacement: {
      kind: 'othersEnterWithCounters',
      what: { types: ['creature'], controller: 'you' },
      counter: '+1/+1',
      count,
    },
  }) as unknown as Ability;

describe('the cards of the slice are valid and the amount is listed', () => {
  for (const name of ['SYNTHETIC Kobold Dragon', 'SYNTHETIC Coin Press', 'SYNTHETIC Mana Press']) {
    test(name, () => {
      expect(validateCard(SYNTHETIC_CARDS[name] as CardDefinition)).toEqual([]);
      expect(validateCard(syntheticCard(name))).toEqual([]);
    });
  }

  test('amount:manaSpent is listed', () => {
    expect(isFeatureSupported('amount:manaSpent')).toBe(true);
  });
});

describe('where "the amount of mana spent to cast it" is read', () => {
  test('in the effect of "When you cast this spell", the spell that was cast being the source', () => {
    expect(messages(withAbility(castTrigger(draw({ kind: 'manaSpent' }))))).toEqual([]);
    expect(
      messages(withAbility(castTrigger(draw({ kind: 'manaSpent', fromType: 'artifact' })))),
    ).toEqual([]);
  });

  test('inside arithmetic in that effect as well', () => {
    expect(
      messages(
        withAbility(castTrigger(draw({ kind: 'half', of: { kind: 'manaSpent' }, round: 'down' }))),
      ),
    ).toEqual([]);
  });

  test('nowhere else: not in an ordinary triggered ability, an activated one or a spell', () => {
    const upkeep: Ability = {
      kind: 'triggered',
      trigger: { kind: 'upkeep', whose: 'you' },
      effect: draw({ kind: 'manaSpent' }),
    };
    expect(messages(withAbility(upkeep)).join('\n')).toMatch(
      /manaSpent is read in the effect of a "when you cast this spell"/,
    );
    const activated: Ability = {
      kind: 'activated',
      cost: [{ kind: 'tap' }],
      effect: draw({ kind: 'manaSpent' }),
    };
    expect(messages(withAbility(activated)).join('\n')).toMatch(/manaSpent is read/);
    const spell = singleFace({
      name: 'SYNTHETIC Test Spell',
      manaCost: ['1'],
      types: ['sorcery'],
      colors: [],
      colorIdentity: [],
      oracleText: 'text',
      spell: { effect: draw({ kind: 'manaSpent' }) },
    });
    expect(messages(spell).join('\n')).toMatch(/manaSpent is read/);
  });

  test('the card type of the source must be a card type', () => {
    expect(
      messages(withAbility(castTrigger(draw({ kind: 'manaSpent', fromType: 'Artifact' })))).join(
        '\n',
      ),
    ).toMatch(/fromType is a card type/);
    expect(
      messages(withAbility(castTrigger(draw({ kind: 'manaSpent', fromType: 'treasure' })))).join(
        '\n',
      ),
    ).toMatch(/fromType is a card type/);
  });
});

describe('the count of "enters with an additional counter"', () => {
  test('may be the mana spent, in all or from sources of a card type', () => {
    expect(messages(withAbility(enters({ kind: 'manaSpent' })))).toEqual([]);
    expect(messages(withAbility(enters({ kind: 'manaSpent', fromType: 'artifact' })))).toEqual([]);
  });

  test('a card type that is not one is refused', () => {
    expect(
      messages(withAbility(enters({ kind: 'manaSpent', fromType: 'Goblin' }))).join('\n'),
    ).toMatch(/fromType is a card type/);
  });

  test('another amount is still refused, a count of objects and a number still read', () => {
    expect(messages(withAbility(enters({ kind: 'x' }))).join('\n')).toMatch(
      /counter count must be/,
    );
    expect(messages(withAbility(enters(2)))).toEqual([]);
    expect(
      messages(
        withAbility(
          enters({ kind: 'countOf', filter: { types: ['creature'], controller: 'you' } }),
        ),
      ),
    ).toEqual([]);
  });
});
