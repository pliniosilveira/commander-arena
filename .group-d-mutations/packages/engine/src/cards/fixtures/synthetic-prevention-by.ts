/**
 * SYNTHETIC CARDS FOR "PREVENT ALL COMBAT DAMAGE THAT WOULD BE DEALT THIS TURN BY NON-SPIDER CREATURES". NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of D-145 (the Dinosaurs slice): a spell that creates a Spider token for each creature attacking its controller and
 * prevents all combat damage dealt by creatures that are not Spiders (`preventDamage.byFilter`), a spell that prevents the combat damage
 * of creatures with power 4 or greater, and one that prevents damage dealt by creatures its controller does not control. Names start with
 * "SYNTHETIC "; oracleId is null. The text describes what the AST does; it is not Oracle text, and none of these is the definition of a real
 * card.
 */
import type { Effect, ObjectFilter } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';
import { SPIDER_TOKEN } from './synthetic-amounts';

const prevent = (
  scope: 'all' | 'combat' | 'noncombat',
  byFilter: ObjectFilter,
): Extract<Effect, { kind: 'preventDamage' }> => ({
  kind: 'preventDamage',
  scope,
  amount: 'all',
  to: { kind: 'any' },
  byFilter,
  duration: 'untilEndOfTurn',
});

const instant = (name: string, words: string, effect: Effect): CardDefinition =>
  singleFace({
    name,
    manaCost: ['2', 'G'],
    types: ['instant'],
    colors: ['G'],
    colorIdentity: ['G'],
    oracleText: words,
    spell: { effect },
  });

export const SYNTHETIC_PREVENTION_BY_LIST: readonly CardDefinition[] = [
  instant(
    'SYNTHETIC Spider Fog',
    'Create X 1/2 green Spider creature tokens with reach, where X is the number of creatures attacking you. Prevent all combat damage that would be dealt this turn by non-Spider creatures.',
    {
      kind: 'sequence',
      effects: [
        {
          kind: 'createToken',
          token: { kind: 'custom', definition: SPIDER_TOKEN },
          count: { kind: 'countOf', filter: { types: ['creature'], attackingYou: true } },
        },
        prevent('combat', { types: ['creature'], notSubtypes: ['Spider'] }),
      ],
    },
  ),
  instant(
    'SYNTHETIC Big Fog',
    'Prevent all combat damage that would be dealt this turn by creatures with power 4 or greater.',
    prevent('combat', { types: ['creature'], power: { cmp: 'atLeast', value: 4 } }),
  ),
  instant(
    'SYNTHETIC Their Fog',
    'Prevent all damage that would be dealt this turn by creatures you do not control.',
    prevent('all', { types: ['creature'], controller: 'opponent' }),
  ),
];
