/**
 * Predefined tokens (CR 111.10). The definitions follow the Comprehensive Rules text read with
 * `pnpm rule 111.10`. A preset is `supported` only when every ability it carries is something the
 * engine can run (`SUPPORTED_FEATURES.tokenPresets`): the mana ability of a Treasure and the
 * activated abilities of Food and Clue are.
 */
import type { Ability, TokenDefinition, TokenPreset } from '../ast/types';

const artifactToken = (
  name: string,
  oracleText: string,
  abilities: readonly Ability[],
): TokenDefinition => ({
  name,
  manaCost: null,
  supertypes: [],
  types: ['artifact'],
  subtypes: [name],
  colors: [],
  power: null,
  toughness: null,
  loyalty: null,
  defense: null,
  oracleText,
  abilities,
});

export const TOKEN_PRESETS: Readonly<Record<TokenPreset, TokenDefinition>> = {
  // CR 111.10a: "{T}, Sacrifice this token: Add one mana of any color."
  Treasure: artifactToken('Treasure', '{T}, Sacrifice this token: Add one mana of any color.', [
    {
      kind: 'mana',
      cost: [{ kind: 'tap' }, { kind: 'sacrifice', what: { kind: 'this' } }],
      production: { kind: 'anyColor' },
    },
  ]),
  // CR 111.10b: "{2}, {T}, Sacrifice this token: You gain 3 life."
  Food: artifactToken('Food', '{2}, {T}, Sacrifice this token: You gain 3 life.', [
    {
      kind: 'activated',
      cost: [
        { kind: 'mana', symbols: ['2'] },
        { kind: 'tap' },
        { kind: 'sacrifice', what: { kind: 'this' } },
      ],
      effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 3 },
    },
  ]),
  // CR 111.10f: "{2}, Sacrifice this token: Draw a card."
  Clue: artifactToken('Clue', '{2}, Sacrifice this token: Draw a card.', [
    {
      kind: 'activated',
      cost: [
        { kind: 'mana', symbols: ['2'] },
        { kind: 'sacrifice', what: { kind: 'this' } },
      ],
      effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
    },
  ]),
};

/**
 * The token of "Empower Jace N" (CR 701.71a, D-201): "a blue Jace planeswalker token with 0 loyalty, '[-1]: Surveil 1,' and '[-3]: Draw a card.'". A
 * token with no name of its own is named for its subtypes (CR 111.4), so it is Jace; it has no mana cost and is not legendary. Its loyalty counters
 * come from the effect (a loyalty of 0 means it enters with none).
 */
export const JACE_TOKEN: TokenDefinition = {
  name: 'Jace',
  manaCost: null,
  supertypes: [],
  types: ['planeswalker'],
  subtypes: ['Jace'],
  colors: ['U'],
  power: null,
  toughness: null,
  loyalty: 0,
  defense: null,
  oracleText: '[\u22121]: Surveil 1.\n[\u22123]: Draw a card.',
  abilities: [
    {
      kind: 'activated',
      cost: [{ kind: 'loyalty', change: -1 }],
      effect: { kind: 'surveil', count: 1 },
    },
    {
      kind: 'activated',
      cost: [{ kind: 'loyalty', change: -3 }],
      effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
    },
  ],
};
