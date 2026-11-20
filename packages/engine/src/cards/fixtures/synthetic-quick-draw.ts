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

const INSTANT_OR_SORCERY: ObjectFilter = {
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
  // "{T}: The next instant or sorcery spell you cast this turn costs {X} less to cast, where X is the number of Wizards you control as this ability resolves." (a 1/2 Wizard)
  singleFace({
    name: 'SYNTHETIC Discount Wizard',
    manaCost: ['U', 'R'],
    types: ['creature'],
    subtypes: ['Human', 'Wizard'],
    colors: ['U', 'R'],
    colorIdentity: ['U', 'R'],
    power: 1,
    toughness: 2,
    oracleText:
      '{T}: The next instant or sorcery spell you cast this turn costs {X} less to cast, where X is the number of Wizards you control as this ability resolves.',
    abilities: [
      {
        kind: 'activated',
        cost: [{ kind: 'tap' }],
        effect: {
          kind: 'nextSpellModifier',
          spells: INSTANT_OR_SORCERY,
          lessGeneric: {
            kind: 'countOf',
            filter: { zone: 'battlefield', controller: 'you', subtypes: ['Wizard'] },
          },
        },
      },
    ],
  }),
  // "{T}: The next instant or sorcery spell you cast this turn has storm." (a 2/2)
  singleFace({
    name: 'SYNTHETIC Storm Granter',
    manaCost: ['R'],
    types: ['creature'],
    subtypes: ['Human'],
    colors: ['R'],
    colorIdentity: ['R'],
    power: 2,
    toughness: 2,
    oracleText: '{T}: The next instant or sorcery spell you cast this turn has storm.',
    abilities: [
      {
        kind: 'activated',
        cost: [{ kind: 'tap' }],
        effect: {
          kind: 'nextSpellModifier',
          spells: INSTANT_OR_SORCERY,
          grants: 'storm',
        },
      },
    ],
  }),
  // "{T}: The next instant spell and the next sorcery spell you cast this turn each have cascade." (a 2/2)
  singleFace({
    name: 'SYNTHETIC Cascade Granter',
    manaCost: ['R'],
    types: ['creature'],
    subtypes: ['Human'],
    colors: ['R'],
    colorIdentity: ['R'],
    power: 2,
    toughness: 2,
    oracleText:
      '{T}: The next instant spell and the next sorcery spell you cast this turn each have cascade.',
    abilities: [
      {
        kind: 'activated',
        cost: [{ kind: 'tap' }],
        effect: {
          kind: 'sequence',
          effects: [
            {
              kind: 'nextSpellModifier',
              spells: { types: ['instant'] },
              grants: 'cascade',
            },
            {
              kind: 'nextSpellModifier',
              spells: { types: ['sorcery'] },
              grants: 'cascade',
            },
          ],
        },
      },
    ],
  }),
];
