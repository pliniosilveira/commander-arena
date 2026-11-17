// A resolving spell may grant a creature a triggered ability until end of turn (CR 611.2a, 613.1f).
// The granted dies ability follows the card into the graveyard and returns it under its owner's control.
// Cards are SYNTHETIC.
import { describe, test } from 'vitest';
import type { Effect, ObjectRef, TargetSpec } from '../src/ast/types';
import { singleFace } from '../src/cards/fixtures/helpers';
import { scenario } from '../src/testing/index';

const GRANT = 'SYNTHETIC Temporary Return';
const DESTROY = 'SYNTHETIC Destroy Target';
const BEAR = 'Grizzly Bears';
const T1: ObjectRef = { kind: 'target', id: 't1' };
const TARGET: readonly TargetSpec[] = [
  { id: 't1', what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } } },
];

const grant = singleFace({
  name: GRANT,
  manaCost: null,
  types: ['instant'],
  colors: [],
  colorIdentity: [],
  oracleText: 'SYNTHETIC: Target creature gains a death return ability until end of turn.',
  spell: {
    targets: TARGET,
    effect: {
      kind: 'grantAbility',
      objects: T1,
      abilities: [
        {
          kind: 'triggered',
          trigger: { kind: 'dies', what: { kind: 'this' } },
          effect: {
            kind: 'moveToZone',
            objects: { kind: 'thisCard' },
            to: 'battlefield',
            controller: 'owner',
            tapped: true,
            withCounters: { counter: '+1/+1', count: 1 },
          },
        },
      ],
      duration: 'untilEndOfTurn',
    },
  },
});

const destroy = singleFace({
  name: DESTROY,
  manaCost: null,
  types: ['instant'],
  colors: [],
  colorIdentity: [],
  oracleText: 'SYNTHETIC: Destroy target creature.',
  spell: { targets: TARGET, effect: { kind: 'destroy', objects: T1 } satisfies Effect },
});

describe('a resolving spell grants a triggered ability until end of turn', () => {
  test('the ability triggers on the creature dying and returns its card tapped', () => {
    const g = scenario()
      .define(grant)
      .define(destroy)
      .seat(0)
      .hand(GRANT, DESTROY)
      .battlefield(BEAR)
      .library('Plains', 'Island')
      .seat(1)
      .library('Plains', 'Island')
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

    g.act(0).cast(GRANT, { targets: [BEAR], pay: true });
    g.passAll();
    g.act(0).cast(DESTROY, { targets: [BEAR], pay: true });
    g.passAll();

    g.expect.zone(BEAR, 'battlefield', { seat: 0 });
    g.expect.tapped(BEAR, true);
    g.expect.counters(BEAR, { '+1/+1': 1 });
  });
});
