/**
 * SYNTHETIC cards for the groups of the Quick Draw deck (issue 121) after Plot and Jump-start (`synthetic-jump-start.ts`). Names start with "SYNTHETIC "; oracleId is null. The text
 * describes what the AST does; it is not Oracle text, and none of these is the definition of a real card (the real ones are read from the golden corpus by the grammar and have the same
 * abilities).
 */
import type { ObjectFilter } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const INSTANT_OR_SORCERY_IN_YOUR_GRAVEYARD: ObjectFilter = {
  zone: 'graveyard',
  controller: 'you',
  anyOf: [{ types: ['instant'] }, { types: ['sorcery'] }],
};

export const SYNTHETIC_QUICK_DRAW_LIST: readonly CardDefinition[] = [
  // "This spell costs {2} less to cast for each different mana value among instant and sorcery cards in your graveyard." ({8}{U} sorcery: you gain 1 life)
  singleFace({
    name: 'SYNTHETIC Value Discount',
    manaCost: ['8', 'U'],
    types: ['sorcery'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText:
      'This spell costs {2} less to cast for each different mana value among instant and sorcery cards in your graveyard. You gain 1 life.',
    abilities: [
      {
        kind: 'static',
        static: {
          kind: 'costReduction',
          spells: { kind: 'this' },
          amount: {
            kind: 'multiple',
            factor: 2,
            of: {
              kind: 'differentManaValuesAmong',
              filter: INSTANT_OR_SORCERY_IN_YOUR_GRAVEYARD,
            },
          },
        },
      },
    ],
    spell: { effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 1 } },
  }),
];
