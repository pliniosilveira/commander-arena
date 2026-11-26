/**
 * SYNTHETIC MEGAMORPH CARDS. NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of Megamorph (CR 702.37b) and of a card that returns itself from the graveyard face up or face down (CR 708.2a, 708.3). Names start with "SYNTHETIC ",
 * oracleId is null, and the text describes what the AST does; none of this is Oracle text.
 *
 * - "SYNTHETIC Megamorph Ogre": a creature with Megamorph {1}{G}.
 * - "SYNTHETIC Graveyard Returner": "Whenever a permanent you control is turned face up, you may return this card from your graveyard to the battlefield face up or face down.",
 *   with Megamorph {1}{G}.
 * - "SYNTHETIC Face-Down Returner": a creature with no morph ability whose graveyard trigger returns it face down only.
 */
import type { Ability, Effect } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const THIS = { kind: 'this' } as const;

const returnTo = (faceDown: boolean): Effect => ({
  kind: 'moveToZone',
  objects: THIS,
  to: 'battlefield',
  controller: 'owner',
  ...(faceDown ? { faceDownAs: 'morph' as const } : {}),
});

const graveyardTrigger = (effect: Effect): Ability => ({
  kind: 'triggered',
  trigger: { kind: 'turnedFaceUp', what: { controller: 'you' } },
  optional: true,
  functionsIn: 'graveyard',
  effect,
});

export const SYNTHETIC_MEGAMORPH_LIST: readonly CardDefinition[] = [
  singleFace({
    name: 'SYNTHETIC Megamorph Ogre',
    manaCost: ['3', 'G'],
    types: ['creature'],
    subtypes: ['Ogre'],
    colors: ['G'],
    colorIdentity: ['G'],
    power: 3,
    toughness: 3,
    oracleText: 'Megamorph {1}{G}',
    alternativeCosts: [
      { kind: 'morph', megamorph: true, cost: [{ kind: 'mana', symbols: ['1', 'G'] }] },
    ],
  }),
  singleFace({
    name: 'SYNTHETIC Graveyard Returner',
    manaCost: ['1', 'G', 'G'],
    types: ['creature'],
    subtypes: ['Beast'],
    colors: ['G'],
    colorIdentity: ['G'],
    power: 3,
    toughness: 3,
    oracleText:
      'Whenever a permanent you control is turned face up, you may return this card from your graveyard to the battlefield face up or face down.\nMegamorph {1}{G}',
    abilities: [
      graveyardTrigger({
        kind: 'chooseOne',
        options: [
          { label: 'face up', effect: returnTo(false) },
          { label: 'face down', effect: returnTo(true) },
        ],
      }),
    ],
    alternativeCosts: [
      { kind: 'morph', megamorph: true, cost: [{ kind: 'mana', symbols: ['1', 'G'] }] },
    ],
  }),
  singleFace({
    name: 'SYNTHETIC Face-Down Returner',
    manaCost: ['1', 'G'],
    types: ['creature'],
    subtypes: ['Beast'],
    colors: ['G'],
    colorIdentity: ['G'],
    power: 3,
    toughness: 3,
    oracleText:
      'Whenever a permanent you control is turned face up, you may return this card from your graveyard to the battlefield face down.',
    abilities: [graveyardTrigger(returnTo(true))],
  }),
];
