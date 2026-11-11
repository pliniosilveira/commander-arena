// Validation of the nodes of D-177 (the Korvold slice 2): `moved` after a `search`, the object reference `sacrificed`, `becomesTarget` with
// `spellOnly`, and the abilities a static `grantAbility` gives to a group. A node is executable (validateCard) only as the engine runs it.
import { describe, expect, test } from 'vitest';
import {
  type Ability,
  type CardDefinition,
  type Effect,
  isFeatureSupported,
  validateCard,
} from '../src/index';
import { singleFaceCard } from './dsl-helpers';

const YOU = { kind: 'you' } as const;
const THIS = { kind: 'this' } as const;
const SACRIFICED = { kind: 'sacrificed' } as const;
const search: Effect = {
  kind: 'search',
  player: YOU,
  filter: { types: ['land'] },
  max: 1,
  destinations: [{ zone: 'battlefield', count: 1 }],
  reveal: false,
  shuffle: true,
};
const SACRIFICE_ANOTHER: Effect = {
  kind: 'sacrifice',
  objects: { kind: 'choose', filter: { types: ['creature'], other: true } },
};
const gainSacrificedPower: Effect = {
  kind: 'gainLife',
  player: YOU,
  amount: { kind: 'powerOf', of: SACRIFICED },
};

function sorcery(effect: Effect): CardDefinition {
  return singleFaceCard({
    name: 'SYNTHETIC Validation Probe',
    manaCost: ['1'],
    types: ['sorcery'],
    colors: [],
    colorIdentity: [],
    oracleText: '',
    spell: { effect },
  });
}
function creature(abilities: Ability[]): CardDefinition {
  return singleFaceCard({
    name: 'SYNTHETIC Validation Creature',
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
const messages = (card: CardDefinition) => validateCard(card).map((i) => i.message);

describe('"it" after a search (CR 701.23, 400.7j)', () => {
  test('a search before it makes `moved` readable, in a spell and in an ability', () => {
    const untap: Effect = { kind: 'untap', objects: { kind: 'moved' } };
    expect(validateCard(sorcery({ kind: 'sequence', effects: [search, untap] }))).toEqual([]);
    expect(
      validateCard(
        creature([
          {
            kind: 'triggered',
            trigger: { kind: 'entersBattlefield', what: THIS },
            effect: { kind: 'sequence', effects: [search, untap] },
          },
        ]),
      ),
    ).toEqual([]);
  });

  test('without a search (or another effect that moves something) before it, `moved` is refused', () => {
    const untap: Effect = { kind: 'untap', objects: { kind: 'moved' } };
    expect(messages(sorcery({ kind: 'sequence', effects: [untap, search] }))).toEqual([
      "'moved' needs an exile, destroy or moveToZone effect before it in the sequence",
    ]);
  });
});

describe('"that creature" after a sacrifice (`sacrificed`, CR 603.12, 608.2h)', () => {
  test('it is read in the reflexive ability after a sacrifice, and after an offer to sacrifice', () => {
    const reflexive: Effect = { kind: 'reflexive', effect: gainSacrificedPower };
    expect(
      validateCard(sorcery({ kind: 'sequence', effects: [SACRIFICE_ANOTHER, reflexive] })),
    ).toEqual([]);
    expect(
      validateCard(
        sorcery({
          kind: 'sequence',
          effects: [{ kind: 'may', effect: SACRIFICE_ANOTHER }, reflexive],
        }),
      ),
    ).toEqual([]);
  });

  test('it is read by the instructions after the sacrifice of the same sequence', () => {
    expect(
      validateCard(
        sorcery({ kind: 'sequence', effects: [SACRIFICE_ANOTHER, gainSacrificedPower] }),
      ),
    ).toEqual([]);
  });

  test('without a sacrifice before it, it is refused', () => {
    expect(messages(sorcery(gainSacrificedPower))).toEqual([
      "'sacrificed' needs a sacrifice effect before it in the sequence, or before the reflexive trigger it is in (and is read only in an amount)",
    ]);
  });

  test('a reflexive ability that follows something else than a sacrifice does not read it', () => {
    const discard: Effect = { kind: 'discard', player: YOU, count: 1 };
    const card = sorcery({
      kind: 'sequence',
      effects: [
        { kind: 'may', effect: discard },
        { kind: 'reflexive', effect: gainSacrificedPower },
      ],
    });
    expect(messages(card)).toHaveLength(1);
  });

  test("it is only an amount's object: it is not a target of a tap", () => {
    const card = sorcery({
      kind: 'sequence',
      effects: [SACRIFICE_ANOTHER, { kind: 'tap', objects: SACRIFICED }],
    });
    expect(messages(card)).toHaveLength(1);
  });

  test('the feature is listed', () => {
    expect(isFeatureSupported('selector:sacrificed')).toBe(true);
  });
});

describe('"becomes the target of a spell" (`spellOnly`, CR 603.2)', () => {
  const trigger = (spellOnly: unknown): Ability => ({
    kind: 'triggered',
    trigger: { kind: 'becomesTarget', what: THIS, by: 'any', spellOnly } as never,
    effect: { kind: 'draw', player: YOU, count: 1 },
  });

  test('true is valid; anything else is refused', () => {
    expect(validateCard(creature([trigger(true)]))).toEqual([]);
    expect(messages(creature([trigger(false)]))).toEqual(['spellOnly is true when present']);
  });

  test('the feature is listed', () => {
    expect(isFeatureSupported('trigger:becomesTargetSpell')).toBe(true);
  });
});

describe('abilities given to a group', () => {
  const grant = (ability: Extract<Ability, { kind: 'static' }>['static']): Ability => ({
    kind: 'static',
    static: ability,
  });
  const lands = { kind: 'filter', filter: { types: ['land'], controller: 'you' } } as const;

  test('a mana ability that sacrifices its permanent, and an activated ability, may be given to a group', () => {
    expect(
      validateCard(
        creature([
          grant({
            kind: 'grantAbility',
            subject: lands,
            ability: {
              kind: 'mana',
              cost: [{ kind: 'tap' }, { kind: 'sacrifice', what: THIS }],
              production: { kind: 'anyColor', count: 2 },
            },
          }),
          grant({
            kind: 'grantAbility',
            subject: lands,
            ability: {
              kind: 'activated',
              cost: [{ kind: 'tap' }],
              effect: {
                kind: 'createToken',
                token: { kind: 'preset', preset: 'Treasure' },
                count: 1,
              },
            },
          }),
        ]),
      ),
    ).toEqual([]);
  });
});
