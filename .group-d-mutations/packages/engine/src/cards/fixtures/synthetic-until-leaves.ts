/**
 * SYNTHETIC CARDS FOR "EXILE ... UNTIL THIS LEAVES THE BATTLEFIELD" AND FOR AN AURA CARD PUT ONTO THE BATTLEFIELD. NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of D-149 (the Angels slice): "When this enchantment enters, for each opponent, exile up to one target nonland permanent
 * that player controls until this enchantment leaves the battlefield.", the same for a creature's activated ability and for a single target
 * ("exile target creature an opponent controls until this leaves the battlefield"), an enchantment that destroys other enchantments to try the
 * return, an Aura to be exiled and returned, and "Return target permanent card from your graveyard to the battlefield" (an Aura among them).
 * Names start with "SYNTHETIC "; oracleId is null. The text describes what the AST does; it is not Oracle text, and none of these is the
 * definition of a real card.
 */
import type { CardDefinition } from '../definition';
import { kw, singleFace } from './helpers';

const T1 = { kind: 'target', id: 't1' } as const;

export const SYNTHETIC_UNTIL_LEAVES_LIST: readonly CardDefinition[] = [
  // "When this enchantment enters, for each opponent, exile up to one target nonland permanent that player controls until this enchantment
  //  leaves the battlefield."
  singleFace({
    name: 'SYNTHETIC Grasp of Law',
    manaCost: ['1', 'W', 'W'],
    types: ['enchantment'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText:
      'When this enchantment enters, for each opponent, exile up to one target nonland permanent that player controls until this enchantment leaves the battlefield.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
        targets: [
          {
            id: 't1',
            onePerOpponent: true,
            what: {
              kind: 'object',
              filter: { notTypes: ['land'], controller: 'opponent' },
            },
          },
        ],
        effect: { kind: 'exile', objects: T1, until: 'sourceLeaves' },
      },
    ],
  }),
  // "{2}{W}: Exile target creature an opponent controls until this creature leaves the battlefield."
  singleFace({
    name: 'SYNTHETIC Banishing Warden',
    manaCost: ['2', 'W'],
    types: ['creature'],
    subtypes: ['Angel'],
    colors: ['W'],
    colorIdentity: ['W'],
    power: 2,
    toughness: 2,
    oracleText:
      '{2}{W}: Exile target creature an opponent controls until this creature leaves the battlefield.',
    abilities: [
      kw('flying'),
      {
        kind: 'activated',
        cost: [{ kind: 'mana', symbols: ['2', 'W'] }],
        targets: [
          {
            id: 't1',
            what: { kind: 'object', filter: { types: ['creature'], controller: 'opponent' } },
          },
        ],
        effect: { kind: 'exile', objects: T1, until: 'sourceLeaves' },
      },
    ],
  }),
  // "Destroy target enchantment." (an instant that takes a Grasp of Law away)
  singleFace({
    name: 'SYNTHETIC Dispel Enchantment',
    manaCost: ['1', 'W'],
    types: ['instant'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText: 'Destroy target enchantment.',
    spell: {
      targets: [{ id: 't1', what: { kind: 'object', filter: { types: ['enchantment'] } } }],
      effect: { kind: 'destroy', objects: T1 },
    },
  }),
  // "Destroy all enchantments." (an instant that takes every Grasp of Law away at the same time, CR 610.3d)
  singleFace({
    name: 'SYNTHETIC Purge Enchantments',
    manaCost: ['2', 'W'],
    types: ['instant'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText: 'Destroy all enchantments.',
    spell: {
      effect: { kind: 'destroy', objects: { kind: 'each', filter: { types: ['enchantment'] } } },
    },
  }),
  // "Enchant creature. Enchanted creature gets +2/+2." (the Aura that is exiled and comes back)
  singleFace({
    name: 'SYNTHETIC Mighty Aura',
    manaCost: ['1', 'G'],
    types: ['enchantment'],
    subtypes: ['Aura'],
    colors: ['G'],
    colorIdentity: ['G'],
    oracleText: 'Enchant creature. Enchanted creature gets +2/+2.',
    abilities: [
      { kind: 'keyword', keyword: { kind: 'enchant', filter: { types: ['creature'] } } },
      {
        kind: 'static',
        static: {
          kind: 'modifyPt',
          subject: { kind: 'attached', types: ['creature'] },
          power: 2,
          toughness: 2,
        },
      },
    ],
  }),
  // "Enchant creature you control." (an Aura with a narrower enchant ability)
  singleFace({
    name: 'SYNTHETIC Guardian Aura',
    manaCost: ['W'],
    types: ['enchantment'],
    subtypes: ['Aura'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText: 'Enchant creature you control. Enchanted creature has vigilance.',
    abilities: [
      {
        kind: 'keyword',
        keyword: { kind: 'enchant', filter: { types: ['creature'], controller: 'you' } },
      },
      {
        kind: 'static',
        static: {
          kind: 'grantKeyword',
          subject: { kind: 'attached', types: ['creature'] },
          keyword: { kind: 'vigilance' },
        },
      },
    ],
  }),
  // "Return target permanent card from your graveyard to the battlefield."
  singleFace({
    name: 'SYNTHETIC Rise Again',
    manaCost: ['3', 'W'],
    types: ['sorcery'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText: 'Return target permanent card from your graveyard to the battlefield.',
    spell: {
      targets: [
        {
          id: 't1',
          what: {
            kind: 'object',
            filter: {
              zone: 'graveyard',
              controller: 'you',
              notTypes: ['instant', 'sorcery'],
            },
          },
        },
      ],
      effect: { kind: 'moveToZone', objects: T1, to: 'battlefield' },
    },
  }),
  // "Flying. Landfall: Whenever a land you control enters, you may return target nonland permanent card from your graveyard to your hand. If that
  //  land is a Plains, you may return that nonland permanent card to the battlefield instead."
  singleFace({
    name: 'SYNTHETIC Dawn Shepherd',
    manaCost: ['5', 'W', 'W'],
    types: ['creature'],
    subtypes: ['Angel'],
    colors: ['W'],
    colorIdentity: ['W'],
    power: 4,
    toughness: 4,
    oracleText:
      'Flying. Landfall: Whenever a land you control enters, you may return target nonland permanent card from your graveyard to your hand. If that land is a Plains, you may return that nonland permanent card to the battlefield instead.',
    abilities: [
      kw('flying'),
      {
        kind: 'triggered',
        trigger: { kind: 'landfall' },
        targets: [
          {
            id: 't1',
            what: {
              kind: 'object',
              filter: {
                zone: 'graveyard',
                controller: 'you',
                anyOf: [
                  { types: ['artifact'] },
                  { types: ['creature'] },
                  { types: ['enchantment'] },
                  { types: ['planeswalker'] },
                  { types: ['battle'] },
                ],
              },
            },
          },
        ],
        effect: {
          kind: 'conditional',
          condition: {
            kind: 'objectMatches',
            of: { kind: 'triggerSubject' },
            filter: { subtypes: ['Plains'] },
          },
          effect: {
            kind: 'sequence',
            effects: [
              { kind: 'may', effect: { kind: 'moveToZone', objects: T1, to: 'battlefield' } },
              {
                kind: 'conditional',
                condition: { kind: 'not', term: { kind: 'didPrevious' } },
                effect: { kind: 'may', effect: { kind: 'moveToZone', objects: T1, to: 'hand' } },
              },
            ],
          },
          else: { kind: 'may', effect: { kind: 'moveToZone', objects: T1, to: 'hand' } },
        },
      },
    ],
  }),
];
