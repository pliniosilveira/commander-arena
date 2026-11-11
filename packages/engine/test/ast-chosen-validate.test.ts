// Validation of "As this enters, choose a creature type / a color" and of what reads the choice (D-100):
// the replacement `asEntersChoose`, the filter flags `chosenType` and `chosenColor`, and the static
// `setTypes` ("is the chosen type in addition to its other types"). The two kinds of ability are linked
// (CR 607.2d): a card that refers to a choice must make it itself, and a face asks one question as it
// enters (CR 614.12). Cards here are SYNTHETIC probes.
import { describe, expect, test } from 'vitest';
import {
  type Ability,
  type CardDefinition,
  isFeatureSupported,
  type ObjectFilter,
  SUPPORTED_FEATURES,
  SYNTHETIC_CARDS,
  validateAbility,
  validateCard,
  validateCardStructure,
} from '../src/index';
import { singleFaceCard } from './dsl-helpers';

const CHOOSE_TYPE: Ability = {
  kind: 'replacement',
  replacement: { kind: 'asEntersChoose', what: 'creatureType' },
};
const CHOOSE_COLOR: Ability = {
  kind: 'replacement',
  replacement: { kind: 'asEntersChoose', what: 'color' },
};
const SHOCK: Ability = {
  kind: 'replacement',
  replacement: { kind: 'entersTappedUnlessPays', cost: [{ kind: 'payLife', amount: 2 }] },
};
const pump = (filter: ObjectFilter): Ability => ({
  kind: 'static',
  static: {
    kind: 'modifyPt',
    subject: { kind: 'filter', filter },
    power: 1,
    toughness: 1,
  },
});
const OF_TYPE: ObjectFilter = { types: ['creature'], controller: 'you', chosenType: true };
const OF_COLOR: ObjectFilter = { types: ['creature'], controller: 'you', chosenColor: true };

function enchantment(...abilities: Ability[]): CardDefinition {
  return singleFaceCard({
    name: 'SYNTHETIC Validation Probe',
    manaCost: ['1'],
    types: ['enchantment'],
    colors: [],
    colorIdentity: [],
    oracleText: '',
    abilities,
  });
}
const issues = (c: CardDefinition) => validateCard(c).map((i) => `${i.path}: ${i.message}`);

describe('the nodes are in the registry', () => {
  test('asEntersChoose, setTypes and the chosen filters are supported features', () => {
    expect(SUPPORTED_FEATURES.replacementKinds).toContain('asEntersChoose');
    expect(SUPPORTED_FEATURES.staticKinds).toContain('setTypes');
    expect(isFeatureSupported('replacement:asEntersChoose')).toBe(true);
    expect(isFeatureSupported('static:setTypes')).toBe(true);
    expect(isFeatureSupported('selector:chosenType')).toBe(true);
    expect(isFeatureSupported('selector:chosenColor')).toBe(true);
  });
});

describe('a card that chooses and reads its choice is valid and supported', () => {
  test('type and color lords, the chosen-type cost reducer and trigger, and the type static', () => {
    for (const name of [
      'SYNTHETIC Rally Banner',
      'SYNTHETIC Hue Banner',
      'SYNTHETIC Banner Captain',
      'SYNTHETIC Shifting Captain',
      'SYNTHETIC Hue Captain',
      'SYNTHETIC Tribal Land',
      'SYNTHETIC Tribal Discount',
      'SYNTHETIC Tribal Scout',
      'SYNTHETIC Raise Dead',
    ]) {
      const card = SYNTHETIC_CARDS[name] as CardDefinition;
      expect(validateCard(card), name).toEqual([]);
    }
  });

  test('a choice nothing reads is allowed', () => {
    expect(issues(enchantment(CHOOSE_TYPE))).toEqual([]);
  });

  test('a token that chooses and reads its own choice is valid (a copy of such a permanent is too)', () => {
    const token = singleFaceCard({
      name: 'SYNTHETIC Validation Probe',
      manaCost: ['1'],
      types: ['sorcery'],
      colors: [],
      colorIdentity: [],
      oracleText: '',
      spell: {
        effect: {
          kind: 'createToken',
          count: 1,
          token: {
            kind: 'custom',
            definition: {
              name: 'Chooser',
              supertypes: [],
              types: ['creature'],
              subtypes: ['Elf'],
              colors: [],
              manaCost: null,
              power: 1,
              toughness: 1,
              loyalty: null,
              defense: null,
              oracleText: '',
              abilities: [CHOOSE_TYPE, pump({ ...OF_TYPE, other: true })],
            },
          },
        },
      },
    });
    expect(issues(token)).toEqual([]);
  });
});

describe('a reference needs its choice (CR 607.2d)', () => {
  test('"of the chosen type" without choosing a type is refused', () => {
    expect(issues(enchantment(pump(OF_TYPE)))).toEqual([
      'faces[0]: it refers to the chosen creature type but does not choose one as it enters (CR 607.2d)',
    ]);
  });

  test('"of the chosen type" with a color choice is refused, and the other way round', () => {
    expect(issues(enchantment(CHOOSE_COLOR, pump(OF_TYPE)))).toHaveLength(1);
    expect(issues(enchantment(CHOOSE_TYPE, pump(OF_COLOR)))).toHaveLength(1);
    expect(issues(enchantment(CHOOSE_COLOR, pump(OF_COLOR)))).toEqual([]);
  });

  test('every place a filter can be read needs the choice too: a trigger, a spell text, a cost reduction', () => {
    const trigger: Ability = {
      kind: 'triggered',
      trigger: { kind: 'entersBattlefield', what: OF_TYPE },
      effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 1 },
    };
    expect(issues(enchantment(trigger))).toHaveLength(1);
    expect(issues(enchantment(CHOOSE_TYPE, trigger))).toEqual([]);
    const reduction: Ability = {
      kind: 'static',
      static: { kind: 'costReduction', spells: OF_TYPE, amount: 1 },
    };
    expect(issues(enchantment(reduction))).toHaveLength(1);
    // An instant has no way to choose: its target filter cannot read a choice.
    const spell = singleFaceCard({
      name: 'SYNTHETIC Validation Probe',
      manaCost: ['1'],
      types: ['instant'],
      colors: [],
      colorIdentity: [],
      oracleText: '',
      spell: {
        targets: [{ id: 't1', what: { kind: 'object', filter: OF_TYPE } }],
        effect: { kind: 'destroy', objects: { kind: 'target', id: 't1' } },
      },
    });
    expect(issues(spell)).toEqual([
      'faces[0]: it refers to the chosen creature type but does not choose one as it enters (CR 607.2d)',
    ]);
  });

  test('a reference inside an anyOf member counts', () => {
    expect(issues(enchantment(pump({ anyOf: [OF_TYPE, { types: ['land'] }] })))).toHaveLength(1);
  });

  test('a token that reads a choice it does not make is refused, whatever the card makes', () => {
    const token = singleFaceCard({
      name: 'SYNTHETIC Validation Probe',
      manaCost: ['1'],
      types: ['sorcery'],
      colors: [],
      colorIdentity: [],
      oracleText: '',
      spell: {
        effect: {
          kind: 'createToken',
          count: 1,
          token: {
            kind: 'custom',
            definition: {
              name: 'Reader',
              supertypes: [],
              types: ['enchantment'],
              subtypes: [],
              colors: [],
              manaCost: null,
              power: null,
              toughness: null,
              loyalty: null,
              defense: null,
              oracleText: '',
              abilities: [pump(OF_TYPE)],
            },
          },
        },
      },
    });
    expect(issues(token)).toEqual([
      'faces[0].spell.effect.token.definition: it refers to the chosen creature type but does not choose one as it enters (CR 607.2d)',
    ]);
  });
});

describe('the questions a permanent asks as it enters (CR 614.12)', () => {
  test('one question per face: two choices, or a choice and the shock land payment, are refused', () => {
    const two = issues(enchantment(CHOOSE_TYPE, CHOOSE_COLOR));
    expect(two).toEqual([
      'faces[0].abilities: at most one ability may ask a question as the permanent enters (a choice, or paying life to enter untapped)',
    ]);
    expect(issues(enchantment(CHOOSE_TYPE, SHOCK))).toHaveLength(1);
    expect(issues(enchantment(SHOCK))).toEqual([]);
  });

  test('only a permanent asks: an instant with the replacement is refused', () => {
    const instant = singleFaceCard({
      name: 'SYNTHETIC Validation Probe',
      manaCost: ['1'],
      types: ['instant'],
      colors: [],
      colorIdentity: [],
      oracleText: '',
      abilities: [CHOOSE_TYPE],
      spell: { effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 1 } },
    });
    expect(issues(instant)).toEqual([
      'faces[0].abilities: only a permanent can ask "As this enters, choose ..." (CR 614.12)',
    ]);
  });

  test('the choice must be a creature type or a color', () => {
    const bad: Ability = {
      kind: 'replacement',
      replacement: { kind: 'asEntersChoose', what: 'card name' as never },
    };
    expect(validateCardStructure(enchantment(bad)).map((i) => i.path)).toContain(
      'faces[0].abilities[0].replacement.what',
    );
  });
});

describe('the static "is the chosen type in addition to its other types"', () => {
  const setTypes = (subject: unknown, extra: object = {}): Ability =>
    ({
      kind: 'static',
      static: { kind: 'setTypes', subject, chosenType: true, additive: true, ...extra },
    }) as Ability;

  test('only the permanent itself, and only additive', () => {
    expect(validateAbility(setTypes({ kind: 'this' }))).toEqual([]);
    expect(
      validateAbility(setTypes({ kind: 'filter', filter: { types: ['creature'] } })),
    ).toHaveLength(1);
    expect(validateAbility(setTypes({ kind: 'attached' }))).toHaveLength(1);
    expect(validateAbility(setTypes({ kind: 'this' }, { additive: false }))).toHaveLength(1);
    expect(validateAbility(setTypes({ kind: 'this' }, { chosenType: false }))).toHaveLength(1);
  });

  test('it needs a creature type choice on the same card', () => {
    expect(issues(enchantment(setTypes({ kind: 'this' })))).toHaveLength(1);
    expect(issues(enchantment(CHOOSE_COLOR, setTypes({ kind: 'this' })))).toHaveLength(1);
    expect(issues(enchantment(CHOOSE_TYPE, setTypes({ kind: 'this' })))).toEqual([]);
  });
});

describe('the filter flags', () => {
  test('chosenType and chosenColor are flags that are true when present', () => {
    const wrong = pump({ chosenType: false as never });
    expect(validateAbility(wrong).map((i) => i.path)).toContain(
      'ability.static.subject.filter.chosenType',
    );
  });
});
