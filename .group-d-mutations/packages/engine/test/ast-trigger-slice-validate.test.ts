// Validation of the trigger slice of D-111: the step, drawn, dealsCombatDamage and leavesBattlefield
// triggers, the `attached` subject, the `opponent` caster, the power, toughness and mana value
// comparisons of an ObjectFilter, and the `unlessPays` effect: well-formed (validateCardStructure) and
// executable (validateCard) only as the engine runs them.
import { describe, expect, test } from 'vitest';
import { SYNTHETIC_TRIGGER_MORE_LIST } from '../src/cards/fixtures/synthetic-triggers-more';
import {
  type Ability,
  type CardDefinition,
  type Effect,
  type ObjectFilter,
  SUPPORTED_FEATURES,
  type Trigger,
  validateCard,
  validateCardStructure,
} from '../src/index';
import { singleFaceCard } from './dsl-helpers';

const gain: Effect = { kind: 'gainLife', player: { kind: 'you' }, amount: 1 };

function permanentWith(...abilities: Ability[]): CardDefinition {
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
const triggered = (trigger: Trigger, effect: Effect = gain): Ability => ({
  kind: 'triggered',
  trigger,
  effect,
});
const messages = (card: CardDefinition) => validateCard(card).map((i) => i.message);
const paths = (card: CardDefinition) => validateCard(card).map((i) => i.path);

describe('the cards of the slice', () => {
  test('every fixture validates, and is marked supported', () => {
    for (const card of SYNTHETIC_TRIGGER_MORE_LIST) {
      expect(validateCard(card), card.name).toEqual([]);
      expect(card.support, card.name).toBe('supported');
    }
  });

  test('the registry lists the new kinds, the effect and the selectors', () => {
    expect(SUPPORTED_FEATURES.triggerKinds).toEqual(
      expect.arrayContaining(['step', 'drawn', 'dealsCombatDamage', 'leavesBattlefield']),
    );
    expect(SUPPORTED_FEATURES.effectKinds).toContain('unlessPays');
    expect(SUPPORTED_FEATURES.selectorKinds).toEqual(
      expect.arrayContaining(['power', 'toughness', 'manaValue', 'attached']),
    );
  });
});

describe('triggers', () => {
  test('every shape validates', () => {
    const triggers: Trigger[] = [
      { kind: 'step', step: 'beginCombat', whose: 'you' },
      { kind: 'step', step: 'draw', whose: 'opponent' },
      { kind: 'step', step: 'main2', whose: 'each' },
      { kind: 'drawn', who: 'you' },
      { kind: 'drawn', who: 'opponent', nth: 2 },
      { kind: 'dealsCombatDamage', what: { kind: 'this' }, to: 'player' },
      { kind: 'dealsCombatDamage', what: { types: ['creature'] }, to: 'opponent' },
      { kind: 'dealsCombatDamage', what: { kind: 'attached' }, to: 'any' },
      {
        kind: 'dealsCombatDamage',
        what: { kind: 'this' },
        to: 'creature',
        filter: { power: { cmp: 'atLeast', value: 3 } },
      },
      { kind: 'leavesBattlefield', what: { kind: 'this' } },
      { kind: 'leavesBattlefield', what: { kind: 'attached' }, to: 'exile' },
      { kind: 'leavesBattlefield', what: { types: ['creature'] }, to: 'command' },
      { kind: 'dies', what: { kind: 'attached' } },
      { kind: 'attacks', what: { kind: 'attached' } },
      { kind: 'becomesTapped', what: { kind: 'attached' } },
      { kind: 'castSpell', filter: { stackKind: 'spell' }, by: 'opponent' },
      {
        kind: 'entersBattlefield',
        what: { types: ['creature'], power: { cmp: 'atLeast', value: 4 } },
      },
    ];
    for (const t of triggers)
      expect(validateCard(permanentWith(triggered(t))), JSON.stringify(t)).toEqual([]);
  });

  test('malformed triggers are reported with their path', () => {
    const bad: [Trigger, string][] = [
      [
        { kind: 'step', step: 'untap', whose: 'you' } as never,
        'faces[0].abilities[0].trigger.step',
      ],
      [{ kind: 'step', step: 'draw', whose: 'me' } as never, 'faces[0].abilities[0].trigger.whose'],
      [{ kind: 'drawn', who: 'nobody' } as never, 'faces[0].abilities[0].trigger.who'],
      [{ kind: 'drawn', who: 'you', nth: 0 }, 'faces[0].abilities[0].trigger.nth'],
      [{ kind: 'drawn', who: 'you', nth: 1.5 }, 'faces[0].abilities[0].trigger.nth'],
      [
        { kind: 'dealsCombatDamage', what: { kind: 'this' }, to: 'planeswalker' } as never,
        'faces[0].abilities[0].trigger.to',
      ],
      [
        {
          kind: 'dealsCombatDamage',
          what: { kind: 'this' },
          to: 'player',
          filter: { types: ['creature'] },
        },
        'faces[0].abilities[0].trigger.filter',
      ],
      [
        { kind: 'leavesBattlefield', what: { kind: 'this' }, to: 'battlefield' },
        'faces[0].abilities[0].trigger.to',
      ],
      [
        { kind: 'leavesBattlefield', what: { kind: 'this' }, to: 'stack' },
        'faces[0].abilities[0].trigger.to',
      ],
      [
        { kind: 'entersBattlefield', what: { kind: 'attached' } } as never,
        'faces[0].abilities[0].trigger.what',
      ],
      [
        { kind: 'castSpell', filter: {}, by: 'nobody' } as never,
        'faces[0].abilities[0].trigger.by',
      ],
    ];
    for (const [t, path] of bad) {
      expect(paths(permanentWith(triggered(t))), JSON.stringify(t)).toContain(path);
      expect(
        validateCardStructure(permanentWith(triggered(t))).length,
        JSON.stringify(t),
      ).toBeGreaterThan(0);
    }
  });

  test('an intervening "if" that counts permanents on a leaves trigger is refused (CR 603.10a)', () => {
    const card = permanentWith({
      kind: 'triggered',
      trigger: { kind: 'leavesBattlefield', what: { kind: 'this' } },
      interveningIf: {
        kind: 'controlsAtLeast',
        filter: { types: ['creature'] },
        count: 2,
      },
      effect: gain,
    });
    expect(messages(card)).toEqual([
      expect.stringContaining(
        'intervening "if" that counts permanents on a "leavesBattlefield" trigger',
      ),
    ]);
  });

  test('an intervening "if" with a power comparison validates on a step trigger', () => {
    const card = permanentWith({
      kind: 'triggered',
      trigger: { kind: 'step', step: 'upkeep', whose: 'you' },
      interveningIf: {
        kind: 'controlsAtLeast',
        filter: { types: ['creature'], power: { cmp: 'atLeast', value: 4 } },
        count: 1,
      },
      effect: gain,
    });
    expect(validateCard(card)).toEqual([]);
  });
});

describe('object filter comparisons', () => {
  const withFilter = (filter: ObjectFilter) =>
    permanentWith(triggered({ kind: 'entersBattlefield', what: filter }));

  test('a comparison needs a known cmp and a whole number', () => {
    expect(paths(withFilter({ power: { cmp: 'bigger', value: 2 } as never }))).toContain(
      'faces[0].abilities[0].trigger.what.power.cmp',
    );
    expect(paths(withFilter({ toughness: { cmp: 'atLeast', value: 1.5 } }))).toContain(
      'faces[0].abilities[0].trigger.what.toughness.value',
    );
    expect(paths(withFilter({ manaValue: { cmp: 'equal', value: '3' as never } }))).toContain(
      'faces[0].abilities[0].trigger.what.manaValue.value',
    );
    expect(paths(withFilter({ manaValue: { cmp: 'atMost', value: -1 } }))).toContain(
      'faces[0].abilities[0].trigger.what.manaValue.value',
    );
  });

  test('a negative power comparison is allowed, a negative mana value is not', () => {
    expect(validateCard(withFilter({ power: { cmp: 'atMost', value: -1 } }))).toEqual([]);
  });

  test('a comparison is allowed in a target slot, a condition, a static modifier and an anyOf member', () => {
    const slot = singleFaceCard({
      name: 'SYNTHETIC Validation Probe',
      manaCost: ['1'],
      types: ['instant'],
      colors: [],
      colorIdentity: [],
      oracleText: '',
      spell: {
        targets: [
          {
            id: 't1',
            what: {
              kind: 'object',
              filter: { anyOf: [{ types: ['creature'], power: { cmp: 'atLeast', value: 4 } }] },
            },
          },
        ],
        effect: { kind: 'destroy', objects: { kind: 'target', id: 't1' } },
      },
    });
    expect(validateCard(slot)).toEqual([]);
    const lord = permanentWith({
      kind: 'static',
      static: {
        kind: 'modifyPt',
        subject: { kind: 'filter', filter: { power: { cmp: 'atLeast', value: 4 } } },
        power: 1,
        toughness: 1,
      },
    });
    expect(validateCard(lord)).toEqual([]);
  });

  test('a power or toughness comparison in the subject of a keyword grant is refused, mana value is not', () => {
    const grant = (filter: ObjectFilter) =>
      permanentWith({
        kind: 'static',
        static: {
          kind: 'grantKeyword',
          subject: { kind: 'filter', filter },
          keyword: { kind: 'flying' },
        },
      });
    expect(messages(grant({ power: { cmp: 'atLeast', value: 4 } }))).toEqual([
      expect.stringContaining('power or toughness comparison in the subject of a "grantKeyword"'),
    ]);
    expect(messages(grant({ anyOf: [{ toughness: { cmp: 'atMost', value: 1 } }] }))).toEqual([
      expect.stringContaining('power or toughness comparison'),
    ]);
    expect(validateCard(grant({ manaValue: { cmp: 'atMost', value: 2 } }))).toEqual([]);
  });
});

describe('the unlessPays effect', () => {
  const payer = { kind: 'controllerOf', of: { kind: 'triggerSubject' } } as const;
  const unless = (over: Partial<Extract<Effect, { kind: 'unlessPays' }>> = {}): Effect => ({
    kind: 'unlessPays',
    player: payer,
    cost: [{ kind: 'mana', symbols: ['1'] }],
    effect: gain,
    ...over,
  });
  const cast: Trigger = { kind: 'castSpell', filter: { stackKind: 'spell' }, by: 'opponent' };

  test('validates with the triggering spell as the payer, optional or not', () => {
    expect(validateCard(permanentWith(triggered(cast, unless())))).toEqual([]);
    expect(validateCard(permanentWith(triggered(cast, unless({ optional: true }))))).toEqual([]);
  });

  test('validates with a plain player selector', () => {
    const card = permanentWith(
      triggered(
        { kind: 'step', step: 'upkeep', whose: 'opponent' },
        unless({ player: { kind: 'eachOpponent' } }),
      ),
    );
    expect(validateCard(card)).toEqual([]);
  });

  test("the triggering object's controller needs a trigger that has a subject", () => {
    const card = permanentWith(triggered({ kind: 'step', step: 'upkeep', whose: 'you' }, unless()));
    expect(messages(card)).toEqual([
      expect.stringContaining(
        "'triggerSubject' needs a triggered ability whose trigger has a subject",
      ),
    ]);
  });

  test('costs are held to the rules of Ward: mana, life and discarding, no X', () => {
    expect(messages(permanentWith(triggered(cast, unless({ cost: [{ kind: 'tap' }] }))))).toEqual([
      expect.stringContaining('cost "tap"'),
    ]);
    expect(
      messages(
        permanentWith(triggered(cast, unless({ cost: [{ kind: 'mana', symbols: ['X'] }] }))),
      ),
    ).toEqual([expect.stringContaining('X in the cost')]);
  });

  test('the effect it guards is validated too, and a bad flag is reported', () => {
    const badEffect = unless({
      effect: { kind: 'draw', player: { kind: 'you' }, count: 'two' as never },
    });
    expect(validateCardStructure(permanentWith(triggered(cast, badEffect))).length).toBeGreaterThan(
      0,
    );
    const badFlag = unless({ optional: false as never });
    expect(paths(permanentWith(triggered(cast, badFlag)))).toContain(
      'faces[0].abilities[0].effect.optional',
    );
  });

  test('"that spell\'s controller" is valid in other effects of such a trigger, and refused in a spell', () => {
    const loses = (selector: typeof payer): Effect => ({
      kind: 'loseLife',
      player: selector,
      amount: 1,
    });
    expect(validateCard(permanentWith(triggered(cast, loses(payer))))).toEqual([]);
    const spell = singleFaceCard({
      name: 'SYNTHETIC Validation Probe',
      manaCost: ['1'],
      types: ['instant'],
      colors: [],
      colorIdentity: [],
      oracleText: '',
      spell: { effect: loses(payer) },
    });
    expect(validateCardStructure(spell).length).toBeGreaterThan(0);
  });

  test('is flagged honestly when the card is marked unsupported: no feature issues', () => {
    const card = { ...permanentWith(triggered(cast, unless())), support: 'unsupported' as const };
    expect(validateCard(card)).toEqual(validateCardStructure(card));
  });
});
