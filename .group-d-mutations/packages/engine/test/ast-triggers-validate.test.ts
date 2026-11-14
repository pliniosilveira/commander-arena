// Validation of the AST nodes of triggered abilities, sacrifice and tokens (D-007): a node is
// well-formed (validateCardStructure) and executable (validateCard) only as the engine runs it.
import { describe, expect, test } from 'vitest';
import {
  type Ability,
  type CardDefinition,
  type Effect,
  validateAbility,
  validateCard,
  validateCardStructure,
} from '../src/index';
import { singleFaceCard } from './dsl-helpers';

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

const trigger = (
  t: Extract<Ability, { kind: 'triggered' }>['trigger'],
  effect: Effect,
): Ability => ({
  kind: 'triggered',
  trigger: t,
  effect,
});
const gain: Effect = { kind: 'gainLife', player: { kind: 'you' }, amount: 1 };
const messages = (card: CardDefinition) => validateCard(card).map((i) => i.message);

describe('trigger kinds', () => {
  test('every kind the engine runs validates', () => {
    const triggers = [
      { kind: 'entersBattlefield', what: { kind: 'this' } },
      { kind: 'dies', what: { types: ['creature'], other: true } },
      { kind: 'attacks', what: { kind: 'this' } },
      { kind: 'castSpell', filter: { stackKind: 'spell' }, by: 'you' },
      { kind: 'landfall' },
      { kind: 'upkeep', whose: 'you' },
      { kind: 'endStep', whose: 'each' },
      { kind: 'permanentSacrificed', by: 'you' },
      { kind: 'permanentSacrificed', by: 'any', filter: { types: ['creature'] } },
      { kind: 'becomesTapped', what: { kind: 'this' } },
    ] as const;
    for (const t of triggers)
      expect(validateCard(creatureWith(trigger(t, gain))), t.kind).toEqual([]);
  });

  test('malformed triggers are reported', () => {
    expect(
      validateAbility(trigger({ kind: 'permanentSacrificed', by: 'nobody' } as never, gain)).map(
        (i) => i.path,
      ),
    ).toEqual(['ability.trigger.by']);
    expect(
      validateAbility(
        trigger(
          { kind: 'permanentSacrificed', by: 'you', filter: { types: ['dragon'] } } as never,
          gain,
        ),
      ).map((i) => i.path),
    ).toEqual(['ability.trigger.filter.types[0]']);
    expect(
      validateAbility(trigger({ kind: 'becomesTapped', what: { types: [] } } as never, gain))
        .length,
    ).toBeGreaterThan(0);
  });

  test('a triggered ability with targets is executable: they are chosen as it goes on the stack (CR 603.3d)', () => {
    const card = creatureWith({
      kind: 'triggered',
      trigger: { kind: 'attacks', what: { kind: 'this' } },
      targets: [{ id: 't1', what: { kind: 'anyTarget' } }],
      effect: { kind: 'dealDamage', amount: 1, to: { kind: 'target', id: 't1' } },
    });
    expect(validateCardStructure(card)).toEqual([]);
    expect(messages(card)).toEqual([]);
  });

  test('an effect the engine does not run makes the triggered ability unexecutable', () => {
    const card = creatureWith(
      trigger(
        { kind: 'attacks', what: { kind: 'this' } },
        { kind: 'addMana', mana: { kind: 'anyColor' } },
      ),
    );
    expect(messages(card)).toEqual([expect.stringContaining('adding "anyColor" mana')]);
  });

  test('optional must be a boolean', () => {
    const card = creatureWith({
      kind: 'triggered',
      trigger: { kind: 'landfall' },
      effect: gain,
      optional: 'yes' as never,
    });
    expect(validateCardStructure(card).map((i) => i.path)).toEqual([
      'faces[0].abilities[0].optional',
    ]);
  });
});

describe('sacrifice selectors', () => {
  const sacrifice = (objects: Extract<Effect, { kind: 'sacrifice' }>['objects']): Effect => ({
    kind: 'sacrifice',
    objects,
  });
  const card = (objects: Extract<Effect, { kind: 'sacrifice' }>['objects']) =>
    creatureWith(trigger({ kind: 'landfall' }, sacrifice(objects)));

  test('this and a chosen permanent are executable', () => {
    expect(validateCard(card({ kind: 'this' }))).toEqual([]);
    expect(validateCard(card({ kind: 'choose', filter: { other: true } }))).toEqual([]);
    expect(validateCard(card({ kind: 'choose', filter: { types: ['land'] }, count: 2 }))).toEqual(
      [],
    );
  });

  test('a filter naming the opponent cannot be sacrificed (CR 701.21a)', () => {
    const c = card({ kind: 'choose', filter: { controller: 'opponent' } });
    expect(validateCardStructure(c).map((i) => i.path)).toEqual([
      'faces[0].abilities[0].effect.objects.filter.controller',
    ]);
  });

  test('a count of zero, and a zone other than the battlefield, are malformed', () => {
    expect(
      validateCardStructure(card({ kind: 'choose', filter: {}, count: 0 })).map((i) => i.path),
    ).toEqual(['faces[0].abilities[0].effect.objects.count']);
    expect(
      validateCardStructure(card({ kind: 'choose', filter: { zone: 'graveyard' } })).map(
        (i) => i.path,
      ),
    ).toEqual(['faces[0].abilities[0].effect.objects.filter.zone']);
  });

  test('sacrificing "each" permanent runs (D-139: each by its own controller); a target is well-formed but not executable yet', () => {
    const each = card({ kind: 'each', filter: { types: ['creature'] } });
    expect(validateCardStructure(each)).toEqual([]);
    expect(messages(each)).toEqual([]);
    const target = card({ kind: 'target', id: 't1' });
    expect(messages(target)).toContainEqual(expect.stringContaining('sacrificing "target"'));
  });
});

describe('createToken', () => {
  const token = (spec: Extract<Effect, { kind: 'createToken' }>['token']): CardDefinition =>
    creatureWith(trigger({ kind: 'landfall' }, { kind: 'createToken', token: spec, count: 1 }));
  const definition = {
    name: 'Goblin',
    manaCost: null,
    supertypes: [],
    types: ['creature'],
    subtypes: ['Goblin'],
    colors: ['R'],
    power: 1,
    toughness: 1,
    loyalty: null,
    defense: null,
    oracleText: '',
    abilities: [],
  } as const;

  test('Treasure and a custom creature token are executable', () => {
    expect(validateCard(token({ kind: 'preset', preset: 'Treasure' }))).toEqual([]);
    expect(validateCard(token({ kind: 'custom', definition }))).toEqual([]);
  });

  test('Food and Clue are executable now that their activated abilities run (CR 111.10b, 111.10f)', () => {
    for (const preset of ['Food', 'Clue'] as const) {
      const c = token({ kind: 'preset', preset });
      expect(validateCardStructure(c)).toEqual([]);
      expect(messages(c)).toEqual([]);
    }
  });

  test('an unknown preset is malformed', () => {
    expect(
      validateCardStructure(token({ kind: 'preset', preset: 'Blood Moon' as never })).map(
        (i) => i.path,
      ),
    ).toEqual(['faces[0].abilities[0].effect.token.preset']);
  });

  test('a creature token needs numbers; a noncreature token has none', () => {
    const noPower = token({ kind: 'custom', definition: { ...definition, power: null } });
    expect(validateCardStructure(noPower).map((i) => i.path)).toEqual([
      'faces[0].abilities[0].effect.token.definition.power',
    ]);
    const artifactWithPower = token({
      kind: 'custom',
      definition: { ...definition, types: ['artifact'] },
    });
    expect(validateCardStructure(artifactWithPower).map((i) => i.path)).toEqual([
      'faces[0].abilities[0].effect.token.definition.power',
      'faces[0].abilities[0].effect.token.definition.toughness',
    ]);
  });

  test('a token carrying an ability the engine cannot run makes the card unexecutable', () => {
    const c = token({
      kind: 'custom',
      definition: {
        ...definition,
        // "Untap this" as a cost is not one the engine pays yet (SUPPORTED_FEATURES.costKinds).
        abilities: [{ kind: 'activated', cost: [{ kind: 'untap' }], effect: gain }],
      },
    });
    expect(validateCardStructure(c)).toEqual([]);
    expect(messages(c)).toEqual([expect.stringContaining('cost "untap"')]);
  });

  test('a planeswalker token is not executable yet', () => {
    const c = token({
      kind: 'custom',
      definition: { ...definition, types: ['planeswalker'], power: null, toughness: null },
    });
    expect(messages(c)).toEqual([expect.stringContaining('a planeswalker token')]);
  });
});

describe('mana abilities that sacrifice', () => {
  const mana = (cost: Extract<Ability, { kind: 'mana' }>['cost']): CardDefinition =>
    singleFaceCard({
      name: 'SYNTHETIC Validation Probe',
      manaCost: ['1'],
      types: ['artifact'],
      colors: [],
      colorIdentity: [],
      oracleText: '',
      abilities: [{ kind: 'mana', cost, production: { kind: 'anyColor' } }],
    });

  test('{T} and sacrificing the permanent itself is executable (a Treasure)', () => {
    expect(
      validateCard(mana([{ kind: 'tap' }, { kind: 'sacrifice', what: { kind: 'this' } }])),
    ).toEqual([]);
  });

  test('sacrificing a permanent of a kind on the battlefield is executable (D-216); paying life is (D-099)', () => {
    expect(
      messages(mana([{ kind: 'tap' }, { kind: 'sacrifice', what: { types: ['creature'] } }])),
    ).toEqual([]);
    // The filter is read on the battlefield: a zone in it is refused.
    expect(
      messages(
        mana([
          { kind: 'tap' },
          { kind: 'sacrifice', what: { types: ['creature'], zone: 'graveyard' } },
        ]),
      ),
    ).toEqual([
      expect.stringContaining('only permanents on the battlefield'),
      expect.stringContaining('no zone in the filter'),
    ]);
    expect(messages(mana([{ kind: 'tap' }, { kind: 'payLife', amount: 1 }]))).toEqual([]);
    // A cost the engine does not pay on a mana ability is still named.
    expect(messages(mana([{ kind: 'tap' }, { kind: 'discard', count: 1 }]))).toEqual([
      expect.stringContaining('mana ability cost "discard"'),
    ]);
  });
});
