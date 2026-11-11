// Validation of the intervening "if" of a triggered ability (CR 603.4) and of the host types of an
// "attached" static subject: well-formed (validateCardStructure) and executable (validateCard).
// Cards are SYNTHETIC or defined here.
import { describe, expect, test } from 'vitest';
import {
  type Ability,
  type CardDefinition,
  type Condition,
  type Trigger,
  validateCard,
  validateCardStructure,
} from '../src/index';
import { singleFaceCard } from './dsl-helpers';

const gain = { kind: 'gainLife', player: { kind: 'you' }, amount: 1 } as const;
const TWO_CREATURES: Condition = {
  kind: 'controlsAtLeast',
  filter: { types: ['creature'] },
  count: 2,
};

function creatureWith(...abilities: Ability[]): CardDefinition {
  return singleFaceCard({
    name: 'SYNTHETIC Validation Probe',
    manaCost: ['1'],
    types: ['creature'],
    colors: [],
    colorIdentity: [],
    power: 1,
    toughness: 1,
    oracleText: '',
    abilities,
  });
}

const withIf = (trigger: Trigger, interveningIf: Condition): Ability => ({
  kind: 'triggered',
  trigger,
  interveningIf,
  effect: gain,
});

const ENTERS: Trigger = { kind: 'entersBattlefield', what: { kind: 'this' } };
const DIES: Trigger = { kind: 'dies', what: { kind: 'this' } };
const messages = (card: CardDefinition) => validateCard(card).map((i) => i.message);

describe('the intervening "if" (CR 603.4)', () => {
  test('every condition the engine evaluates validates on an enters trigger', () => {
    const conditions: Condition[] = [
      TWO_CREATURES,
      { kind: 'opponentsAtLeast', count: 1 },
      { kind: 'and', terms: [TWO_CREATURES, { kind: 'opponentsAtLeast', count: 1 }] },
      { kind: 'or', terms: [TWO_CREATURES, { kind: 'opponentsAtLeast', count: 3 }] },
      { kind: 'not', term: TWO_CREATURES },
    ];
    for (const c of conditions) {
      expect(validateCard(creatureWith(withIf(ENTERS, c))), c.kind).toEqual([]);
    }
  });

  test('a malformed condition is reported at its own path', () => {
    const bad = creatureWith(withIf(ENTERS, { kind: 'opponentsAtLeast', count: 0 }));
    expect(validateCardStructure(bad).map((i) => i.path)).toEqual([
      'faces[0].abilities[0].interveningIf.count',
    ]);
    const unknown = creatureWith(withIf(ENTERS, { kind: 'nonsense' } as never));
    expect(validateCardStructure(unknown).map((i) => i.path)).toEqual([
      'faces[0].abilities[0].interveningIf',
    ]);
  });

  test('"kicked" needs a kicker ability, also inside an intervening if', () => {
    const card = creatureWith(withIf(ENTERS, { kind: 'kicked' }));
    expect(validateCardStructure(card).map((i) => i.message)).toEqual([
      expect.stringContaining('kicked condition needs a kicker'),
    ]);
  });

  test('a trigger that looks back in time may not count permanents in its "if"', () => {
    const card = creatureWith(withIf(DIES, TWO_CREATURES));
    expect(validateCardStructure(card)).toEqual([]);
    expect(messages(card)).toEqual([expect.stringContaining('CR 603.10a')]);
    expect(validateCard(card)[0]?.path).toBe('faces[0].abilities[0].interveningIf');
    // Nested, and on "whenever you sacrifice".
    const nested = creatureWith(
      withIf(
        { kind: 'permanentSacrificed', by: 'you' },
        { kind: 'not', term: { kind: 'and', terms: [TWO_CREATURES] } },
      ),
    );
    expect(messages(nested)).toEqual([expect.stringContaining('permanentSacrificed')]);
  });

  test('a look-back trigger may read what needs no battlefield', () => {
    expect(
      validateCard(creatureWith(withIf(DIES, { kind: 'opponentsAtLeast', count: 1 }))),
    ).toEqual([]);
  });

  test('a card marked unsupported is checked for structure only', () => {
    const card = { ...creatureWith(withIf(DIES, TWO_CREATURES)), support: 'unsupported' as const };
    expect(validateCard(card)).toEqual(validateCardStructure(card));
  });
});

describe('the host types of an "attached" subject', () => {
  const aura = (subject: unknown): CardDefinition =>
    singleFaceCard({
      name: 'SYNTHETIC Validation Aura',
      manaCost: ['1'],
      types: ['enchantment'],
      subtypes: ['Aura'],
      colors: [],
      colorIdentity: [],
      oracleText: '',
      abilities: [
        { kind: 'keyword', keyword: { kind: 'enchant', filter: {} } },
        {
          kind: 'static',
          static: { kind: 'modifyPt', subject: subject as never, power: 1, toughness: 1 },
        },
      ],
    });

  test('types and supertypes validate', () => {
    expect(validateCard(aura({ kind: 'attached' }))).toEqual([]);
    expect(validateCard(aura({ kind: 'attached', types: ['creature'] }))).toEqual([]);
    expect(
      validateCard(aura({ kind: 'attached', types: ['creature'], supertypes: ['legendary'] })),
    ).toEqual([]);
  });

  test('an empty list or an unknown name is malformed', () => {
    expect(validateCardStructure(aura({ kind: 'attached', types: [] })).map((i) => i.path)).toEqual(
      ['faces[0].abilities[1].static.subject.types'],
    );
    expect(
      validateCardStructure(aura({ kind: 'attached', types: ['creatur'] })).map((i) => i.path),
    ).toEqual(['faces[0].abilities[1].static.subject.types[0]']);
    expect(
      validateCardStructure(aura({ kind: 'attached', supertypes: ['mythic'] })).map((i) => i.path),
    ).toEqual(['faces[0].abilities[1].static.subject.supertypes[0]']);
  });
});
