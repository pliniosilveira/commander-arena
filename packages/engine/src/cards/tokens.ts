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

/**
 * The Gingerbrute token (issue 81, Ginger, Queen of Sweets; the reminder text of the cards that make it): "It's a {1} 1/1 Food Golem artifact creature with haste, \"{1}: This token can't
 * be blocked this turn except by creatures with haste,\" and \"{2}, {T}, Sacrifice this token: You gain 3 life.\"" It is a Food (CR 111.10b: the Food ability) and a creature with mana
 * value 1, which is its mana cost.
 */
export const GINGERBRUTE_TOKEN: TokenDefinition = {
  name: 'Gingerbrute',
  manaCost: ['1'],
  supertypes: [],
  types: ['artifact', 'creature'],
  subtypes: ['Food', 'Golem'],
  colors: [],
  power: 1,
  toughness: 1,
  loyalty: null,
  defense: null,
  oracleText:
    '{1}: This token can\u2019t be blocked this turn except by creatures with haste.\n{2}, {T}, Sacrifice this token: You gain 3 life.',
  abilities: [
    { kind: 'keyword', keyword: { kind: 'haste' } },
    {
      kind: 'activated',
      cost: [{ kind: 'mana', symbols: ['1'] }],
      effect: {
        kind: 'restrict',
        objects: { kind: 'this' },
        restriction: 'cantBeBlockedExceptByHaste',
        duration: 'untilEndOfTurn',
      },
    },
    {
      kind: 'activated',
      cost: [
        { kind: 'mana', symbols: ['2'] },
        { kind: 'tap' },
        { kind: 'sacrifice', what: { kind: 'this' } },
      ],
      effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 3 },
    },
  ],
};

/**
 * The Incubator token (CR 111.10i, 701.53b, issue 81): a double-faced token. Its front face is a colorless Incubator artifact with "{2}: Transform this token." Its back face is a 0/0 colorless
 * Phyrexian artifact creature named Phyrexian Token. The counters it was made with stay on it as it transforms (CR 701.27a: the same permanent).
 */
export const INCUBATOR_TOKEN: TokenDefinition = {
  ...artifactToken('Incubator', '{2}: Transform this token.', [
    {
      kind: 'activated',
      cost: [{ kind: 'mana', symbols: ['2'] }],
      effect: { kind: 'transform', objects: { kind: 'this' } },
    },
  ]),
  back: {
    name: 'Phyrexian Token',
    manaCost: null,
    supertypes: [],
    types: ['artifact', 'creature'],
    subtypes: ['Phyrexian'],
    colors: [],
    power: 0,
    toughness: 0,
    loyalty: null,
    defense: null,
    oracleText: '',
    abilities: [],
  },
};

/**
 * CR 111.10u (Lander token): "A Lander token is a colorless Lander artifact token with '{2}, {T}, Sacrifice this token: Search your library for a basic land card, put it onto the
 * battlefield tapped, then shuffle.'"
 */
const LANDER_TOKEN: TokenDefinition = artifactToken(
  'Lander',
  '{2}, {T}, Sacrifice this token: Search your library for a basic land card, put it onto the battlefield tapped, then shuffle.',
  [
    {
      kind: 'activated',
      cost: [
        { kind: 'mana', symbols: ['2'] },
        { kind: 'tap' },
        { kind: 'sacrifice', what: { kind: 'this' } },
      ],
      effect: {
        kind: 'search',
        player: { kind: 'you' },
        filter: { types: ['land'], supertypes: ['basic'] },
        max: 1,
        destinations: [{ zone: 'battlefield', tapped: true, count: 1 }],
        reveal: false,
        shuffle: true,
      },
    },
  ],
);

/**
 * The Wicked Role token (CR 111.10, 303.7; rule letter and text not checked, the rules file was not available to this build): "a black Aura Role enchantment token named Wicked Role with
 * enchant creature and 'Enchanted creature gets +1/+1' and 'When this token is put into a graveyard, each opponent loses 1 life.'" It is created attached to a creature, so it is only made
 * by an effect that names the creature (`createToken.attachTo`).
 */
const WICKED_ROLE_TOKEN: TokenDefinition = {
  name: 'Wicked Role',
  manaCost: null,
  supertypes: [],
  types: ['enchantment'],
  subtypes: ['Aura', 'Role'],
  colors: ['B'],
  power: null,
  toughness: null,
  loyalty: null,
  defense: null,
  oracleText:
    'Enchant creature\nEnchanted creature gets +1/+1.\nWhen this token is put into a graveyard, each opponent loses 1 life.',
  abilities: [
    { kind: 'keyword', keyword: { kind: 'enchant', filter: { types: ['creature'] } } },
    {
      kind: 'static',
      static: { kind: 'modifyPt', subject: { kind: 'attached' }, power: 1, toughness: 1 },
    },
    {
      kind: 'triggered',
      trigger: { kind: 'leavesBattlefield', what: { kind: 'this' }, to: 'graveyard' },
      effect: { kind: 'loseLife', player: { kind: 'eachOpponent' }, amount: 1 },
    },
  ],
};

export const TOKEN_PRESETS: Readonly<Record<TokenPreset, TokenDefinition>> = {
  // Issue 81: the token of Ginger, Queen of Sweets and the cards like it.
  Gingerbrute: GINGERBRUTE_TOKEN,
  // CR 111.10i, 701.53b (issue 81): the token of Incubate.
  Incubator: INCUBATOR_TOKEN,
  // CR 111.10, 303.7: the token of Witch's Mark and the cards like it.
  'Wicked Role': WICKED_ROLE_TOKEN,
  // CR 111.10u (Edge of Eternities: Horizon Explorer, Seedship Impact, Larval Scoutlander).
  Lander: LANDER_TOKEN,
  // CR 111.10t (issue 145, Break Down): "{T}, Sacrifice this token: Exile the top card of your library. You may play that card this turn. Activate only as a sorcery."
  Junk: artifactToken(
    'Junk',
    '{T}, Sacrifice this token: Exile the top card of your library. You may play that card this turn. Activate only as a sorcery.',
    [
      {
        kind: 'activated',
        cost: [{ kind: 'tap' }, { kind: 'sacrifice', what: { kind: 'this' } }],
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'exileTop', count: 1 },
            { kind: 'mayPlay', objects: { kind: 'moved' }, lasts: 'endOfTurn' },
          ],
        },
        timing: 'sorcery',
      },
    ],
  ),
  // CR 111.10 (Blood; the letter of the rule was not checked, the CR text was not available): "{1}, {T}, Discard a card, Sacrifice this token: Draw a card."
  Blood: artifactToken('Blood', '{1}, {T}, Discard a card, Sacrifice this token: Draw a card.', [
    {
      kind: 'activated',
      cost: [
        { kind: 'mana', symbols: ['1'] },
        { kind: 'tap' },
        { kind: 'discard', count: 1 },
        { kind: 'sacrifice', what: { kind: 'this' } },
      ],
      effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
    },
  ]),
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
  // CR 111.10c: "Sacrifice this token: Add one mana of any color."
  Gold: artifactToken('Gold', 'Sacrifice this token: Add one mana of any color.', [
    {
      kind: 'mana',
      cost: [{ kind: 'sacrifice', what: { kind: 'this' } }],
      production: { kind: 'anyColor' },
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
  // CR 111.10s: "{1}, {T}, Sacrifice this token: Target creature you control explores. Activate only as a sorcery."
  Map: artifactToken(
    'Map',
    '{1}, {T}, Sacrifice this token: Target creature you control explores. Activate only as a sorcery.',
    [
      {
        kind: 'activated',
        cost: [
          { kind: 'mana', symbols: ['1'] },
          { kind: 'tap' },
          { kind: 'sacrifice', what: { kind: 'this' } },
        ],
        targets: [
          {
            id: 'explorer',
            what: { kind: 'object', filter: { types: ['creature'], controller: 'you' } },
          },
        ],
        effect: { kind: 'explore', objects: { kind: 'target', id: 'explorer' } },
        timing: 'sorcery',
      },
    ],
  ),
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
