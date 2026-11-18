/**
 * SYNTHETIC CARDS FOR GROUP 2 OF THE PRISMARI DECK (ISSUE 87, D-646 AND LATER). NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of what the group added to the engine: effects that read the spell that was cast (its mana value and the mana spent on it, `objectMatches` and `manaValueOf` of
 * the `triggerSubject` of a `castSpell` trigger, `manaSpent` with `of`), the greatest mana value among the spells cast this turn (`greatestManaValueCast`), divided damage among any
 * targets, tokens that must attack each opponent, the mana that stays through steps and phases, a spell exiled with time counters, a flashback cost with life, a creature that can block
 * only creatures with flying, a creature that becomes a land creature with a granted ability that works on its controller's turn, and a copy of an exiled card that its controller may
 * cast. Names start with "SYNTHETIC "; oracleId is null. The text describes what the AST does; it is not Oracle text, and none of these is the definition of a real card (the real ones
 * are read from the golden corpus by the grammar, and have the same abilities).
 */
import type { Ability, Effect, TokenDefinition } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const MOVED = { kind: 'moved' } as const;
const FLYING: Ability = { kind: 'keyword', keyword: { kind: 'flying' } };
const HASTE: Ability = { kind: 'keyword', keyword: { kind: 'haste' } };
const INSTANT_OR_SORCERY = [{ types: ['instant' as const] }, { types: ['sorcery' as const] }];

/** "A N/N blue and red Elemental creature token" (with the keywords given). */
const elemental = (
  power: number,
  toughness: number,
  abilities: readonly Ability[] = [],
): TokenDefinition => ({
  name: 'Elemental',
  manaCost: null,
  supertypes: [],
  types: ['creature'],
  subtypes: ['Elemental'],
  colors: ['U', 'R'],
  power,
  toughness,
  loyalty: null,
  defense: null,
  oracleText: '',
  abilities,
});

/** "At the beginning of the next end step, exile those tokens": the delayed ability of the tokens the effects before it made. */
const exileAtNextEndStep: Effect = {
  kind: 'delayedTrigger',
  at: { step: 'endStep', whose: 'each' },
  effect: { kind: 'exile', objects: MOVED },
};

export const SYNTHETIC_PRISMARI_G2_LIST: readonly CardDefinition[] = [
  // "Whenever you cast an instant or sorcery spell, create a 1/1 blue and red Elemental creature token. If that spell's mana value is 5 or greater, create three of those tokens instead."
  singleFace({
    name: 'SYNTHETIC Piano Elemental',
    manaCost: ['1', 'R', 'R'],
    types: ['creature'],
    subtypes: ['Djinn', 'Bard'],
    colors: ['R'],
    colorIdentity: ['R'],
    power: 3,
    toughness: 3,
    oracleText:
      "Whenever you cast an instant or sorcery spell, create a 1/1 blue and red Elemental creature token. If that spell's mana value is 5 or greater, create three of those tokens instead.",
    abilities: [
      {
        kind: 'triggered',
        trigger: {
          kind: 'castSpell',
          filter: { stackKind: 'spell', anyOf: INSTANT_OR_SORCERY },
          by: 'you',
        },
        effect: {
          kind: 'conditional',
          condition: {
            kind: 'objectMatches',
            of: { kind: 'triggerSubject' },
            filter: { manaValue: { cmp: 'atLeast', value: 5 } },
          },
          effect: {
            kind: 'createToken',
            token: { kind: 'custom', definition: elemental(1, 1) },
            count: 3,
          },
          else: {
            kind: 'createToken',
            token: { kind: 'custom', definition: elemental(1, 1) },
            count: 1,
          },
        },
      },
    ],
  }),
  // "At the beginning of combat on your turn, if you've cast an instant or sorcery spell this turn, create an X/X blue and red Elemental creature token with flying and haste, where X
  //  is the greatest mana value among instant and sorcery spells you've cast this turn."
  singleFace({
    name: 'SYNTHETIC Moment Master',
    manaCost: ['2', 'U', 'R'],
    supertypes: ['legendary'],
    types: ['creature'],
    subtypes: ['Orc', 'Sorcerer'],
    colors: ['U', 'R'],
    colorIdentity: ['U', 'R'],
    power: 3,
    toughness: 3,
    oracleText:
      "At the beginning of combat on your turn, if you've cast an instant or sorcery spell this turn, create an X/X blue and red Elemental creature token with flying and haste, where X is the greatest mana value among instant and sorcery spells you've cast this turn.",
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'step', step: 'beginCombat', whose: 'you' },
        interveningIf: {
          kind: 'spellsCastThisTurn',
          atLeast: 1,
          ofTypes: ['instant', 'sorcery'],
        },
        effect: {
          kind: 'createToken',
          token: {
            kind: 'custom',
            definition: elemental(0, 0, [FLYING, HASTE]),
            ptAmount: { kind: 'greatestManaValueCast', ofTypes: ['instant', 'sorcery'] },
          },
          count: 1,
        },
      },
    ],
  }),
  // "Whenever you cast an instant or sorcery spell, this creature gets +X/+0 until end of turn, where X is that spell's mana value."
  singleFace({
    name: 'SYNTHETIC Charging Ox',
    manaCost: ['4', 'R'],
    types: ['creature'],
    subtypes: ['Ox'],
    colors: ['R'],
    colorIdentity: ['R'],
    power: 4,
    toughness: 4,
    oracleText:
      "Trample\nWhenever you cast an instant or sorcery spell, this creature gets +X/+0 until end of turn, where X is that spell's mana value.\nWhenever this creature attacks, exile up to one target instant or sorcery card from your graveyard and copy it. You may cast the copy without paying its mana cost.",
    abilities: [
      { kind: 'keyword', keyword: { kind: 'trample' } },
      {
        kind: 'triggered',
        trigger: {
          kind: 'castSpell',
          filter: { stackKind: 'spell', anyOf: INSTANT_OR_SORCERY },
          by: 'you',
        },
        effect: {
          kind: 'modifyPt',
          objects: { kind: 'this' },
          power: { kind: 'manaValueOf', of: { kind: 'triggerSubject' } },
          toughness: 0,
          duration: 'untilEndOfTurn',
        },
      },
      {
        kind: 'triggered',
        trigger: { kind: 'attacks', what: { kind: 'this' } },
        targets: [
          {
            id: 't1',
            what: {
              kind: 'object',
              filter: { zone: 'graveyard', controller: 'you', anyOf: INSTANT_OR_SORCERY },
            },
            min: 0,
            max: 1,
          },
        ],
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'exile', objects: { kind: 'target', id: 't1' } },
            { kind: 'copyCardAndCast', objects: MOVED },
          ],
        },
      },
    ],
  }),
  // "Flying\nWhenever you cast a noncreature spell, create an X/X red Dragon Illusion creature token with flying and haste, where X is the amount of mana spent to cast that spell.
  //  Exile that token at the beginning of the next end step."
  singleFace({
    name: 'SYNTHETIC Manaform Drake',
    manaCost: ['2', 'R', 'R'],
    types: ['creature'],
    subtypes: ['Dragon'],
    colors: ['R'],
    colorIdentity: ['R'],
    power: 3,
    toughness: 4,
    oracleText:
      'Flying\nWhenever you cast a noncreature spell, create an X/X red Dragon Illusion creature token with flying and haste, where X is the amount of mana spent to cast that spell. Exile that token at the beginning of the next end step.',
    abilities: [
      FLYING,
      {
        kind: 'triggered',
        trigger: {
          kind: 'castSpell',
          filter: { stackKind: 'spell', notTypes: ['creature'] },
          by: 'you',
        },
        effect: {
          kind: 'sequence',
          effects: [
            {
              kind: 'createToken',
              token: {
                kind: 'custom',
                definition: {
                  ...elemental(0, 0, [FLYING, HASTE]),
                  name: 'Dragon Illusion',
                  subtypes: ['Dragon', 'Illusion'],
                  colors: ['R'],
                },
                ptAmount: { kind: 'manaSpent', of: { kind: 'triggerSubject' } },
              },
              count: 1,
            },
            exileAtNextEndStep,
          ],
        },
      },
    ],
  }),
  // Spells of known mana values for the triggers that read "that spell's mana value" and "the greatest mana value".
  singleFace({
    name: 'SYNTHETIC Prismari Big Study',
    manaCost: ['4', 'U', 'U'],
    types: ['sorcery'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: 'Draw a card.',
    spell: { effect: { kind: 'draw', player: { kind: 'you' }, count: 1 } },
  }),
  singleFace({
    name: 'SYNTHETIC Prismari X Spell',
    manaCost: ['X', 'R'],
    types: ['instant'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText: 'You gain X life.',
    spell: {
      x: true,
      effect: { kind: 'gainLife', player: { kind: 'you' }, amount: { kind: 'x' } },
    },
  }),
  singleFace({
    name: 'SYNTHETIC Prismari Trinket',
    manaCost: ['2'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText: '',
  }),
  // "Instant and sorcery spells you cast cost {1} less to cast."
  singleFace({
    name: 'SYNTHETIC Prismari Discounter',
    manaCost: ['1'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText: 'Instant and sorcery spells you cast cost {1} less to cast.',
    abilities: [
      {
        kind: 'static',
        static: {
          kind: 'costReduction',
          spells: { controller: 'you', anyOf: INSTANT_OR_SORCERY },
          amount: 1,
        },
      },
    ],
  }),
  // A plain creature spell of mana value 2.
  singleFace({
    name: 'SYNTHETIC Prismari Apprentice',
    manaCost: ['1', 'R'],
    types: ['creature'],
    subtypes: ['Human', 'Wizard'],
    colors: ['R'],
    colorIdentity: ['R'],
    power: 2,
    toughness: 2,
    oracleText: '',
  }),
  // "Target player draws two cards. Flashback—{1}{U}, Pay 3 life."
  singleFace({
    name: 'SYNTHETIC Deep Study',
    manaCost: ['3', 'U'],
    types: ['sorcery'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: 'Target player draws two cards.\nFlashback\u2014{1}{U}, Pay 3 life.',
    abilities: [
      {
        kind: 'keyword',
        keyword: {
          kind: 'flashback',
          cost: [
            { kind: 'mana', symbols: ['1', 'U'] },
            { kind: 'payLife', amount: 3 },
          ],
        },
      },
    ],
    spell: {
      targets: [{ id: 't1', what: { kind: 'player', filter: 'any' } }],
      effect: { kind: 'draw', player: { kind: 'target', id: 't1' }, count: 2 },
    },
  }),
  // "Flash\nFlying\nThis creature can block only creatures with flying."
  singleFace({
    name: 'SYNTHETIC Skittish Borrower',
    manaCost: ['1', 'U', 'U'],
    types: ['creature'],
    subtypes: ['Faerie', 'Rogue'],
    colors: ['U'],
    colorIdentity: ['U'],
    power: 3,
    toughness: 1,
    oracleText: 'Flash\nFlying\nThis creature can block only creatures with flying.',
    abilities: [
      { kind: 'keyword', keyword: { kind: 'flash' } },
      FLYING,
      {
        kind: 'static',
        static: {
          kind: 'restriction',
          subject: { kind: 'this' },
          restriction: 'canBlockOnlyFlying',
        },
      },
    ],
  }),
  // "Add {R} for each card in target opponent's hand. Until end of turn, you don't lose this mana as steps and phases end. Exile this spell with three time counters on it.
  //  Suspend 3—{1}{R}"
  singleFace({
    name: 'SYNTHETIC Rushing Refrain',
    manaCost: ['3', 'R', 'R'],
    types: ['sorcery'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText:
      "Add {R} for each card in target opponent's hand. Until end of turn, you don't lose this mana as steps and phases end. Exile this spell with three time counters on it.\nSuspend 3\u2014{1}{R}",
    abilities: [
      {
        kind: 'keyword',
        keyword: { kind: 'suspend', count: 3, cost: [{ kind: 'mana', symbols: ['1', 'R'] }] },
      },
    ],
    spell: {
      targets: [{ id: 't1', what: { kind: 'player', filter: 'opponent' } }],
      effect: {
        kind: 'sequence',
        effects: [
          {
            kind: 'addMana',
            mana: {
              kind: 'fixed',
              mana: ['R'],
              times: {
                kind: 'countOf',
                filter: { zone: 'hand', owner: { kind: 'target', id: 't1' } },
              },
              staysUntilEndOfTurn: true,
            },
          },
          { kind: 'exileSpellWithTimeCounters', count: 3 },
        ],
      },
    },
  }),
  // "~ deals 4 damage divided as you choose among any number of targets. Tap two target permanents. Create a 4/4 blue and red Elemental creature token. Draw two cards.
  //  {U/R}{U/R}, Discard this card: Create a Treasure token."
  singleFace({
    name: 'SYNTHETIC Opus Burst',
    manaCost: ['6', 'U', 'R'],
    types: ['instant'],
    colors: ['U', 'R'],
    colorIdentity: ['U', 'R'],
    oracleText:
      'This spell deals 4 damage divided as you choose among any number of targets. Tap two target permanents. Create a 4/4 blue and red Elemental creature token. Draw two cards.\n{U/R}{U/R}, Discard this card: Create a Treasure token.',
    abilities: [
      {
        kind: 'activated',
        cost: [{ kind: 'mana', symbols: ['U/R', 'U/R'] }, { kind: 'discardThis' }],
        effect: { kind: 'createToken', token: { kind: 'preset', preset: 'Treasure' }, count: 1 },
        functionsIn: 'hand',
      },
    ],
    spell: {
      targets: [
        { id: 't1', what: { kind: 'anyTarget' }, divide: { total: 4 } },
        { id: 't2', what: { kind: 'object', filter: { zone: 'battlefield' } }, min: 2, max: 2 },
      ],
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'dealDividedDamage', to: { kind: 'target', id: 't1' } },
          { kind: 'tap', objects: { kind: 'target', id: 't2' } },
          {
            kind: 'createToken',
            token: { kind: 'custom', definition: elemental(4, 4) },
            count: 1,
          },
          { kind: 'draw', player: { kind: 'you' }, count: 2 },
        ],
      },
    },
  }),
  // "This spell costs {1} less to cast for each instant and sorcery card in your graveyard.\nFor each opponent, create two 3/3 blue and red Elemental creature tokens with flying
  //  that attack that opponent this turn if able. They gain haste until end of turn."
  singleFace({
    name: 'SYNTHETIC Flocking Gale',
    manaCost: ['8', 'R', 'R'],
    types: ['sorcery'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText:
      'This spell costs {1} less to cast for each instant and sorcery card in your graveyard.\nFor each opponent, create two 3/3 blue and red Elemental creature tokens with flying that attack that opponent this turn if able. They gain haste until end of turn.',
    abilities: [
      {
        kind: 'static',
        static: {
          kind: 'costReduction',
          spells: { kind: 'this' },
          amount: {
            kind: 'countOf',
            filter: { zone: 'graveyard', controller: 'you', anyOf: INSTANT_OR_SORCERY },
          },
        },
      },
    ],
    spell: {
      effect: {
        kind: 'sequence',
        effects: [
          {
            kind: 'createToken',
            token: { kind: 'custom', definition: elemental(3, 3, [FLYING]) },
            count: 2,
            forEachOpponent: { mustAttack: true },
          },
          {
            kind: 'grantKeyword',
            objects: MOVED,
            keyword: { kind: 'haste' },
            duration: 'untilEndOfTurn',
          },
        ],
      },
    },
  }),
  // "Whenever this creature deals combat damage to a player, draw a card.\nWhenever you cast an instant or sorcery spell with mana value 5 or greater, create a token that's a
  //  copy of this creature.\n{2}{U}: Creatures named ~ can't be blocked this turn." (the name written as the card's own)
  singleFace({
    name: 'SYNTHETIC Name Composer',
    manaCost: ['2', 'U'],
    types: ['creature'],
    subtypes: ['Human', 'Bard'],
    colors: ['U'],
    colorIdentity: ['U'],
    power: 1,
    toughness: 3,
    oracleText:
      "Whenever this creature deals combat damage to a player, draw a card.\nWhenever you cast an instant or sorcery spell with mana value 5 or greater, create a token that's a copy of this creature.\n{2}{U}: Creatures named SYNTHETIC Name Composer can't be blocked this turn.",
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'dealsCombatDamage', what: { kind: 'this' }, to: 'player' },
        effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
      },
      {
        kind: 'triggered',
        trigger: {
          kind: 'castSpell',
          filter: {
            stackKind: 'spell',
            manaValue: { cmp: 'atLeast', value: 5 },
            anyOf: INSTANT_OR_SORCERY,
          },
          by: 'you',
        },
        effect: {
          kind: 'createToken',
          token: { kind: 'copyOf', object: { kind: 'this' } },
          count: 1,
        },
      },
      {
        kind: 'activated',
        cost: [{ kind: 'mana', symbols: ['2', 'U'] }],
        effect: {
          kind: 'restrict',
          objects: {
            kind: 'each',
            filter: { types: ['creature'], named: 'SYNTHETIC Name Composer' },
          },
          restriction: 'cantBeBlocked',
          duration: 'untilEndOfTurn',
        },
      },
    ],
  }),
  // "This land enters tapped.\n{T}: Add {U} or {R}.\n{U}{R}: Until end of turn, this land becomes a 2/1 blue and red Elemental creature with \"During your turn, this creature has first
  //  strike.\" It's still a land.\nWhenever this land attacks, scry 1."
  singleFace({
    name: 'SYNTHETIC Spire Land',
    manaCost: null,
    types: ['land'],
    colors: [],
    colorIdentity: ['U', 'R'],
    oracleText:
      'This land enters tapped.\n{T}: Add {U} or {R}.\n{U}{R}: Until end of turn, this land becomes a 2/1 blue and red Elemental creature with "During your turn, this creature has first strike." It\u2019s still a land.\nWhenever this land attacks, scry 1.',
    abilities: [
      { kind: 'replacement', replacement: { kind: 'entersTapped' } },
      {
        kind: 'mana',
        cost: [{ kind: 'tap' }],
        production: { kind: 'oneOf', colors: ['U', 'R'] },
      },
      {
        kind: 'activated',
        cost: [{ kind: 'mana', symbols: ['U', 'R'] }],
        effect: {
          kind: 'sequence',
          effects: [
            {
              kind: 'setTypes',
              objects: { kind: 'this' },
              types: ['creature'],
              subtypes: ['Elemental'],
              additive: true,
              duration: 'untilEndOfTurn',
            },
            {
              kind: 'setColors',
              objects: { kind: 'this' },
              colors: ['U', 'R'],
              duration: 'untilEndOfTurn',
            },
            {
              kind: 'setPt',
              objects: { kind: 'this' },
              power: 2,
              toughness: 1,
              duration: 'untilEndOfTurn',
            },
            {
              kind: 'grantKeyword',
              objects: { kind: 'this' },
              keyword: { kind: 'firstStrike' },
              duration: 'untilEndOfTurn',
              duringYourTurn: true,
            },
          ],
        },
      },
      {
        kind: 'triggered',
        trigger: { kind: 'attacks', what: { kind: 'this' } },
        effect: { kind: 'scry', count: 1 },
      },
    ],
  }),
  // "Flying\nWhen this creature enters, create a Treasure token.\nArtifacts you control have \"{T}: Add one mana of any color. Spend this mana only to cast an instant or sorcery spell.\""
  singleFace({
    name: 'SYNTHETIC Prism Dragon',
    manaCost: ['2', 'U', 'R'],
    supertypes: ['legendary'],
    types: ['creature'],
    subtypes: ['Elder', 'Dragon'],
    colors: ['U', 'R'],
    colorIdentity: ['U', 'R'],
    power: 4,
    toughness: 4,
    oracleText:
      'Flying\nWhen this creature enters, create a Treasure token.\nArtifacts you control have "{T}: Add one mana of any color. Spend this mana only to cast an instant or sorcery spell."',
    abilities: [
      FLYING,
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
        effect: { kind: 'createToken', token: { kind: 'preset', preset: 'Treasure' }, count: 1 },
      },
      {
        kind: 'static',
        static: {
          kind: 'grantAbility',
          subject: { kind: 'filter', filter: { types: ['artifact'], controller: 'you' } },
          ability: {
            kind: 'mana',
            cost: [{ kind: 'tap' }],
            production: { kind: 'anyColor' },
            spendOnly: { types: ['instant', 'sorcery'] },
          },
        },
      },
    ],
  }),
];
