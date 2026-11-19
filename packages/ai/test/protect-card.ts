// SYNTHETIC protection spell for the HeuristicAgent tests: the shape of a one-mana protection instant
// ("Target permanent you control gains hexproof and indestructible until end of turn. You gain 2 life.")
// with the reminder text in parentheses that the real card carries.
import type { CardDefinition } from '@commander-arena/engine';

const T1 = { kind: 'target', id: 't1' } as const;
const END = 'untilEndOfTurn' as const;

export const PROTECT_TEXT =
  'Target permanent you control gains hexproof and indestructible until end of turn. You gain 2 life. ' +
  "(A permanent with hexproof and indestructible can't be the target of spells or abilities your opponents control. " +
  'Damage and effects that say "destroy" don\'t destroy it.)';

/** SYNTHETIC: the shape of a one-mana protection instant, with its reminder text. */
export const SAFE: CardDefinition = {
  oracleId: null,
  name: 'SYNTHETIC Safekeeping',
  layout: 'normal',
  faces: [
    {
      name: 'SYNTHETIC Safekeeping',
      manaCost: ['G'],
      supertypes: [],
      types: ['instant'],
      subtypes: [],
      colors: ['G'],
      power: null,
      toughness: null,
      loyalty: null,
      defense: null,
      oracleText: PROTECT_TEXT,
      abilities: [],
      spell: {
        targets: [
          {
            id: 't1',
            what: { kind: 'object', filter: { zone: 'battlefield', controller: 'you' } },
          },
        ],
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'grantKeyword', objects: T1, keyword: { kind: 'hexproof' }, duration: END },
            {
              kind: 'grantKeyword',
              objects: T1,
              keyword: { kind: 'indestructible' },
              duration: END,
            },
            { kind: 'gainLife', player: { kind: 'you' }, amount: 2 },
          ],
        },
      },
    },
  ],
  colorIdentity: ['G'],
  support: 'supported',
};
