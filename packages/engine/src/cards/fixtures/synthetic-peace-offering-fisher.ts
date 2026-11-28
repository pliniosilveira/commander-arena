/**
 * SYNTHETIC CARDS FOR TOKENS SWAPPED AS THEY ARE CREATED AND A CARD THAT IS ONLY REVEALED. NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of the Peace Offering deck (issue 112), group F (Fisher's Talent's shapes): "If you would create a Fish token, create a 3/3 blue Shark creature
 * token instead" (`tokensInstead` in `swap` mode, CR 614.1a, 616.1f) and "Look at the top card of your library. You may reveal it if it's a land card. Create a 1/1 blue Fish
 * creature token if you revealed it this way." (`lookAtTop` with `take.to` `reveal`, CR 701.20a, 701.20b, 608.2c). Names start with "SYNTHETIC "; oracleId is null. The text
 * describes what the AST does; it is not Oracle text, and none of these is the definition of a real card.
 */
import type { Ability, Effect, TokenDefinition } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const creatureToken = (
  name: string,
  power: number,
  toughness: number,
): Extract<Effect, { kind: 'createToken' }>['token'] & { kind: 'custom' } => {
  const definition: TokenDefinition = {
    name,
    manaCost: null,
    supertypes: [],
    types: ['creature'],
    subtypes: [name] as never,
    colors: ['U'],
    power,
    toughness,
    loyalty: null,
    defense: null,
    oracleText: '',
    abilities: [],
  };
  return { kind: 'custom', definition };
};

const FISH = creatureToken('Fish', 1, 1);
const SHARK = creatureToken('Shark', 3, 3);
const OCTOPUS = creatureToken('Octopus', 8, 8);

/** "If you would create a <from> token, create <to> instead." */
const swap = (from: string, to: typeof FISH): Ability => ({
  kind: 'replacement',
  replacement: {
    kind: 'tokensInstead',
    what: { token: true, subtypes: [from] as never },
    mode: 'swap',
    token: to,
  },
});

const enchantment = (name: string, words: string, abilities: readonly Ability[]): CardDefinition =>
  singleFace({
    name,
    manaCost: ['1', 'U'],
    types: ['enchantment'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: words,
    abilities: [...abilities],
  });

const sorcery = (name: string, words: string, effect: Effect): CardDefinition =>
  singleFace({
    name,
    manaCost: ['U'],
    types: ['sorcery'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: words,
    spell: { targets: [], effect },
  });

export const SYNTHETIC_PEACE_OFFERING_FISHER_LIST: readonly CardDefinition[] = [
  enchantment(
    'SYNTHETIC Shark Tide',
    'If you would create a Fish token, create a 3/3 blue Shark creature token instead.',
    [swap('Fish', SHARK)],
  ),
  enchantment(
    'SYNTHETIC Octopus Tide',
    'If you would create a Shark token, create an 8/8 blue Octopus creature token instead.',
    [swap('Shark', OCTOPUS)],
  ),
  sorcery('SYNTHETIC Fish Call', 'Create two tapped 1/1 blue Fish creature tokens.', {
    kind: 'createToken',
    token: FISH,
    count: 2,
    tapped: true,
  }),
  sorcery('SYNTHETIC Shark Call', 'Create a 3/3 blue Shark creature token.', {
    kind: 'createToken',
    token: SHARK,
    count: 1,
  }),
  sorcery(
    'SYNTHETIC Land Glimpse',
    "Look at the top card of your library. You may reveal it if it's a land card. Create a 1/1 blue Fish creature token if you revealed it this way. Then draw a card.",
    {
      kind: 'sequence',
      effects: [
        {
          kind: 'lookAtTop',
          count: 1,
          take: { filter: { types: ['land'] }, max: 1, to: 'reveal' },
          rest: 'top',
        },
        {
          kind: 'conditional',
          condition: { kind: 'didPrevious' },
          effect: { kind: 'createToken', token: FISH, count: 1 },
        },
        { kind: 'draw', player: { kind: 'you' }, count: 1 },
      ],
    },
  ),
];
