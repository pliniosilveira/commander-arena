// Validation of the AST nodes of ward, "counter unless its controller pays", the becomes-the-target
// trigger, `triggerSubject`, token copies and "becomes a copy" (D-007): a node is well-formed
// (validateAbility, validateCardStructure) and executable (validateCard) only as the engine runs it.
import { describe, expect, test } from 'vitest';
import {
  type Ability,
  type CardDefinition,
  type Cost,
  type Effect,
  type ObjectFilter,
  type Trigger,
  validateAbility,
  validateCard,
  validateCardStructure,
} from '../src/index';
import { singleFaceCard } from './dsl-helpers';

function card(types: ('creature' | 'land' | 'enchantment')[], ...abilities: Ability[]) {
  return singleFaceCard({
    name: 'SYNTHETIC Validation Probe',
    manaCost: types.includes('land') ? null : ['1'],
    types,
    ...(types.includes('enchantment') ? { subtypes: ['Aura'] } : {}),
    colors: [],
    colorIdentity: [],
    ...(types.includes('creature') ? { power: 1, toughness: 1 } : {}),
    oracleText: '',
    abilities,
  });
}
const creature = (...abilities: Ability[]) => card(['creature'], ...abilities);
const issues = (c: CardDefinition) => validateCard(c).map((i) => `${i.path}: ${i.message}`);
const structural = (a: Ability) => validateAbility(a).map((i) => `${i.path}: ${i.message}`);

const TWO: Cost[] = [{ kind: 'mana', symbols: ['2'] }];
const SUBJECT = { kind: 'triggerSubject' } as const;
const trig = (trigger: Trigger, effect: Effect): Ability => ({
  kind: 'triggered',
  trigger,
  effect,
});
const counterUnless = (objects: unknown, cost: Cost[] = TWO): Effect =>
  ({ kind: 'counterUnlessPays', objects, cost }) as Effect;
const copyToken = (object: unknown): Effect =>
  ({ kind: 'createToken', token: { kind: 'copyOf', object }, count: 1 }) as Effect;

const ENTERS: Trigger = { kind: 'entersBattlefield', what: { kind: 'this' } };
const CAST: Trigger = { kind: 'castSpell', filter: { stackKind: 'spell' }, by: 'any' };
const ATTACKS = (what: ObjectFilter): Trigger => ({ kind: 'attacks', what });
const TARGETED: Trigger = { kind: 'becomesTarget', what: { kind: 'this' }, by: 'opponent' };

describe('ward (CR 702.21a)', () => {
  test('mana and life costs are executable', () => {
    for (const cost of [
      TWO,
      [{ kind: 'payLife', amount: 3 }],
      [...TWO, { kind: 'payLife', amount: 2 }],
    ]) {
      const ward: Ability = { kind: 'keyword', keyword: { kind: 'ward', cost } as never };
      expect(issues(creature(ward)), JSON.stringify(cost)).toEqual([]);
    }
  });

  test('a cost the engine cannot pay when the ability resolves is not executable', () => {
    for (const cost of [
      [{ kind: 'sacrifice', what: { kind: 'this' } }],
      [{ kind: 'untap' }],
      [{ kind: 'mana', symbols: ['X'] }],
    ]) {
      const ward: Ability = { kind: 'keyword', keyword: { kind: 'ward', cost } as never };
      const found = issues(creature(ward));
      expect(found.length, JSON.stringify(cost)).toBeGreaterThan(0);
      expect(found[0], JSON.stringify(cost)).toContain('keyword.cost');
    }
  });

  test('the expanded ability is what a card would write: a becomesTarget trigger with counterUnlessPays', () => {
    const written = trig(TARGETED, counterUnless(SUBJECT));
    expect(issues(creature(written))).toEqual([]);
  });
});

describe('the becomes-the-target trigger', () => {
  test('it validates with a filter or this, and by you, an opponent or any', () => {
    for (const by of ['you', 'opponent', 'any'] as const) {
      expect(
        issues(
          creature(
            trig(
              { kind: 'becomesTarget', what: { kind: 'this' }, by },
              { kind: 'gainLife', player: { kind: 'you' }, amount: 1 },
            ),
          ),
        ),
        by,
      ).toEqual([]);
    }
    const filtered: Trigger = { kind: 'becomesTarget', what: { types: ['creature'] }, by: 'any' };
    expect(
      issues(creature(trig(filtered, { kind: 'gainLife', player: { kind: 'you' }, amount: 1 }))),
    ).toEqual([]);
  });

  test('an unknown controller of the targeting object is reported', () => {
    const bad = trig({ kind: 'becomesTarget', what: { kind: 'this' }, by: 'nobody' } as never, {
      kind: 'gainLife',
      player: { kind: 'you' },
      amount: 1,
    });
    expect(structural(bad)).toEqual([expect.stringContaining('trigger.by')]);
  });
});

describe('triggerSubject', () => {
  test('counterUnlessPays needs a trigger about a spell or ability', () => {
    // A cast trigger and a becomes-the-target trigger have one.
    expect(issues(creature(trig(CAST, counterUnless(SUBJECT))))).toEqual([]);
    expect(issues(creature(trig(TARGETED, counterUnless(SUBJECT))))).toEqual([]);
    // An enters trigger's subject is a permanent.
    expect(structural(trig(ENTERS, counterUnless(SUBJECT)))).toEqual([
      expect.stringContaining('permanent here'),
    ]);
    // An upkeep trigger has no subject; a spell has no trigger.
    expect(structural(trig({ kind: 'upkeep', whose: 'you' }, counterUnless(SUBJECT)))).toEqual([
      expect.stringContaining('whose trigger has a subject'),
    ]);
  });

  test('counterUnlessPays names the triggering object or a declared target, not this', () => {
    expect(structural(trig(TARGETED, counterUnless({ kind: 'this' })))).toEqual([
      expect.stringContaining('triggerSubject'),
    ]);
    // D-092: a target is allowed (see ast-references-validate.test.ts), but it must be declared.
    expect(structural(trig(TARGETED, counterUnless({ kind: 'target', id: 't1' })))).toEqual([
      expect.stringContaining('target "t1" is not declared'),
    ]);
  });

  test('a cost of counterUnlessPays is validated like any cost', () => {
    const found = structural(trig(TARGETED, counterUnless(SUBJECT, [])));
    expect(found).toEqual([expect.stringContaining('cost list is empty')]);
    // ... and only mana and life are executable.
    const sacrifice: Cost[] = [{ kind: 'sacrifice', what: { kind: 'this' } }];
    expect(issues(creature(trig(TARGETED, counterUnless(SUBJECT, sacrifice))))).toEqual([
      expect.stringContaining('cost "sacrifice" is not implemented'),
    ]);
  });

  test('the reference is refused anywhere else', () => {
    const destroy: Effect = { kind: 'destroy', objects: SUBJECT as never };
    expect(structural(trig(ATTACKS({ types: ['creature'] }), destroy))).toEqual([
      expect.stringContaining('only valid as the object of counterUnlessPays'),
    ]);
  });
});

describe('token copies (CR 707.2)', () => {
  test('a copy of this, of a target and of the triggering permanent validates', () => {
    const attack = ATTACKS({ types: ['creature'], controller: 'you' });
    expect(issues(creature(trig(attack, copyToken(SUBJECT))))).toEqual([]);
    expect(
      issues(
        creature({
          kind: 'activated',
          cost: TWO.map((c) => c),
          effect: copyToken({ kind: 'this' }),
        }),
      ),
    ).toEqual([]);
    const targeted: Ability = {
      kind: 'activated',
      cost: TWO,
      targets: [{ id: 't1', what: { kind: 'object', filter: { types: ['creature'] } } }],
      effect: copyToken({ kind: 'target', id: 't1' }),
    };
    expect(issues(creature(targeted))).toEqual([]);
  });

  test('the triggering object must be a permanent', () => {
    expect(structural(trig(CAST, copyToken(SUBJECT)))).toEqual([
      expect.stringContaining('spell or ability here'),
    ]);
  });

  test('only this, a target or the triggering permanent can be copied', () => {
    for (const object of [{ kind: 'thisSpell' }, { kind: 'moved' }]) {
      expect(structural(trig(ENTERS, copyToken(object))), JSON.stringify(object)).toEqual([
        expect.stringContaining('a copy is made from'),
      ]);
    }
  });

  test('a copy of something that could be an Aura is not executable (CR 303.4f); a land is (D-211, CR 614.12)', () => {
    const copying = (filter: ObjectFilter): Ability => ({
      kind: 'activated',
      cost: TWO,
      targets: [{ id: 't1', what: { kind: 'object', filter } }],
      effect: copyToken({ kind: 'target', id: 't1' }),
    });
    expect(issues(creature(copying({ types: ['creature'] })))).toEqual([]);
    expect(issues(creature(copying({ types: ['artifact'] })))).toEqual([]);
    expect(issues(creature(copying({ notTypes: ['land', 'enchantment'] })))).toEqual([]);
    // D-211: a token copy of a land asks what the land asks as it enters (`rules/enter-token.ts`).
    expect(issues(creature(copying({ types: ['land'] })))).toEqual([]);
    for (const filter of [
      {},
      { types: ['enchantment'] },
      { anyOf: [{ types: ['creature'] }, { types: ['enchantment'] }] },
    ] as ObjectFilter[]) {
      expect(issues(creature(copying(filter))).length, JSON.stringify(filter)).toBeGreaterThan(0);
    }
  });

  test('the triggering permanent of a landfall or a sacrifice trigger is judged the same way', () => {
    // A land that entered is a land (D-211): a copy of it asks what it asks.
    expect(issues(creature(trig({ kind: 'landfall' }, copyToken(SUBJECT))))).toEqual([]);
    expect(
      issues(creature(trig({ kind: 'permanentSacrificed', by: 'you' }, copyToken(SUBJECT)))).length,
    ).toBeGreaterThan(0);
    expect(
      issues(
        creature(
          trig(
            { kind: 'permanentSacrificed', by: 'you', filter: { types: ['creature'] } },
            copyToken(SUBJECT),
          ),
        ),
      ),
    ).toEqual([]);
  });

  test('a land or an Aura that copies itself is not executable', () => {
    const selfCopy = trig(ENTERS, copyToken({ kind: 'this' }));
    expect(issues(card(['land'], selfCopy))).toEqual([expect.stringContaining('land or an Aura')]);
    expect(issues(creature(selfCopy))).toEqual([]);
  });
});

describe('becomes a copy (CR 707.2, 613.2a)', () => {
  const becomes = (duration: unknown, of: unknown = { kind: 'target', id: 't2' }): Ability => ({
    kind: 'activated',
    cost: TWO,
    targets: [
      { id: 't1', what: { kind: 'object', filter: { types: ['creature'] } } },
      { id: 't2', what: { kind: 'object', filter: { types: ['creature'] } } },
    ],
    effect: {
      kind: 'becomeCopy',
      objects: { kind: 'target', id: 't1' },
      of,
      duration,
    } as Effect,
  });

  test('until end of turn is executable', () => {
    expect(issues(creature(becomes('untilEndOfTurn')))).toEqual([]);
    expect(structural(becomes('untilEndOfTurn'))).toEqual([]);
  });

  test('a duration the engine does not end is not executable, and an unknown one is malformed', () => {
    expect(issues(creature(becomes('permanent')))).toEqual([
      expect.stringContaining('duration "permanent" is not implemented'),
    ]);
    expect(structural(becomes('forever'))).toEqual([expect.stringContaining('duration')]);
  });

  test('what is copied is this, a target or the triggering permanent', () => {
    expect(structural(becomes('untilEndOfTurn', { kind: 'thisSpell' }))).toEqual([
      expect.stringContaining('a copy is made from'),
    ]);
    expect(structural(becomes('untilEndOfTurn', { kind: 'target', id: 't9' }))).toEqual([
      expect.stringContaining('not declared'),
    ]);
  });

  test('the copied permanent must be on the battlefield', () => {
    const fromGraveyard: Ability = {
      kind: 'activated',
      cost: TWO,
      targets: [
        { id: 't1', what: { kind: 'object', filter: { types: ['creature'] } } },
        { id: 't2', what: { kind: 'object', filter: { types: ['creature'], zone: 'graveyard' } } },
      ],
      effect: {
        kind: 'becomeCopy',
        objects: { kind: 'target', id: 't1' },
        of: { kind: 'target', id: 't2' },
        duration: 'untilEndOfTurn',
      },
    };
    expect(issues(creature(fromGraveyard))).toEqual([
      expect.stringContaining('only a permanent on the battlefield'),
    ]);
  });
});

describe('structural validity alone', () => {
  test('a card with the new nodes passes validateCardStructure', () => {
    const c = creature(trig(TARGETED, counterUnless(SUBJECT)));
    expect(validateCardStructure(c)).toEqual([]);
  });
});
