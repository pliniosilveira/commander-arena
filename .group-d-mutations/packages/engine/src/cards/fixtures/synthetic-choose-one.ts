/**
 * SYNTHETIC CARDS FOR "DO ONE OF THESE, AS THIS RESOLVES". NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of D-175 (the Korvold slice, text and tokens): an instruction that makes its controller choose one of two or more
 * instructions as it resolves (CR 608.2d), with a spell that offers three, an upkeep trigger that offers two and a spell that offers one
 * instruction with a target. Names start with "SYNTHETIC "; oracleId is null. The text describes what the AST does; it is not Oracle text,
 * and none of these is the definition of a real card.
 */
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

export const SYNTHETIC_CHOOSE_ONE_LIST: readonly CardDefinition[] = [
  // "Draw a card, gain 3 life, or create a Treasure token." (as it resolves, its controller chooses which)
  singleFace({
    name: 'SYNTHETIC Fork Rite',
    manaCost: ['1', 'G'],
    types: ['sorcery'],
    colors: ['G'],
    colorIdentity: ['G'],
    oracleText: 'Draw a card, gain 3 life, or create a Treasure token.',
    spell: {
      effect: {
        kind: 'chooseOne',
        options: [
          { label: 'draw a card', effect: { kind: 'draw', player: { kind: 'you' }, count: 1 } },
          {
            label: 'gain 3 life',
            effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 3 },
          },
          {
            label: 'create a Treasure token',
            effect: {
              kind: 'createToken',
              token: { kind: 'preset', preset: 'Treasure' },
              count: 1,
            },
          },
        ],
      },
    },
  }),
  // "At the beginning of your upkeep, create a Food token or a Treasure token."
  singleFace({
    name: 'SYNTHETIC Fork Altar',
    manaCost: ['2', 'G'],
    types: ['enchantment'],
    colors: ['G'],
    colorIdentity: ['G'],
    oracleText: 'At the beginning of your upkeep, create a Food token or a Treasure token.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'upkeep', whose: 'you' },
        effect: {
          kind: 'chooseOne',
          options: [
            {
              label: 'a Food token',
              effect: {
                kind: 'createToken',
                token: { kind: 'preset', preset: 'Food' },
                count: 1,
              },
            },
            {
              label: 'a Treasure token',
              effect: {
                kind: 'createToken',
                token: { kind: 'preset', preset: 'Treasure' },
                count: 1,
              },
            },
          ],
        },
      },
    ],
  }),
  // "Target creature gains flying until end of turn or gets +2/+2 until end of turn." (the target is chosen as it is cast, the option as it resolves)
  singleFace({
    name: 'SYNTHETIC Fork Charm',
    manaCost: ['G'],
    types: ['instant'],
    colors: ['G'],
    colorIdentity: ['G'],
    oracleText: 'Target creature gains flying until end of turn or gets +2/+2 until end of turn.',
    spell: {
      targets: [{ id: 't1', what: { kind: 'object', filter: { types: ['creature'] } } }],
      effect: {
        kind: 'chooseOne',
        options: [
          {
            label: 'gains flying',
            effect: {
              kind: 'grantKeyword',
              objects: { kind: 'target', id: 't1' },
              keyword: { kind: 'flying' },
              duration: 'untilEndOfTurn',
            },
          },
          {
            label: 'gets +2/+2',
            effect: {
              kind: 'modifyPt',
              objects: { kind: 'target', id: 't1' },
              power: 2,
              toughness: 2,
              duration: 'untilEndOfTurn',
            },
          },
        ],
      },
    },
  }),
];
