/**
 * Fandaniel, Telophoroi Ascian (issue 57). This card fixture uses only the Oracle text supplied in
 * the issue; Scryfall rulings and the Comprehensive Rules could not be independently checked in
 * this workspace.
 */
import type { ObjectFilter } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const INSTANT_OR_SORCERY: ObjectFilter = {
  anyOf: [{ types: ['instant'] }, { types: ['sorcery'] }],
};

export const FANDANIEL_FIXTURE: CardDefinition = singleFace({
  name: 'Fandaniel, Telophoroi Ascian',
  manaCost: ['4', 'B'],
  supertypes: ['legendary'],
  types: ['creature'],
  subtypes: ['Elder', 'Wizard'],
  colors: ['B'],
  colorIdentity: ['B'],
  power: 4,
  toughness: 5,
  oracleText:
    "Whenever you cast an instant or sorcery spell, surveil 1.\nAt the beginning of your end step, each opponent may sacrifice a nontoken creature of their choice. Each opponent who doesn't loses 2 life for each instant and sorcery card in your graveyard.",
  abilities: [
    {
      kind: 'triggered',
      trigger: {
        kind: 'castSpell',
        filter: { ...INSTANT_OR_SORCERY, stackKind: 'spell' },
        by: 'you',
      },
      effect: { kind: 'surveil', count: 1 },
    },
    {
      kind: 'triggered',
      trigger: { kind: 'endStep', whose: 'you' },
      effect: {
        kind: 'playersMay',
        players: { kind: 'eachOpponent' },
        runsAs: 'chooser',
        effect: {
          kind: 'sacrifice',
          objects: {
            kind: 'choose',
            filter: { types: ['creature'], token: false },
          },
        },
        otherwise: {
          kind: 'loseLife',
          player: { kind: 'declinedPlayer' },
          amount: {
            kind: 'multiple',
            factor: 2,
            of: {
              kind: 'countOf',
              filter: {
                zone: 'graveyard',
                controller: 'you',
                ...INSTANT_OR_SORCERY,
              },
            },
          },
        },
      },
    },
  ],
});
