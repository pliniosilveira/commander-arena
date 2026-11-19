/**
 * SYNTHETIC CARDS FOR "YOU MAY CAST A SPELL FROM YOUR HAND WITHOUT PAYING ITS MANA COST" AND HIDEAWAY. NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of D-145 (the Dinosaurs slice): a sorcery and an instant that let their controller cast a spell with a mana
 * value limit from their hand without paying its mana cost (`castFree`), one that also lets them play a land (`play`), and the permanents with
 * Hideaway (`hideaway`): a land that enters tapped and lets its controller play the exiled card for {G} and {T} if their creatures have a
 * total power of 5 or greater, and an artifact that lets them play it for {2} and {T} with no condition. Names start with "SYNTHETIC ";
 * oracleId is null. The text describes what the AST does; it is not Oracle text, and none of these is the definition of a real card.
 */
import type { Ability, ObjectFilter } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const FROM_HAND = (filter: ObjectFilter) =>
  ({ kind: 'choose', filter: { zone: 'hand', ...filter } }) as const;
const SPELL_MV = (value: number): ObjectFilter => ({
  notTypes: ['land'],
  manaValue: { cmp: 'atMost', value },
});

const rite = (
  name: string,
  types: 'sorcery' | 'instant',
  filter: ObjectFilter,
  play: boolean,
  words: string,
): CardDefinition =>
  singleFace({
    name,
    manaCost: ['1', 'G'],
    types: [types],
    colors: ['G'],
    colorIdentity: ['G'],
    oracleText: words,
    spell: {
      effect: {
        kind: 'castFree',
        objects: FROM_HAND(filter),
        ...(play ? { play: true as const } : {}),
      },
    },
  });

const playExiled = (cost: Extract<Ability, { kind: 'activated' }>['cost']): Ability => ({
  kind: 'activated',
  cost,
  effect: { kind: 'castFree', objects: { kind: 'linkedExile' }, play: true },
});

export const SYNTHETIC_FREE_CAST_LIST: readonly CardDefinition[] = [
  rite(
    'SYNTHETIC Free Cast Rite',
    'sorcery',
    SPELL_MV(5),
    false,
    'You may cast a spell with mana value 5 or less from your hand without paying its mana cost.',
  ),
  rite(
    'SYNTHETIC Small Free Rite',
    'sorcery',
    SPELL_MV(3),
    false,
    'You may cast a spell with mana value 3 or less from your hand without paying its mana cost.',
  ),
  rite(
    'SYNTHETIC Quick Free Rite',
    'instant',
    SPELL_MV(5),
    false,
    'You may cast a spell with mana value 5 or less from your hand without paying its mana cost.',
  ),
  rite(
    'SYNTHETIC Quick Free Play Rite',
    'instant',
    { manaValue: { cmp: 'atMost', value: 5 } },
    true,
    'You may play a card with mana value 5 or less from your hand without paying its mana cost.',
  ),
  // CR 608.2g, 118.9: "Look at the top seven cards of your library. You may cast an instant or sorcery spell with mana value less than or equal to this creature's
  // power from among them without paying its mana cost. Put the rest on the bottom of your library in a random order."
  singleFace({
    name: 'SYNTHETIC Lorehold Scout',
    manaCost: ['2', 'R'],
    types: ['creature'],
    colors: ['R'],
    colorIdentity: ['R'],
    power: 3,
    toughness: 3,
    oracleText:
      "{T}: Look at the top seven cards of your library. You may cast an instant or sorcery spell with mana value less than or equal to this creature's power from among them without paying its mana cost. Put the rest on the bottom of your library in a random order.",
    abilities: [
      {
        kind: 'activated',
        cost: [{ kind: 'tap' }],
        effect: {
          kind: 'lookAtTop',
          count: 7,
          take: {
            filter: { anyOf: [{ types: ['instant'] }, { types: ['sorcery'] }] },
            max: 1,
            to: 'castFree',
            manaValueAtMost: { kind: 'powerOf', of: { kind: 'this' } },
          },
          rest: 'bottomRandom',
        },
      },
    ],
  }),
  // CR 701.6a, 614.1a, 608.2g, 603.4: "Flash. When this creature enters, if you cast it, counter target spell. If that spell is countered this way, exile it instead of
  // putting it into its owner's graveyard, then you may cast it without paying its mana cost."
  singleFace({
    name: 'SYNTHETIC Thief Dragon',
    manaCost: ['2', 'U'],
    types: ['creature'],
    subtypes: ['Dragon'],
    colors: ['U'],
    colorIdentity: ['U'],
    power: 2,
    toughness: 2,
    oracleText:
      "Flash. When this creature enters, if you cast it, counter target spell. If that spell is countered this way, exile it instead of putting it into its owner's graveyard, then you may cast it without paying its mana cost.",
    abilities: [
      { kind: 'keyword', keyword: { kind: 'flash' } },
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
        interveningIf: { kind: 'wasCast' },
        targets: [
          { id: 't1', what: { kind: 'object', filter: { zone: 'stack', stackKind: 'spell' } } },
        ],
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'counter', objects: { kind: 'target', id: 't1' }, exileInstead: true },
            { kind: 'castFree', objects: { kind: 'moved' } },
          ],
        },
      },
    ],
  }),
  // CR 701.8, 701.13, 608.2g: "Destroy target artifact or creature you don't control. If that permanent is destroyed this way, its controller exiles cards from the top of their
  // library until they exile a nonland card, then they may cast that card without paying its mana cost."
  singleFace({
    name: 'SYNTHETIC Flourish',
    manaCost: ['2', 'R'],
    types: ['instant'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText:
      "Destroy target artifact or creature you don't control. If that permanent is destroyed this way, its controller exiles cards from the top of their library until they exile a nonland card, then they may cast that card without paying its mana cost.",
    spell: {
      targets: [
        {
          id: 't1',
          what: {
            kind: 'object',
            filter: {
              zone: 'battlefield',
              controller: 'opponent',
              anyOf: [{ types: ['artifact'] }, { types: ['creature'] }],
            },
          },
        },
      ],
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'destroy', objects: { kind: 'target', id: 't1' } },
          {
            kind: 'conditional',
            condition: { kind: 'thisWayAtLeast', what: 'destroyed', count: 1 },
            effect: {
              kind: 'sequence',
              effects: [
                {
                  kind: 'exileUntilFound',
                  players: { kind: 'controllerOf', of: { kind: 'target', id: 't1' } },
                  filter: { notTypes: ['land'] },
                },
                {
                  kind: 'castFree',
                  objects: { kind: 'moved' },
                  filter: { notTypes: ['land'] },
                  player: { kind: 'controllerOf', of: { kind: 'target', id: 't1' } },
                },
              ],
            },
          },
        ],
      },
    },
  }),
  // CR 107.3a, 202.3: "mana value X or less" is the X announced for this spell.
  singleFace({
    name: 'SYNTHETIC X Burn Free Rite',
    manaCost: ['X', 'R'],
    types: ['instant'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText:
      'Deals X damage to any target. You may cast a spell with mana value X or less from your hand without paying its mana cost.',
    spell: {
      x: true,
      targets: [{ id: 't1', what: { kind: 'anyTarget' } }],
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'dealDamage', amount: { kind: 'x' }, to: { kind: 'target', id: 't1' } },
          {
            kind: 'castFree',
            objects: {
              kind: 'choose',
              filter: { zone: 'hand', notTypes: ['land'], manaValueAtMost: { kind: 'x' } },
            },
          },
        ],
      },
    },
  }),
  // The filter does not say "not a land": a land card is still never cast (CR 305.1), so none is offered.
  rite(
    'SYNTHETIC Free Spell Rite',
    'sorcery',
    { manaValue: { cmp: 'atMost', value: 5 } },
    false,
    'You may cast a card with mana value 5 or less from your hand without paying its mana cost.',
  ),
  rite(
    'SYNTHETIC Free Play Rite',
    'sorcery',
    { manaValue: { cmp: 'atMost', value: 5 } },
    true,
    'You may play a card with mana value 5 or less from your hand without paying its mana cost.',
  ),
  singleFace({
    name: 'SYNTHETIC Hidden Vault',
    manaCost: null,
    types: ['land'],
    colors: [],
    colorIdentity: ['G'],
    oracleText:
      'Hideaway 4. This land enters tapped. {T}: Add {G}. {G}, {T}: You may play the exiled card without paying its mana cost if creatures you control have total power 5 or greater.',
    abilities: [
      { kind: 'keyword', keyword: { kind: 'hideaway', count: 4 } },
      { kind: 'replacement', replacement: { kind: 'entersTapped' } },
      { kind: 'mana', cost: [{ kind: 'tap' }], production: { kind: 'fixed', mana: ['G'] } },
      {
        kind: 'activated',
        cost: [{ kind: 'mana', symbols: ['G'] }, { kind: 'tap' }],
        effect: {
          kind: 'conditional',
          condition: {
            kind: 'amountIs',
            amount: {
              kind: 'aggregate',
              how: 'total',
              stat: 'power',
              filter: { types: ['creature'], controller: 'you' },
            },
            compare: { cmp: 'atLeast', value: 5 },
          },
          effect: { kind: 'castFree', objects: { kind: 'linkedExile' }, play: true },
        },
      },
    ],
  }),
  singleFace({
    name: 'SYNTHETIC Hidden Cache',
    manaCost: ['1'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText: 'Hideaway 3. {2}, {T}: You may play the exiled card without paying its mana cost.',
    abilities: [
      { kind: 'keyword', keyword: { kind: 'hideaway', count: 3 } },
      playExiled([{ kind: 'mana', symbols: ['2'] }, { kind: 'tap' }]),
    ],
  }),
  // Takes a hideaway permanent off the battlefield, so a test can see the card it exiled lose its link (CR 400.7).
  singleFace({
    name: 'SYNTHETIC Cache Smasher',
    manaCost: ['R'],
    types: ['instant'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText: 'Destroy target artifact.',
    spell: {
      targets: [
        {
          id: 't1',
          what: { kind: 'object', filter: { zone: 'battlefield', types: ['artifact'] } },
        },
      ],
      effect: { kind: 'destroy', objects: { kind: 'target', id: 't1' } },
    },
  }),
];
