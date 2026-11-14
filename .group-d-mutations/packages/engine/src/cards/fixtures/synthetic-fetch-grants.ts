/**
 * SYNTHETIC CARDS FOR FETCHING, A REFLEXIVE TRIGGER AFTER A SACRIFICE, A TRIGGER ON BEING TARGETED BY A SPELL, AND ABILITIES GIVEN TO A GROUP.
 * NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of D-177 (the Korvold slice 2): what a search leaves as "it" (`moved`, CR 400.7j, 701.23), a reflexive triggered ability
 * (CR 603.12) after a sacrifice that is not an offer and one that reads the permanent that was sacrificed (CR 608.2h), a trigger that is for spells and
 * not for abilities (CR 603.2, 601.2c), a mana ability that sacrifices its permanent given to a group (CR 605.1a, 613.1f) and an activated ability
 * given to a group (CR 602). Names start with "SYNTHETIC "; oracleId is null. The text describes what the AST does; it is not Oracle text, and none of
 * these is the definition of a real card.
 */
import type { Ability, Effect, ManaAbility, ObjectFilter } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const YOU = { kind: 'you' } as const;
const THIS = { kind: 'this' } as const;
const MOVED = { kind: 'moved' } as const;
const TAP = { kind: 'tap' } as const;
const SACRIFICE_THIS = { kind: 'sacrifice', what: THIS } as const;
const BASIC_LAND: ObjectFilter = { types: ['land'], supertypes: ['basic'] };
const TREASURE = { kind: 'createToken', token: { kind: 'preset', preset: 'Treasure' } } as const;

const search = (
  filter: ObjectFilter,
  max: number,
  destinations: Extract<Effect, { kind: 'search' }>['destinations'],
): Effect => ({
  kind: 'search',
  player: YOU,
  filter,
  max,
  destinations,
  reveal: false,
  shuffle: true,
});

const endStep = { kind: 'endStep', whose: 'you' } as const;

export const SYNTHETIC_FETCH_GRANTS_LIST: readonly CardDefinition[] = [
  // "{T}, Sacrifice this land: Search your library for a basic land card, put it onto the battlefield tapped, then shuffle. Then if you control four or
  // more lands, untap that land." (the later instruction names what the search put onto the battlefield)
  singleFace({
    name: 'SYNTHETIC Fetch Gate',
    manaCost: null,
    types: ['land'],
    colors: [],
    colorIdentity: [],
    oracleText:
      '{T}, Sacrifice this land: Search your library for a basic land card, put it onto the battlefield tapped, then shuffle. Then if you control four or more lands, untap that land.',
    abilities: [
      {
        kind: 'activated',
        cost: [TAP, SACRIFICE_THIS],
        effect: {
          kind: 'sequence',
          effects: [
            search(BASIC_LAND, 1, [{ zone: 'battlefield', tapped: true, count: 1 }]),
            {
              kind: 'conditional',
              condition: { kind: 'controlsAtLeast', filter: { types: ['land'] }, count: 4 },
              effect: { kind: 'untap', objects: MOVED },
            },
          ],
        },
      },
    ],
  }),
  // "Search your library for a creature card, put it into your hand, then shuffle. You gain life equal to its power." (`moved` is the card in the hand)
  singleFace({
    name: 'SYNTHETIC Seeker Rite',
    manaCost: ['1', 'G'],
    types: ['sorcery'],
    colors: ['G'],
    colorIdentity: ['G'],
    oracleText:
      'Search your library for a creature card, put it into your hand, then shuffle. You gain life equal to its power.',
    spell: {
      effect: {
        kind: 'sequence',
        effects: [
          search({ types: ['creature'] }, 1, [{ zone: 'hand', count: 1 }]),
          {
            kind: 'gainLife',
            player: YOU,
            amount: { kind: 'powerOf', of: MOVED },
          },
        ],
      },
    },
  }),
  // "Search your library for up to two basic land cards, put them onto the battlefield tapped, then shuffle. Untap them." (two cards are "them")
  singleFace({
    name: 'SYNTHETIC Twin Seeker',
    manaCost: ['2', 'G'],
    types: ['sorcery'],
    colors: ['G'],
    colorIdentity: ['G'],
    oracleText:
      'Search your library for up to two basic land cards, put them onto the battlefield tapped, then shuffle. Untap them.',
    spell: {
      effect: {
        kind: 'sequence',
        effects: [
          search(BASIC_LAND, 2, [{ zone: 'battlefield', tapped: true, count: 2 }]),
          { kind: 'untap', objects: MOVED },
        ],
      },
    },
  }),
  // Two searches, then "untap it": "it" is what the second search found (the card in the hand), not the land the first one put onto the battlefield.
  singleFace({
    name: 'SYNTHETIC Double Seeker',
    manaCost: ['3', 'G'],
    types: ['sorcery'],
    colors: ['G'],
    colorIdentity: ['G'],
    oracleText:
      'Search your library for a basic land card, put it onto the battlefield tapped, then shuffle. Search your library for a creature card, put it into your hand, then shuffle. Untap it.',
    spell: {
      effect: {
        kind: 'sequence',
        effects: [
          search(BASIC_LAND, 1, [{ zone: 'battlefield', tapped: true, count: 1 }]),
          search({ types: ['creature'] }, 1, [{ zone: 'hand', count: 1 }]),
          { kind: 'untap', objects: MOVED },
        ],
      },
    },
  }),
  // "When this land enters, sacrifice it. When you do, search your library for a basic Forest or Island card, put it onto the battlefield tapped, then
  // shuffle and you gain 1 life." (a reflexive trigger after a sacrifice that is not an offer; a list of basic land types)
  singleFace({
    name: 'SYNTHETIC Passing Land',
    manaCost: null,
    types: ['land'],
    colors: [],
    colorIdentity: [],
    oracleText:
      'When this land enters, sacrifice it. When you do, search your library for a basic Forest or Island card, put it onto the battlefield tapped, then shuffle and you gain 1 life.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: THIS },
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'sacrifice', objects: THIS },
            {
              kind: 'reflexive',
              effect: {
                kind: 'sequence',
                effects: [
                  search(
                    {
                      types: ['land'],
                      supertypes: ['basic'],
                      anyOf: [{ subtypes: ['Forest'] }, { subtypes: ['Island'] }],
                    },
                    1,
                    [{ zone: 'battlefield', tapped: true, count: 1 }],
                  ),
                  { kind: 'gainLife', player: YOU, amount: 1 },
                ],
              },
            },
          ],
        },
      },
    ],
  }),
  // "When this creature enters, sacrifice another creature. When you do, you gain life equal to that creature's power."
  singleFace({
    name: 'SYNTHETIC Grim Tither',
    manaCost: ['2', 'B'],
    types: ['creature'],
    subtypes: ['Zombie'],
    colors: ['B'],
    colorIdentity: ['B'],
    power: 2,
    toughness: 2,
    oracleText:
      "When this creature enters, sacrifice another creature. When you do, you gain life equal to that creature's power.",
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: THIS },
        effect: {
          kind: 'sequence',
          effects: [
            {
              kind: 'sacrifice',
              objects: { kind: 'choose', filter: { types: ['creature'], other: true } },
            },
            {
              kind: 'reflexive',
              effect: {
                kind: 'gainLife',
                player: YOU,
                amount: { kind: 'powerOf', of: { kind: 'sacrificed' } },
              },
            },
          ],
        },
      },
    ],
  }),
  // "At the beginning of your end step, you may sacrifice another creature. When you do, this creature deals damage equal to that creature's power to any
  // target and you create three Treasure tokens."
  singleFace({
    name: 'SYNTHETIC Pyre Warden',
    manaCost: ['3', 'R'],
    types: ['creature'],
    subtypes: ['Demon'],
    colors: ['R'],
    colorIdentity: ['R'],
    power: 3,
    toughness: 3,
    oracleText:
      "At the beginning of your end step, you may sacrifice another creature. When you do, this creature deals damage equal to that creature's power to any target and you create three Treasure tokens.",
    abilities: [
      {
        kind: 'triggered',
        trigger: endStep,
        effect: {
          kind: 'sequence',
          effects: [
            {
              kind: 'may',
              effect: {
                kind: 'sacrifice',
                objects: { kind: 'choose', filter: { types: ['creature'], other: true } },
              },
            },
            {
              kind: 'reflexive',
              targets: [{ id: 't1', what: { kind: 'anyTarget' } }],
              effect: {
                kind: 'sequence',
                effects: [
                  {
                    kind: 'dealDamage',
                    amount: { kind: 'powerOf', of: { kind: 'sacrificed' } },
                    to: { kind: 'target', id: 't1' },
                  },
                  { ...TREASURE, count: 3 },
                ],
              },
            },
          ],
        },
      },
    ],
  }),
  // "Whenever this creature becomes the target of a spell, create a Treasure token." (a spell: an ability that targets it does not trigger it)
  singleFace({
    name: 'SYNTHETIC Spell Magnet',
    manaCost: ['2', 'R'],
    types: ['creature'],
    subtypes: ['Dragon'],
    colors: ['R'],
    colorIdentity: ['R'],
    power: 2,
    toughness: 2,
    oracleText: 'Whenever this creature becomes the target of a spell, create a Treasure token.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'becomesTarget', what: THIS, by: 'any', spellOnly: true },
        effect: { ...TREASURE, count: 1 },
      },
    ],
  }),
  // "Treasures you control have "{T}, Sacrifice this artifact: Add two mana of any one color."" (a mana ability with a sacrifice cost, given to a group)
  singleFace({
    name: 'SYNTHETIC Gilded Banner',
    manaCost: ['3'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText:
      'Treasures you control have "{T}, Sacrifice this artifact: Add two mana of any one color."',
    abilities: [
      {
        kind: 'static',
        static: {
          kind: 'grantAbility',
          subject: { kind: 'filter', filter: { subtypes: ['Treasure'], controller: 'you' } },
          ability: {
            kind: 'mana',
            cost: [TAP, SACRIFICE_THIS],
            production: { kind: 'anyColor', count: 2 },
          } satisfies ManaAbility,
        },
      },
    ],
  }),
  // "Lands you control have "{T}: Create a Treasure token."" (an activated ability, not a mana ability, given to a group)
  singleFace({
    name: 'SYNTHETIC Coin Shrine',
    manaCost: ['5', 'G'],
    types: ['artifact'],
    colors: ['G'],
    colorIdentity: ['G'],
    oracleText: 'Lands you control have "{T}: Create a Treasure token."',
    abilities: [
      {
        kind: 'static',
        static: {
          kind: 'grantAbility',
          subject: { kind: 'filter', filter: { types: ['land'], controller: 'you' } },
          ability: {
            kind: 'activated',
            cost: [TAP],
            effect: { ...TREASURE, count: 1 },
          } satisfies Ability,
        },
      },
    ],
  }),
];
