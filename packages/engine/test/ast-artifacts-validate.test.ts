// Validation of the nodes of D-139 that the Artifacts slice added late: `ObjectFilter.manaValueX` and `controllerDealtDamageBySource`,
// `oncePerTurn`, a `choose` selector of `tap`, `thisWay` `tapped`, `dealDamage.to` `attackedBy`, `reselectAttack` and the `duringStep`
// condition. A node is well-formed (validateCardStructure) only as the engine runs it.
import { describe, expect, test } from 'vitest';
import {
  type Ability,
  type CardDefinition,
  type Effect,
  type ObjectFilter,
  validateCard,
  validateCardStructure,
} from '../src/index';
import { singleFaceCard } from './dsl-helpers';

const THIS = { kind: 'this' } as const;

function creature(abilities: readonly Ability[]): CardDefinition {
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
const issues = (abilities: readonly Ability[]) =>
  validateCardStructure(creature(abilities)).map((i) => `${i.path}: ${i.message}`);
const runnable = (abilities: readonly Ability[]) =>
  validateCard(creature(abilities)).map((i) => `${i.path}: ${i.message}`);

const destroyEach = (filter: ObjectFilter): Effect => ({
  kind: 'destroy',
  objects: { kind: 'each', filter },
});
const activated = (
  cost: Extract<Ability, { kind: 'activated' }>['cost'],
  effect: Effect,
  extra: Partial<Extract<Ability, { kind: 'activated' }>> = {},
): Ability => ({ kind: 'activated', cost, effect, ...extra });
const X_COST = [{ kind: 'mana', symbols: ['X'] }] as const;
const ONE = [{ kind: 'mana', symbols: ['1'] }] as const;

describe('manaValueX (CR 202.3, 107.3a)', () => {
  test('is read with an X in the cost', () => {
    expect(issues([activated(X_COST, destroyEach({ manaValueX: true }))])).toEqual([]);
  });

  test('needs an X in the ability', () => {
    expect(issues([activated(ONE, destroyEach({ manaValueX: true }))])).toEqual([
      'faces[0].abilities[0].effect.objects.filter.manaValueX: mana value X is used but nothing in this ability has an X',
    ]);
  });

  test('is a flag', () => {
    expect(
      issues([activated(X_COST, destroyEach({ manaValueX: false as unknown as true }))]),
    ).toEqual(['faces[0].abilities[0].effect.objects.filter.manaValueX: manaValueX must be true']);
  });
});

describe('controllerDealtDamageBySource (CR 510.2)', () => {
  test('is read in the each selector of an ability', () => {
    expect(issues([activated(ONE, destroyEach({ controllerDealtDamageBySource: true }))])).toEqual(
      [],
    );
  });

  test('is refused in a static ability, which cannot read the game that way', () => {
    const lord: Ability = {
      kind: 'static',
      static: {
        kind: 'modifyPt',
        subject: { kind: 'filter', filter: { controllerDealtDamageBySource: true } },
        power: 1,
        toughness: 1,
      },
    };
    expect(runnable([lord]).some((m) => m.includes('controllerDealtDamageBySource'))).toBe(true);
  });

  test('is refused as a target slot filter (it names no source ability to read)', () => {
    const triggered: Ability = {
      kind: 'triggered',
      trigger: { kind: 'entersBattlefield', what: THIS },
      targets: [
        {
          id: 't1',
          what: { kind: 'object', filter: { controllerDealtDamageBySource: true } },
        },
      ],
      effect: { kind: 'destroy', objects: { kind: 'target', id: 't1' } },
    };
    expect(issues([triggered]).length).toBeGreaterThan(0);
  });
});

describe('oncePerTurn (CR 602.5b)', () => {
  test('is a flag of an activated ability', () => {
    expect(
      runnable([
        activated(ONE, { kind: 'draw', player: { kind: 'you' }, count: 1 }, { oncePerTurn: true }),
      ]),
    ).toEqual([]);
  });
});

describe('tap with a choose selector (CR 701.26a)', () => {
  const tap = (objects: Extract<Effect, { kind: 'tap' }>['objects']): Ability =>
    activated([{ kind: 'tap' }], { kind: 'tap', objects });

  test('any number of untapped permanents you control', () => {
    expect(
      issues([
        tap({
          kind: 'choose',
          filter: { subtypes: ['Myr'], controller: 'you' },
          anyNumber: true,
        }),
      ]),
    ).toEqual([]);
  });

  test('the filter must say "you control" and may not say tapped', () => {
    expect(
      issues([tap({ kind: 'choose', filter: { subtypes: ['Myr'] }, anyNumber: true })]),
    ).toEqual([
      "faces[0].abilities[0].effect.objects.filter.controller: a choice of what to tap is among the permanents you control: set controller to 'you'",
    ]);
    expect(
      issues([
        tap({
          kind: 'choose',
          filter: { controller: 'you', tapped: false },
          count: 1,
        }),
      ]),
    ).toEqual([
      'faces[0].abilities[0].effect.objects.filter.tapped: a tap choice is among untapped permanents: leave tapped out',
    ]);
  });

  test('anyNumber has no count', () => {
    expect(
      issues([tap({ kind: 'choose', filter: { controller: 'you' }, anyNumber: true, count: 2 })]),
    ).toEqual([
      'faces[0].abilities[0].effect.objects.count: any number of permanents has no count',
    ]);
  });
});

describe('thisWay tapped needs a tap before it', () => {
  test('after a tap effect it reads what was tapped', () => {
    const ability: Ability = activated([{ kind: 'tap' }], {
      kind: 'sequence',
      effects: [
        {
          kind: 'tap',
          objects: { kind: 'choose', filter: { controller: 'you' }, anyNumber: true },
        },
        { kind: 'gainLife', player: { kind: 'you' }, amount: { kind: 'thisWay', what: 'tapped' } },
      ],
    });
    expect(issues([ability])).toEqual([]);
  });

  test('alone it reads nothing', () => {
    const ability: Ability = activated([{ kind: 'tap' }], {
      kind: 'gainLife',
      player: { kind: 'you' },
      amount: { kind: 'thisWay', what: 'tapped' },
    });
    expect(issues([ability])).toEqual([
      'faces[0].abilities[0].effect.amount: thisWay "tapped" needs a tap effect before it in the same sequence',
    ]);
  });
});

describe('dealDamage to attackedBy and reselectAttack (CR 508.1b, 508.7)', () => {
  test('the creature is this permanent', () => {
    const ability: Ability = {
      kind: 'triggered',
      trigger: { kind: 'attacks', what: THIS },
      effect: { kind: 'dealDamage', amount: 1, to: { kind: 'attackedBy', of: THIS } },
    };
    expect(issues([ability])).toEqual([]);
  });

  test('reselectAttack names an attacking creature through a target', () => {
    const ability: Ability = {
      kind: 'triggered',
      trigger: { kind: 'entersBattlefield', what: THIS },
      targets: [
        {
          id: 't1',
          what: { kind: 'object', filter: { types: ['creature'], attacking: true } },
        },
      ],
      effect: { kind: 'reselectAttack', objects: { kind: 'target', id: 't1' } },
    };
    expect(issues([ability])).toEqual([]);
  });
});

describe('duringStep', () => {
  const when = (step: string): Ability => ({
    kind: 'triggered',
    trigger: { kind: 'entersBattlefield', what: THIS },
    interveningIf: { kind: 'duringStep', step: step as 'declareAttackers' },
    effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
  });

  test('a combat step', () => {
    expect(runnable([when('declareAttackers')])).toEqual([]);
  });

  test('another step is refused', () => {
    expect(issues([when('upkeep')])).toEqual([
      'faces[0].abilities[0].interveningIf.step: unknown combat step "upkeep"',
    ]);
  });
});
