/**
 * SYNTHETIC CARDS FOR GROUP 1 OF THE PRISMARI DECK (ISSUE 87, D-624 TO D-631). NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of what the group added to the engine: tokens that are copies and the delayed exile or sacrifice of only the tokens one ability made (`createToken` of a
 * `copyOf`, `createCopies`, `populate`, `delayedTrigger` of `moved`, CR 111.10, 603.7c, 701.36), a tapped and attacking copy (`createCopies` with `tapped`, `enterAttacking`, CR 508.4),
 * each other token becoming a copy of one chosen (`chooseObjects`, `becomeCopy` for good, CR 707.2), a creature that becomes a copy until end of turn with an ability of its own
 * (`becomeCopy` with `abilities`, CR 707.9b), the cost "for each target beyond the first" (`costPerExtraTarget`, CR 601.2f), the number of instants and sorceries cast this turn
 * (`spellsCastThisTurn`) and a spell cast from the hand (`castFromHand`), and the designation "prepared" gained from triggers (CR 722.3a). Names start with "SYNTHETIC "; oracleId is
 * null. The text describes what the AST does; it is not Oracle text, and none of these is the definition of a real card (the real ones are read from the golden corpus by the
 * grammar, and have the same abilities).
 */
import type { Ability, Effect, ObjectFilter, TokenDefinition } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const T1 = { kind: 'target', id: 't1' } as const;
const MOVED = { kind: 'moved' } as const;
const HASTE: Ability = { kind: 'keyword', keyword: { kind: 'haste' } };
const CREATURE_TOKENS_YOU: ObjectFilter = { types: ['creature'], token: true, controller: 'you' };

/** "At the beginning of the next end step, [action] those tokens": the delayed ability of the tokens the effects before it made. */
const atNextEndStep = (action: 'exile' | 'sacrifice'): Effect => ({
  kind: 'delayedTrigger',
  at: { step: 'endStep', whose: 'each' },
  effect: { kind: action, objects: MOVED },
});

/** "A 2/1 blue Phyrexian Myr artifact creature token". */
const MYR: TokenDefinition = {
  name: 'Phyrexian Myr',
  manaCost: null,
  supertypes: [],
  types: ['artifact', 'creature'],
  subtypes: ['Phyrexian', 'Myr'],
  colors: ['U'],
  power: 2,
  toughness: 1,
  loyalty: null,
  defense: null,
  oracleText: '',
  abilities: [],
};

/** "A 1/1 white Soldier creature token". */
const SOLDIER: TokenDefinition = {
  name: 'Soldier',
  manaCost: null,
  supertypes: [],
  types: ['creature'],
  subtypes: ['Soldier'],
  colors: ['W'],
  power: 1,
  toughness: 1,
  loyalty: null,
  defense: null,
  oracleText: '',
  abilities: [],
};

/** "A 3/3 green Beast creature token". */
const BEAST: TokenDefinition = {
  name: 'Beast',
  manaCost: null,
  supertypes: [],
  types: ['creature'],
  subtypes: ['Beast'],
  colors: ['G'],
  power: 3,
  toughness: 3,
  loyalty: null,
  defense: null,
  oracleText: '',
  abilities: [],
};

const makeToken = (token: TokenDefinition, count = 1): Effect => ({
  kind: 'createToken',
  token: { kind: 'custom', definition: token },
  count,
});

/** A preparation card (CR 722): the front creature and the prepare spell, as `synthetic-vraska.ts` makes its scout. */
function prepareCard(name: string, front: CardDefinition, spell: CardDefinition): CardDefinition {
  return { ...front, name, layout: 'prepare', faces: [...front.faces, ...spell.faces] };
}

const skypainterFront = singleFace({
  name: 'Sky Painter',
  manaCost: ['U', 'R'],
  types: ['creature'],
  subtypes: ['Bird', 'Wizard'],
  colors: ['U', 'R'],
  colorIdentity: ['U', 'R'],
  power: 2,
  toughness: 2,
  oracleText:
    'Flying\nWhen this creature enters and whenever one or more creature tokens you control deal combat damage to a player, this creature becomes prepared.',
  abilities: [
    { kind: 'keyword', keyword: { kind: 'flying' } },
    {
      kind: 'triggered',
      trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
      effect: { kind: 'prepare', objects: { kind: 'this' } },
    },
    {
      kind: 'triggered',
      trigger: { kind: 'combatDamageBatch', what: CREATURE_TOKENS_YOU, to: 'player' },
      effect: { kind: 'prepare', objects: { kind: 'this' } },
    },
  ],
});
const skypainterSpell = singleFace({
  name: 'Gift Spell',
  manaCost: ['3', 'U', 'R'],
  types: ['sorcery'],
  colors: ['U', 'R'],
  colorIdentity: ['U', 'R'],
  oracleText:
    "Create a token that's a copy of target creature you control. That token gains haste until end of turn.",
  spell: {
    targets: [
      {
        id: 't1',
        what: {
          kind: 'object',
          filter: { zone: 'battlefield', types: ['creature'], controller: 'you' },
        },
      },
    ],
    effect: {
      kind: 'sequence',
      effects: [
        { kind: 'createToken', token: { kind: 'copyOf', object: T1 }, count: 1 },
        {
          kind: 'grantKeyword',
          objects: MOVED,
          keyword: { kind: 'haste' },
          duration: 'untilEndOfTurn',
        },
      ],
    },
  },
});

const focusFront = singleFace({
  name: 'Focus Mage',
  manaCost: ['2', 'U'],
  types: ['creature'],
  subtypes: ['Human', 'Wizard'],
  colors: ['U'],
  colorIdentity: ['U'],
  power: 1,
  toughness: 4,
  oracleText:
    'Instant and sorcery spells you cast cost {1} less to cast.\nWhenever you cast an instant or sorcery spell with mana value 5 or greater from your hand, this creature becomes prepared.',
  abilities: [
    {
      kind: 'static',
      static: {
        kind: 'costReduction',
        spells: { controller: 'you', anyOf: [{ types: ['instant'] }, { types: ['sorcery'] }] },
        amount: 1,
      },
    },
    {
      kind: 'triggered',
      trigger: {
        kind: 'castSpell',
        filter: {
          stackKind: 'spell',
          castFromHand: true,
          manaValue: { cmp: 'atLeast', value: 5 },
          anyOf: [{ types: ['instant'] }, { types: ['sorcery'] }],
        },
        by: 'you',
      },
      effect: { kind: 'prepare', objects: { kind: 'this' } },
    },
  ],
});
const focusSpell = singleFace({
  name: 'Brain Surge',
  manaCost: ['X', 'U', 'U'],
  types: ['sorcery'],
  colors: ['U'],
  colorIdentity: ['U'],
  oracleText: 'Target player draws X cards.',
  spell: {
    x: true,
    targets: [{ id: 't1', what: { kind: 'player', filter: 'any' } }],
    effect: { kind: 'draw', player: T1, count: { kind: 'x' } },
  },
});

export const SYNTHETIC_PRISMARI_G1_LIST: readonly CardDefinition[] = [
  // "Creature tokens you control have haste. At the beginning of combat on your turn, create a 2/1 blue Phyrexian Myr artifact creature token. Then you may choose a token you
  //  control. If you do, each other token you control becomes a copy of that token."
  singleFace({
    name: 'SYNTHETIC Myr Tinker',
    manaCost: ['4', 'U', 'R'],
    types: ['creature'],
    subtypes: ['Phyrexian', 'Artificer'],
    colors: ['U', 'R'],
    colorIdentity: ['U', 'R'],
    power: 4,
    toughness: 4,
    oracleText:
      'Creature tokens you control have haste.\nAt the beginning of combat on your turn, create a 2/1 blue Phyrexian Myr artifact creature token. Then you may choose a token you control. If you do, each other token you control becomes a copy of that token.',
    abilities: [
      {
        kind: 'static',
        static: {
          kind: 'grantKeyword',
          subject: { kind: 'filter', filter: CREATURE_TOKENS_YOU },
          keyword: { kind: 'haste' },
        },
      },
      {
        kind: 'triggered',
        trigger: { kind: 'step', step: 'beginCombat', whose: 'you' },
        effect: {
          kind: 'sequence',
          effects: [
            makeToken(MYR),
            {
              kind: 'chooseObjects',
              id: 'token',
              filter: { token: true, controller: 'you' },
              count: 1,
            },
            {
              kind: 'becomeCopy',
              objects: {
                kind: 'each',
                filter: { token: true, controller: 'you' },
                except: { kind: 'chosen', id: 'token' },
              },
              of: { kind: 'chosen', id: 'token' },
              duration: 'permanent',
            },
          ],
        },
      },
    ],
  }),
  // "At the beginning of combat on your turn, populate. The token created this way gains haste. Sacrifice it at the beginning of the next end step."
  singleFace({
    name: 'SYNTHETIC Iteration Engine',
    manaCost: ['1', 'R'],
    types: ['enchantment'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText:
      'At the beginning of combat on your turn, populate. The token created this way gains haste. Sacrifice it at the beginning of the next end step.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'step', step: 'beginCombat', whose: 'you' },
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'populate' },
            {
              kind: 'grantKeyword',
              objects: MOVED,
              keyword: { kind: 'haste' },
              duration: 'permanent',
            },
            atNextEndStep('sacrifice'),
          ],
        },
      },
    ],
  }),
  // "First strike. Whenever this creature attacks, for each creature token you control that entered this turn, create a tapped and attacking token that's a copy of that token. At
  //  the beginning of the next end step, sacrifice those tokens."
  singleFace({
    name: 'SYNTHETIC Storm Singer',
    manaCost: ['2', 'R'],
    types: ['creature'],
    subtypes: ['Human', 'Bard'],
    colors: ['R'],
    colorIdentity: ['R'],
    power: 3,
    toughness: 3,
    oracleText:
      "First strike\nWhenever this creature attacks, for each creature token you control that entered this turn, create a tapped and attacking token that's a copy of that token. At the beginning of the next end step, sacrifice those tokens.",
    abilities: [
      { kind: 'keyword', keyword: { kind: 'firstStrike' } },
      {
        kind: 'triggered',
        trigger: { kind: 'attacks', what: { kind: 'this' } },
        effect: {
          kind: 'sequence',
          effects: [
            {
              kind: 'createCopies',
              objects: {
                kind: 'each',
                filter: { ...CREATURE_TOKENS_YOU, enteredThisTurn: true },
              },
              tapped: true,
            },
            { kind: 'enterAttacking', objects: MOVED },
            atNextEndStep('sacrifice'),
          ],
        },
      },
    ],
  }),
  // "At the beginning of combat on your turn, create X tokens that are copies of another target creature you control, where X is one plus the number of instant and sorcery spells
  //  you've cast this turn. They gain haste. Exile them at the beginning of the next end step."
  singleFace({
    name: 'SYNTHETIC Flame Dancer',
    manaCost: ['3', 'R', 'R'],
    types: ['creature'],
    subtypes: ['Human', 'Shaman'],
    colors: ['R'],
    colorIdentity: ['R'],
    power: 3,
    toughness: 4,
    oracleText:
      "At the beginning of combat on your turn, create X tokens that are copies of another target creature you control, where X is one plus the number of instant and sorcery spells you've cast this turn. They gain haste. Exile them at the beginning of the next end step.",
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'step', step: 'beginCombat', whose: 'you' },
        targets: [
          {
            id: 't1',
            what: {
              kind: 'object',
              filter: { zone: 'battlefield', types: ['creature'], controller: 'you', other: true },
            },
          },
        ],
        effect: {
          kind: 'sequence',
          effects: [
            {
              kind: 'createToken',
              token: { kind: 'copyOf', object: T1 },
              count: {
                kind: 'sum',
                of: [1, { kind: 'spellsCastThisTurn', ofTypes: ['instant', 'sorcery'] }],
              },
            },
            {
              kind: 'grantKeyword',
              objects: MOVED,
              keyword: { kind: 'haste' },
              duration: 'permanent',
            },
            atNextEndStep('exile'),
          ],
        },
      },
    ],
  }),
  // "Kicker {5}. Create a token that's a copy of target creature. If this spell was kicked, create five of those tokens instead."
  singleFace({
    name: 'SYNTHETIC Replication Rite',
    manaCost: ['2', 'U', 'U'],
    types: ['sorcery'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText:
      "Kicker {5}\nCreate a token that's a copy of target creature. If this spell was kicked, create five of those tokens instead.",
    abilities: [
      { kind: 'keyword', keyword: { kind: 'kicker', cost: [{ kind: 'mana', symbols: ['5'] }] } },
    ],
    spell: {
      targets: [
        {
          id: 't1',
          what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
        },
      ],
      effect: {
        kind: 'conditional',
        condition: { kind: 'kicked' },
        effect: { kind: 'createToken', token: { kind: 'copyOf', object: T1 }, count: 5 },
        else: { kind: 'createToken', token: { kind: 'copyOf', object: T1 }, count: 1 },
      },
    },
  }),
  // "Strive — This spell costs {2}{R} more to cast for each target beyond the first. Choose any number of target creatures you control. For each of them, create a token that's a
  //  copy of that creature, except it has haste. Exile those tokens at the beginning of the next end step."
  singleFace({
    name: 'SYNTHETIC Twin Blaze',
    manaCost: ['1', 'R'],
    types: ['sorcery'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText:
      "Strive — This spell costs {2}{R} more to cast for each target beyond the first.\nChoose any number of target creatures you control. For each of them, create a token that's a copy of that creature, except it has haste. Exile those tokens at the beginning of the next end step.",
    abilities: [
      {
        kind: 'static',
        static: { kind: 'costPerExtraTarget', cost: [{ kind: 'mana', symbols: ['2', 'R'] }] },
      },
    ],
    spell: {
      targets: [
        {
          id: 't1',
          what: {
            kind: 'object',
            filter: { zone: 'battlefield', types: ['creature'], controller: 'you' },
          },
          anyNumber: true,
        },
      ],
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'createCopies', objects: T1, abilities: [HASTE] },
          atNextEndStep('exile'),
        ],
      },
    },
  }),
  // "Whenever you cast an instant or sorcery spell, this creature becomes a copy of up to one target nonlegendary creature you control until end of turn, except it has myriad."
  singleFace({
    name: 'SYNTHETIC Mud Morph',
    manaCost: ['2', 'U', 'R'],
    types: ['creature'],
    subtypes: ['Elemental', 'Shapeshifter'],
    colors: ['U', 'R'],
    colorIdentity: ['U', 'R'],
    power: 3,
    toughness: 3,
    oracleText:
      'Whenever you cast an instant or sorcery spell, this creature becomes a copy of up to one target nonlegendary creature you control until end of turn, except it has myriad.',
    abilities: [
      {
        kind: 'triggered',
        trigger: {
          kind: 'castSpell',
          filter: { stackKind: 'spell', anyOf: [{ types: ['instant'] }, { types: ['sorcery'] }] },
          by: 'you',
        },
        targets: [
          {
            id: 't1',
            what: {
              kind: 'object',
              filter: {
                zone: 'battlefield',
                types: ['creature'],
                controller: 'you',
                notSupertypes: ['legendary'],
              },
            },
            min: 0,
            max: 1,
          },
        ],
        effect: {
          kind: 'becomeCopy',
          objects: { kind: 'this' },
          of: T1,
          duration: 'untilEndOfTurn',
          abilities: [{ kind: 'keyword', keyword: { kind: 'myriad' } }],
        },
      },
    ],
  }),
  prepareCard('SYNTHETIC Sky Painter // Gift Spell', skypainterFront, skypainterSpell),
  prepareCard('SYNTHETIC Focus Mage // Brain Surge', focusFront, focusSpell),
  // Spells and a token maker for the scenarios: an instant that makes a Soldier, a Beast, a sorcery of mana value 5, an instant of mana value 6 and a plain cantrip.
  singleFace({
    name: 'SYNTHETIC Soldier Call',
    manaCost: ['W'],
    types: ['instant'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText: 'Create a 1/1 white Soldier creature token.',
    spell: { effect: makeToken(SOLDIER) },
  }),
  singleFace({
    name: 'SYNTHETIC Beast Call',
    manaCost: ['2', 'G'],
    types: ['instant'],
    colors: ['G'],
    colorIdentity: ['G'],
    oracleText: 'Create a 3/3 green Beast creature token.',
    spell: { effect: makeToken(BEAST) },
  }),
  singleFace({
    name: 'SYNTHETIC Prismari Legend',
    manaCost: ['1', 'R'],
    supertypes: ['legendary'],
    types: ['creature'],
    subtypes: ['Human', 'Wizard'],
    colors: ['R'],
    colorIdentity: ['R'],
    power: 2,
    toughness: 2,
    oracleText: 'First strike',
    abilities: [{ kind: 'keyword', keyword: { kind: 'firstStrike' } }],
  }),
  singleFace({
    name: 'SYNTHETIC Prismari Cantrip',
    manaCost: ['U'],
    types: ['instant'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: 'Draw a card.',
    spell: { effect: { kind: 'draw', player: { kind: 'you' }, count: 1 } },
  }),
  singleFace({
    name: 'SYNTHETIC Prismari Grand Study',
    manaCost: ['4', 'U'],
    types: ['sorcery'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: 'Draw a card.',
    spell: { effect: { kind: 'draw', player: { kind: 'you' }, count: 1 } },
  }),
  singleFace({
    name: 'SYNTHETIC Prismari Grand Flash',
    manaCost: ['5', 'U'],
    types: ['instant'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: 'Draw a card.',
    spell: { effect: { kind: 'draw', player: { kind: 'you' }, count: 1 } },
  }),
  // A sorcery of mana value 5 that can be cast from the graveyard, for "from your hand": a cast from anywhere else does not prepare the Focusmage.
  singleFace({
    name: 'SYNTHETIC Prismari Echo Study',
    manaCost: ['3', 'U', 'U'],
    types: ['sorcery'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: 'Draw a card. Flashback {5}{U}',
    abilities: [
      {
        kind: 'keyword',
        keyword: { kind: 'flashback', cost: [{ kind: 'mana', symbols: ['5', 'U'] }] },
      },
    ],
    spell: { effect: { kind: 'draw', player: { kind: 'you' }, count: 1 } },
  }),
  // A token that is not a creature, for populate: only creature tokens can be chosen.
  singleFace({
    name: 'SYNTHETIC Prismari Treasure Call',
    manaCost: ['R'],
    types: ['instant'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText: 'Create a Treasure token.',
    spell: {
      effect: { kind: 'createToken', token: { kind: 'preset', preset: 'Treasure' }, count: 1 },
    },
  }),
];
