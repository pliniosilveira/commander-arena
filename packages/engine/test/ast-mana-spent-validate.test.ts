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

  test('nowhere else: not in an ordinary triggered ability or an activated one', () => {
    const upkeep: Ability = {
      kind: 'triggered',
      trigger: { kind: 'upkeep', whose: 'you' },
      effect: draw({ kind: 'manaSpent' }),
    };
    expect(messages(withAbility(upkeep)).join('\n')).toMatch(
      /manaSpent is read in the effect of a spell, or of a "when you cast this spell"/,
    );
    const activated: Ability = {
      kind: 'activated',
      cost: [{ kind: 'tap' }],
      effect: draw({ kind: 'manaSpent' }),
    };
    expect(messages(withAbility(activated)).join('\n')).toMatch(/manaSpent is read/);
  });

  // D-260 (Search for Glory): "You gain 1 life for each {S} spent to cast this spell" is the effect of the spell itself, where the spell is the source. Until then the
  // validator refused any read of the mana spent outside "When you cast this spell"; a spell's own effect is the same source, read from the same stack data.
  test('in the effect of the spell itself, all of it, from a card type of the source, or the snow mana', () => {
    const spell = (amount: unknown) =>
      singleFace({
        name: 'SYNTHETIC Test Spell',
        manaCost: ['1'],
        types: ['sorcery'],
        colors: [],
        colorIdentity: [],
        oracleText: 'text',
        spell: { effect: draw(amount) },
      });
    expect(messages(spell({ kind: 'manaSpent' }))).toEqual([]);
    expect(messages(spell({ kind: 'manaSpent', fromType: 'artifact' }))).toEqual([]);
    expect(messages(spell({ kind: 'manaSpent', snow: true }))).toEqual([]);
  });

  test('"snow" is true and is not given with a card type of the source', () => {
    expect(messages(withAbility(castTrigger(draw({ kind: 'manaSpent', snow: true }))))).toEqual([]);
    expect(
      messages(withAbility(castTrigger(draw({ kind: 'manaSpent', snow: false })))).join('\n'),
    ).toMatch(/snow is true/);
    expect(
      messages(
        withAbility(castTrigger(draw({ kind: 'manaSpent', snow: true, fromType: 'artifact' }))),
      ).join('\n'),
    ).toMatch(/snow is true and is not given with fromType/);
    expect(messages(withAbility(enters({ kind: 'manaSpent', snow: true })))).toEqual([]);
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
