/**
 * SYNTHETIC CARDS FOR GIFT. NOT REAL MAGIC CARDS.
 *
 * Invented for the tests and the soak games of D-135: "Gift a card" (CR 702.174) on a permanent ("When this creature enters, if the
 * gift was promised, ...") and on instants and sorceries ("If the gift was promised, ..." with a target chosen only then, CR
 * 702.174m), and an opponent who sacrifices a creature with the greatest power among those they control. Names start with
 * "SYNTHETIC "; oracleId is null. The text describes what the AST does; it is not Oracle text, and none of these is the
 * definition of a real card.
 */
import type { Ability } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const YOU = { kind: 'you' } as const;
const GIFT: Ability = { kind: 'keyword', keyword: { kind: 'gift', gift: 'card' } };

export const SYNTHETIC_GIFT_LIST: readonly CardDefinition[] = [
  // "Gift a card. When this creature enters, if the gift was promised, destroy target artifact or enchantment an opponent controls."
  singleFace({
    name: 'SYNTHETIC Gifted Ranger',
    manaCost: ['2', 'G'],
    types: ['creature'],
    subtypes: ['Raccoon', 'Archer'],
    colors: ['G'],
    colorIdentity: ['G'],
    power: 3,
    toughness: 3,
    oracleText:
      'Gift a card. When this creature enters, if the gift was promised, destroy target artifact or enchantment an opponent controls.',
    abilities: [
      GIFT,
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
        interveningIf: { kind: 'giftPromised' },
        targets: [
          {
            id: 't1',
            what: {
              kind: 'object',
              filter: {
                controller: 'opponent',
                anyOf: [{ types: ['artifact'] }, { types: ['enchantment'] }],
              },
            },
          },
        ],
        effect: { kind: 'destroy', objects: { kind: 'target', id: 't1' } },
      },
    ],
  }),
  // "Gift a card. Target opponent sacrifices a creature with the greatest power among creatures they control. If the gift was
  // promised, return target creature card from your graveyard to your hand."
  singleFace({
    name: 'SYNTHETIC Greedy Reaper',
    manaCost: ['1', 'B', 'B'],
    types: ['instant'],
    colors: ['B'],
    colorIdentity: ['B'],
    oracleText:
      'Gift a card. Target opponent sacrifices a creature with the greatest power among creatures they control. If the gift was promised, return target creature card from your graveyard to your hand.',
    abilities: [GIFT],
    spell: {
      targets: [
        { id: 't1', what: { kind: 'player', filter: 'opponent' } },
        {
          id: 't2',
          ifGiftPromised: true,
          what: {
            kind: 'object',
            filter: { zone: 'graveyard', types: ['creature'], controller: 'you' },
          },
        },
      ],
      effect: {
        kind: 'sequence',
        effects: [
          {
            kind: 'sacrifice',
            objects: {
              kind: 'choose',
              filter: { types: ['creature'], controller: 'you' },
              greatest: 'power',
            },
            player: { kind: 'target', id: 't1' },
          },
          {
            kind: 'conditional',
            condition: { kind: 'giftPromised' },
            effect: { kind: 'moveToZone', objects: { kind: 'target', id: 't2' }, to: 'hand' },
          },
        ],
      },
    },
  }),
  // "Gift a card. Draw two cards. If the gift was promised, you gain 2 life." The gift is given before the other effects.
  singleFace({
    name: 'SYNTHETIC Gift Study',
    manaCost: ['1', 'U'],
    types: ['sorcery'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: 'Gift a card. Draw two cards. If the gift was promised, you gain 2 life.',
    abilities: [GIFT],
    spell: {
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'draw', player: YOU, count: 2 },
          {
            kind: 'conditional',
            condition: { kind: 'giftPromised' },
            effect: { kind: 'gainLife', player: YOU, amount: 2 },
          },
        ],
      },
    },
  }),
  // "Target opponent sacrifices a creature with the greatest power among creatures they control." (no gift)
  singleFace({
    name: 'SYNTHETIC Edict of the Mighty',
    manaCost: ['2', 'B'],
    types: ['sorcery'],
    colors: ['B'],
    colorIdentity: ['B'],
    oracleText:
      'Target opponent sacrifices a creature with the greatest power among creatures they control.',
    spell: {
      targets: [{ id: 't1', what: { kind: 'player', filter: 'opponent' } }],
      effect: {
        kind: 'sacrifice',
        objects: {
          kind: 'choose',
          filter: { types: ['creature'], controller: 'you' },
          greatest: 'power',
        },
        player: { kind: 'target', id: 't1' },
      },
    },
  }),
];
