// Validation of the nodes of D-179 (the Korvold slice 4): the mana value of a spell as a trigger's amount, `cycled`, `colorsAmong`,
// `opponentsCantCastOnYourTurn` with its "attached" condition, `groupEntersUntapped`, `requireAttack`, `controlledBy` and
// `putFromBattlefieldThisTurn`. A node is executable (validateCard) only as the engine runs it.
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
const SUBJECT = { kind: 'triggerSubject' } as const;
const CYCLING: Ability = {
  kind: 'keyword',
  keyword: { kind: 'cycling', cost: [{ kind: 'mana', symbols: ['1'] }] },
};

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
function equipment(abilities: Ability[]): CardDefinition {
  return singleFaceCard({
    name: 'SYNTHETIC Validation Equipment',
    manaCost: ['1'],
    types: ['artifact'],
    subtypes: ['Equipment'],
    colors: [],
    colorIdentity: [],
    oracleText: '',
    abilities,
  });
}
function sorcery(effect: Effect, targets?: never): CardDefinition {
  return singleFaceCard({
    name: 'SYNTHETIC Validation Probe',
    manaCost: ['1'],
    types: ['sorcery'],
    colors: [],
    colorIdentity: [],
    oracleText: '',
    spell: { effect, ...(targets === undefined ? {} : { targets }) },
  });
}
const messages = (card: CardDefinition) => validateCard(card).map((i) => i.message);

describe('the mana value of the spell that caused a cast trigger (CR 202.3, 601.2i)', () => {
  const trigger = (amount: Effect extends never ? never : unknown): Ability =>
    ({
      kind: 'triggered',
      trigger: { kind: 'castSpell', filter: { stackKind: 'spell' }, by: 'opponent' },
      effect: { kind: 'gainLife', player: YOU, amount },
    }) as Ability;

  test('a cast trigger may read the mana value of its subject', () => {
    expect(validateCard(creature([trigger({ kind: 'manaValueOf', of: SUBJECT })]))).toEqual([]);
  });

  test('a spell has no power: the power of the spell is still refused', () => {
    expect(messages(creature([trigger({ kind: 'powerOf', of: SUBJECT })]))).toEqual([
      'the triggering object is a spell or ability here, not a permanent',
    ]);
  });

  test('an enters trigger reads the mana value of the permanent that entered, as before', () => {
    const entering: Ability = {
      kind: 'triggered',
      trigger: { kind: 'entersBattlefield', what: { types: ['creature'] } },
      effect: { kind: 'gainLife', player: YOU, amount: { kind: 'manaValueOf', of: SUBJECT } },
    };
    expect(validateCard(creature([entering]))).toEqual([]);
  });
});

describe('"When you cycle this card" (CR 702.29c)', () => {
  const cycled: Ability = {
    kind: 'triggered',
    trigger: { kind: 'cycled' },
    effect: { kind: 'gainLife', player: YOU, amount: 1 },
  };

  test('it needs a face with Cycling or typecycling', () => {
    expect(validateCard(creature([CYCLING, cycled]))).toEqual([]);
    expect(messages(creature([cycled]))).toEqual([
      '"when you cycle this card" needs a face with Cycling or typecycling',
    ]);
  });

  test('a card does not write that its own discard is a cycling', () => {
    const channel: Ability = {
      kind: 'activated',
      cost: [{ kind: 'discardThis', cycling: true }],
      effect: { kind: 'gainLife', player: YOU, amount: 1 },
      functionsIn: 'hand',
    };
    expect(messages(creature([channel]))).toEqual([
      'cycling is written by the engine for Cycling and typecycling',
    ]);
  });

  test('the feature is listed', () => {
    expect(isFeatureSupported('trigger:cycled')).toBe(true);
  });
});

describe('"for each color among permanents you control" (CR 105.2)', () => {
  const pump = (amount: unknown): Ability =>
    ({
      kind: 'static',
      static: {
        kind: 'modifyPt',
        subject: { kind: 'attached' },
        power: amount,
        toughness: amount,
      },
    }) as Ability;

  test('a static +N/+N may count the colors of the permanents a filter names', () => {
    expect(
      validateCard(equipment([pump({ kind: 'colorsAmong', filter: { controller: 'you' } })])),
    ).toEqual([]);
  });

  test('only the battlefield, and nothing a layer 7 effect could change', () => {
    expect(
      messages(
        equipment([
          pump({ kind: 'colorsAmong', filter: { controller: 'you', zone: 'graveyard' } }),
        ]),
      ),
    ).toHaveLength(2);
    expect(
      messages(
        equipment([
          pump({
            kind: 'colorsAmong',
            filter: { controller: 'you', power: { cmp: 'atLeast', value: 2 } },
          }),
        ]),
      ),
    ).toHaveLength(2);
  });

  test('a characteristic-defining ability counts objects, not colors', () => {
    const cda: Ability = {
      kind: 'static',
      static: {
        kind: 'characteristicPt',
        power: { kind: 'colorsAmong', filter: { controller: 'you' } },
      },
    } as unknown as Ability;
    expect(messages(creature([cda]))).toContain(
      'a characteristic-defining ability counts objects, not colors',
    );
  });

  test('the feature is listed', () => {
    expect(isFeatureSupported('amount:colorsAmong')).toBe(true);
  });
});

describe('"Your opponents can\'t cast spells during your turn." with "as long as this Equipment is attached to a creature"', () => {
  const seal = (condition?: Ability extends never ? never : unknown): Ability =>
    ({
      kind: 'static',
      static: { kind: 'opponentsCantCastOnYourTurn' },
      ...(condition === undefined ? {} : { condition }),
    }) as Ability;

  test('the condition reads what this permanent is attached to', () => {
    expect(
      validateCard(
        equipment([
          seal({
            kind: 'objectMatches',
            of: { kind: 'attached' },
            filter: { types: ['creature'] },
          }),
        ]),
      ),
    ).toEqual([]);
    expect(validateCard(equipment([seal()]))).toEqual([]);
  });

  test('objectMatches reads only what the permanent is attached to, not a target or the moved object', () => {
    expect(
      messages(
        equipment([
          seal({ kind: 'objectMatches', of: { kind: 'moved' }, filter: { types: ['creature'] } }),
        ]),
      ),
    ).toEqual([
      "a static ability's condition reads the permanent it is attached to (attached), not another object",
    ]);
  });

  test('a static ability that changes types or colors may not read what it is attached to', () => {
    const colors: Ability = {
      kind: 'static',
      static: { kind: 'setColors', subject: THIS, colors: ['R'] },
      condition: {
        kind: 'objectMatches',
        of: { kind: 'attached' },
        filter: { types: ['creature'] },
      },
    } as Ability;
    expect(messages(equipment([colors]))).toHaveLength(1);
  });

  test('the feature is listed', () => {
    expect(isFeatureSupported('static:opponentsCantCastOnYourTurn')).toBe(true);
  });
});

describe('"Lands you control enter untapped." (CR 614.12)', () => {
  const replacement = (what: unknown): Ability =>
    ({ kind: 'replacement', replacement: { kind: 'groupEntersUntapped', what } }) as Ability;

  test('a filter for the permanent that enters', () => {
    expect(
      validateCard(
        singleFaceCard({
          name: 'SYNTHETIC Validation Hall',
          manaCost: ['1'],
          types: ['enchantment'],
          colors: [],
          colorIdentity: [],
          oracleText: '',
          abilities: [replacement({ types: ['land'], controller: 'you' })],
        }),
      ),
    ).toEqual([]);
  });

  test('it is not on the battlefield yet: no zone, owner or tapped', () => {
    for (const what of [{ zone: 'battlefield' }, { tapped: true }]) {
      expect(
        validateCard(
          singleFaceCard({
            name: 'SYNTHETIC Validation Hall',
            manaCost: ['1'],
            types: ['enchantment'],
            colors: [],
            colorIdentity: [],
            oracleText: '',
            abilities: [replacement(what)],
          }),
        ).length,
      ).toBeGreaterThan(0);
    }
  });

  test('the feature is listed', () => {
    expect(isFeatureSupported('replacement:groupEntersUntapped')).toBe(true);
  });
});

describe('a requirement on a group of creatures (CR 508.1d, 611.2c)', () => {
  const require = (over: Record<string, unknown> = {}): Effect =>
    ({
      kind: 'requireAttack',
      creatures: { types: ['creature'], controller: 'opponent' },
      duration: 'untilYourNextTurn',
      ...over,
    }) as Effect;

  test('creatures by type and controller, until end of turn or until your next turn', () => {
    expect(validateCard(sorcery(require()))).toEqual([]);
    expect(
      validateCard(sorcery(require({ duration: 'untilEndOfTurn', awayFromYou: true }))),
    ).toEqual([]);
  });

  test('no zone, no combat, no other duration', () => {
    expect(messages(sorcery(require({ creatures: { zone: 'graveyard' } })))).toHaveLength(1);
    expect(messages(sorcery(require({ creatures: { attacking: true } })))).toHaveLength(1);
    expect(messages(sorcery(require({ duration: 'permanent' })))).toHaveLength(1);
  });

  test('the features are listed', () => {
    expect(isFeatureSupported('effect:requireAttack')).toBe(true);
    expect(isFeatureSupported('duration:untilYourNextTurn')).toBe(true);
  });
});

describe('the players that control permanents, and the cards put into a graveyard from the battlefield', () => {
  test('controlledBy is read in the each selector of an effect, with the players it names', () => {
    const blast: Effect = {
      kind: 'dealDamage',
      amount: 2,
      to: {
        kind: 'each',
        filter: { types: ['creature'], controlledBy: { kind: 'target', id: 't1' } },
      },
    };
    const card = singleFaceCard({
      name: 'SYNTHETIC Validation Probe',
      manaCost: ['1'],
      types: ['sorcery'],
      colors: [],
      colorIdentity: [],
      oracleText: '',
      spell: { targets: [{ id: 't1', what: { kind: 'player', filter: 'any' } }], effect: blast },
    });
    expect(validateCard(card)).toEqual([]);
  });

  test('controlledBy is refused in a target slot and together with controller', () => {
    const slot = singleFaceCard({
      name: 'SYNTHETIC Validation Probe',
      manaCost: ['1'],
      types: ['sorcery'],
      colors: [],
      colorIdentity: [],
      oracleText: '',
      spell: {
        targets: [
          {
            id: 't1',
            what: { kind: 'object', filter: { controlledBy: { kind: 'you' } } },
          },
        ],
        effect: { kind: 'destroy', objects: { kind: 'target', id: 't1' } },
      },
    });
    expect(messages(slot)).toHaveLength(1);
    const both = sorcery({
      kind: 'dealDamage',
      amount: 1,
      to: { kind: 'each', filter: { controlledBy: YOU, controller: 'you' } },
    });
    expect(messages(both)).toHaveLength(1);
  });

  test('putFromBattlefieldThisTurn is for graveyard cards, not for a static ability', () => {
    const ok = singleFaceCard({
      name: 'SYNTHETIC Validation Probe',
      manaCost: ['1'],
      types: ['sorcery'],
      colors: [],
      colorIdentity: [],
      oracleText: '',
      spell: {
        targets: [
          {
            id: 't1',
            what: {
              kind: 'object',
              filter: { zone: 'graveyard', types: ['creature'], putFromBattlefieldThisTurn: true },
            },
          },
        ],
        effect: { kind: 'exile', objects: { kind: 'target', id: 't1' } },
      },
    });
    expect(validateCard(ok)).toEqual([]);
    const wrongZone = sorcery({
      kind: 'exile',
      objects: { kind: 'each', filter: { putFromBattlefieldThisTurn: true } },
    });
    expect(messages(wrongZone)).toEqual([
      "only a card in a graveyard was put there: the filter's zone is 'graveyard'",
    ]);
  });
});
