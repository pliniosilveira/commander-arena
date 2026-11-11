/**
 * SYNTHETIC DAMAGE PREVENTION CARDS. NOT REAL MAGIC CARDS.
 *
 * Invented for the tests and the soak games of prevention shields (CR 615): "Prevent all combat
 * damage that would be dealt this turn", "... dealt to you", "... dealt to and dealt by target
 * creature", "Prevent the next 3 damage that would be dealt to any target this turn", "Prevent all
 * damage that would be dealt to creatures you control this turn" and the per-creature numeric
 * shield of CR 615.11. Names start with "SYNTHETIC "; oracleId is null. The text is what the AST
 * does, written the way Oracle text words these shapes; none of them copies a real card definition.
 */
import type { Effect, TargetSpec } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const END = 'untilEndOfTurn' as const;
const T1 = { kind: 'target', id: 't1' } as const;
const CREATURE_TARGET: TargetSpec = {
  id: 't1',
  what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
};
const ANY_TARGET: TargetSpec = { id: 't1', what: { kind: 'anyTarget' } };
const MY_CREATURES = { kind: 'each', filter: { types: ['creature'], controller: 'you' } } as const;

function instant(
  name: string,
  manaCost: string[],
  oracleText: string,
  effect: Effect,
  targets?: readonly TargetSpec[],
): CardDefinition {
  return singleFace({
    name,
    manaCost,
    types: ['instant'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText,
    spell: { ...(targets === undefined ? {} : { targets }), effect },
  });
}

export const SYNTHETIC_PREVENTION_LIST: readonly CardDefinition[] = [
  instant(
    'SYNTHETIC Fog Spell',
    ['W'],
    'Prevent all combat damage that would be dealt this turn.',
    {
      kind: 'preventDamage',
      scope: 'combat',
      amount: 'all',
      to: { kind: 'any' },
      duration: END,
    },
  ),
  instant(
    'SYNTHETIC Self Ward',
    ['1', 'W'],
    'Prevent all damage that would be dealt to you this turn.',
    { kind: 'preventDamage', scope: 'all', amount: 'all', to: { kind: 'you' }, duration: END },
  ),
  instant(
    'SYNTHETIC Quiet Fog',
    ['1', 'W'],
    'Prevent all noncombat damage that would be dealt this turn.',
    {
      kind: 'preventDamage',
      scope: 'noncombat',
      amount: 'all',
      to: { kind: 'any' },
      duration: END,
    },
  ),
  instant(
    'SYNTHETIC Standoff',
    ['1', 'W'],
    'Prevent all combat damage that would be dealt to and dealt by target creature this turn.',
    {
      kind: 'sequence',
      effects: [
        { kind: 'preventDamage', scope: 'combat', amount: 'all', to: T1, duration: END },
        {
          kind: 'preventDamage',
          scope: 'combat',
          amount: 'all',
          to: { kind: 'any' },
          by: T1,
          duration: END,
        },
      ],
    },
    [CREATURE_TARGET],
  ),
  instant(
    'SYNTHETIC Shield Three',
    ['W'],
    'Prevent the next 3 damage that would be dealt to any target this turn.',
    { kind: 'preventDamage', scope: 'all', amount: 3, to: T1, duration: END },
    [ANY_TARGET],
  ),
  instant(
    'SYNTHETIC Herd Shelter',
    ['1', 'W'],
    'Prevent all damage that would be dealt to creatures you control this turn.',
    { kind: 'preventDamage', scope: 'all', amount: 'all', to: MY_CREATURES, duration: END },
  ),
  instant(
    'SYNTHETIC Ward Circle',
    ['1', 'W'],
    'Prevent the next 1 damage that would be dealt to each creature you control this turn.',
    { kind: 'preventDamage', scope: 'all', amount: 1, to: MY_CREATURES, duration: END },
  ),
  instant(
    'SYNTHETIC Soften Blow',
    ['W'],
    'Prevent the next 2 combat damage that would be dealt to you this turn.',
    { kind: 'preventDamage', scope: 'combat', amount: 2, to: { kind: 'you' }, duration: END },
  ),
];
