/**
 * SYNTHETIC CARDS FOR A TOKEN COPY OF A CARD EXILED FROM A GRAVEYARD (issue 104, CR 707.2, 707.9b, 608.2c). NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of the shapes of God-Pharaoh's Gift ("you may exile a creature card from your graveyard. If you do, create a token that's a copy of that card, except it's a
 * 4/4 black Zombie. It gains haste until end of turn": `moveToZone` to exile of an optional `choose`, a `conditional` on `didPrevious`, a `createToken` of a `copyOf` the `moved` card)
 * and of The Scarab God ("exile target creature card from a graveyard. Create a token that's a copy of it, except it's a 4/4 black Zombie").
 * Names start with "SYNTHETIC "; oracleId is null. The text describes what the AST does; it is not Oracle text, and none of these is the definition of a real card.
 */
import type { Ability } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const COPY_EXCEPTIONS = {
  setPt: { power: 4, toughness: 4 },
  setColors: ['B'],
  setCreatureTypes: ['Zombie'],
} as const;

/** "you may exile a [filter] card from your graveyard. If you do, create a token that's a copy of that card, except it's a 4/4 black Zombie. It gains haste until end of turn." */
const reanimateAsZombie = (types: readonly ('creature' | 'artifact')[]): Ability => ({
  kind: 'triggered',
  trigger: { kind: 'step', step: 'beginCombat', whose: 'you' },
  effect: {
    kind: 'sequence',
    effects: [
      {
        kind: 'moveToZone',
        objects: {
          kind: 'choose',
          filter: { zone: 'graveyard', controller: 'you', types: [...types] },
          optional: true,
        },
        to: 'exile',
      },
      {
        kind: 'conditional',
        condition: { kind: 'didPrevious' },
        effect: {
          kind: 'createToken',
          token: { kind: 'copyOf', object: { kind: 'moved' }, ...COPY_EXCEPTIONS },
          count: 1,
        },
      },
      {
        kind: 'grantKeyword',
        objects: { kind: 'moved' },
        keyword: { kind: 'haste' },
        duration: 'untilEndOfTurn',
      },
    ],
  },
});

export const SYNTHETIC_GRAVEYARD_COPY_LIST: readonly CardDefinition[] = [
  // The shape of God-Pharaoh's Gift: an artifact that, at the beginning of combat on its controller's turn, may exile a creature card from their graveyard for a 4/4 black Zombie copy with haste.
  singleFace({
    name: 'SYNTHETIC Grave Idol',
    manaCost: ['7'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText:
      "At the beginning of combat on your turn, you may exile a creature card from your graveyard. If you do, create a token that's a copy of that card, except it's a 4/4 black Zombie. It gains haste until end of turn.",
    abilities: [reanimateAsZombie(['creature'])],
  }),
  // The offer after another instruction that did something: "mill a card. You may exile a creature card from your graveyard. If you do, draw a card": the mill is not what "if you do" reads.
  singleFace({
    name: 'SYNTHETIC Grave Reader',
    manaCost: ['3'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText:
      'At the beginning of combat on your turn, mill a card. You may exile a creature card from your graveyard. If you do, draw a card.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'step', step: 'beginCombat', whose: 'you' },
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'mill', player: { kind: 'you' }, count: 1 },
            {
              kind: 'moveToZone',
              objects: {
                kind: 'choose',
                filter: { zone: 'graveyard', controller: 'you', types: ['creature'] },
                optional: true,
              },
              to: 'exile',
            },
            {
              kind: 'conditional',
              condition: { kind: 'didPrevious' },
              effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
            },
          ],
        },
      },
    ],
  }),
  // The shape of the activated ability of The Scarab God: {2}{U}{B}, exile target creature card from a graveyard, create a 4/4 black Zombie copy.
  singleFace({
    name: 'SYNTHETIC Grave Scarab',
    manaCost: ['3', 'U', 'B'],
    types: ['creature'],
    subtypes: ['Zombie', 'God'],
    colors: ['U', 'B'],
    colorIdentity: ['U', 'B'],
    power: 5,
    toughness: 5,
    oracleText:
      "{2}{U}{B}: Exile target creature card from a graveyard. Create a token that's a copy of it, except it's a 4/4 black Zombie.",
    abilities: [
      {
        kind: 'activated',
        cost: [{ kind: 'mana', symbols: ['2', 'U', 'B'] }],
        targets: [
          {
            id: 't1',
            what: { kind: 'object', filter: { zone: 'graveyard', types: ['creature'] } },
          },
        ],
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'exile', objects: { kind: 'target', id: 't1' } },
            {
              kind: 'createToken',
              token: { kind: 'copyOf', object: { kind: 'target', id: 't1' }, ...COPY_EXCEPTIONS },
              count: 1,
            },
          ],
        },
      },
    ],
  }),
];
