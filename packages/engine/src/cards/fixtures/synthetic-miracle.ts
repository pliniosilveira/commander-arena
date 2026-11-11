/**
 * SYNTHETIC MIRACLE CARDS. NOT REAL MAGIC CARDS.
 *
 * Invented for the tests and the soak games of D-971: Miracle (CR 702.94), with an {X} in the miracle cost (CR 107.3a), a
 * miracle spell with a target, a permanent with miracle, a card that draws several cards and one that gives the draw to
 * the opponent. Names start with "SYNTHETIC "; oracleId is null. The text describes what the AST does; it is not Oracle
 * text, and none of these is the definition of a real card.
 *
 * The abilities the keyword stands for (the reveal as the card is drawn, the trigger "When you reveal this card this way",
 * the cast for the miracle cost) are the engine's (`rules/miracle.ts`, `rules/later-triggers.ts`): the cards list only the
 * alternative cost.
 */
import type { Cost, TokenDefinition } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const mana = (...symbols: string[]): Cost => ({ kind: 'mana', symbols });
const YOU = { kind: 'you' } as const;
const X = { kind: 'x' } as const;
const T1 = { kind: 'target', id: 't1' } as const;
const CREATURE_TARGET = {
  id: 't1',
  what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
} as const;

/** "A 4/4 white Angel creature token with flying". */
export const ANGEL_TOKEN: TokenDefinition = {
  name: 'Angel',
  manaCost: null,
  supertypes: [],
  types: ['creature'],
  subtypes: ['Angel'],
  colors: ['W'],
  power: 4,
  toughness: 4,
  loyalty: null,
  defense: null,
  oracleText: 'Flying',
  abilities: [{ kind: 'keyword', keyword: { kind: 'flying' } }],
};

export const SYNTHETIC_MIRACLE_LIST: readonly CardDefinition[] = [
  // "Create X 4/4 white Angel creature tokens with flying. Miracle {X}{W}{W}" (the shape of the real card, with its X).
  singleFace({
    name: 'SYNTHETIC Miracle Host',
    manaCost: ['X', 'X', 'W', 'W', 'W'],
    types: ['sorcery'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText: 'Create X 4/4 white Angel creature tokens with flying.\nMiracle {X}{W}{W}',
    alternativeCosts: [{ kind: 'miracle', cost: [mana('X', 'W', 'W')] }],
    spell: {
      x: true,
      effect: { kind: 'createToken', token: { kind: 'custom', definition: ANGEL_TOKEN }, count: X },
    },
  }),
  // A miracle cost with no X, on a spell with a target: {1}{R} instant, 3 damage to target creature, miracle {R}.
  singleFace({
    name: 'SYNTHETIC Miracle Bolt',
    manaCost: ['1', 'R'],
    types: ['instant'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText: 'SYNTHETIC Miracle Bolt deals 3 damage to target creature.\nMiracle {R}',
    alternativeCosts: [{ kind: 'miracle', cost: [mana('R')] }],
    spell: { targets: [CREATURE_TARGET], effect: { kind: 'dealDamage', amount: 3, to: T1 } },
  }),
  // A permanent with miracle: {4}{G} 4/4, miracle {G}.
  singleFace({
    name: 'SYNTHETIC Miracle Beast',
    manaCost: ['4', 'G'],
    types: ['creature'],
    subtypes: ['Beast'],
    colors: ['G'],
    colorIdentity: ['G'],
    power: 4,
    toughness: 4,
    oracleText: 'Miracle {G}',
    alternativeCosts: [{ kind: 'miracle', cost: [mana('G')] }],
  }),
  // A legendary creature with miracle, for the commander rules (CR 903.9b).
  singleFace({
    name: 'SYNTHETIC Miracle Commander',
    manaCost: ['2', 'W'],
    supertypes: ['legendary'],
    types: ['creature'],
    subtypes: ['Angel'],
    colors: ['W'],
    colorIdentity: ['W'],
    power: 3,
    toughness: 3,
    oracleText: 'Miracle {W}',
    alternativeCosts: [{ kind: 'miracle', cost: [mana('W')] }],
  }),
  // "Draw two cards, then discard two cards." The first card drawn is the first of the turn (the reveal comes between the draws).
  singleFace({
    name: 'SYNTHETIC Careful Digging',
    manaCost: ['1', 'U'],
    types: ['sorcery'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: 'Draw two cards, then discard two cards.',
    spell: {
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'draw', player: YOU, count: 2 },
          { kind: 'discard', player: YOU, count: 2 },
        ],
      },
    },
  }),
  // "Draw two cards."
  singleFace({
    name: 'SYNTHETIC Twin Draw',
    manaCost: ['1', 'U'],
    types: ['sorcery'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: 'Draw two cards.',
    spell: { effect: { kind: 'draw', player: YOU, count: 2 } },
  }),
  // "Target opponent draws a card."
  singleFace({
    name: 'SYNTHETIC Generous Gift',
    manaCost: ['U'],
    types: ['instant'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: 'Target opponent draws a card.',
    spell: {
      targets: [{ id: 't1', what: { kind: 'player', filter: 'opponent' } }],
      effect: { kind: 'draw', player: T1, count: 1 },
    },
  }),
];
