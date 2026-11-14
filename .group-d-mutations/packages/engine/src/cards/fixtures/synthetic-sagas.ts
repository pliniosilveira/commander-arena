/**
 * SYNTHETIC SAGA CARDS. NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of Saga cards (CR 714): lore counters, chapter abilities and the Saga
 * being sacrificed after its final chapter. Names start with "SYNTHETIC "; oracleId is null. The
 * text describes what the AST does; it is not Oracle text and none of these copies a real card. The
 * chapter lines are written the way Scryfall prints a Saga ("I — ...", "I, II — ...").
 */
import type { Effect } from '../../ast/types';
import type { Color } from '../../characteristics';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const YOU = { kind: 'you' } as const;
const gain = (amount: number): Effect => ({ kind: 'gainLife', player: YOU, amount });

interface Chapter {
  readonly from: number;
  readonly to: number;
  readonly effect: Effect;
}

/** A Saga: one enchantment face with the subtype Saga, a final chapter and its chapter abilities. */
function saga(
  name: string,
  manaCost: readonly string[],
  color: Color,
  oracleText: string,
  chapters: readonly Chapter[],
): CardDefinition {
  const base = singleFace({
    name,
    manaCost,
    types: ['enchantment'],
    subtypes: ['Saga'],
    colors: [color],
    colorIdentity: [color],
    oracleText,
    abilities: chapters.map((c) => ({
      kind: 'triggered' as const,
      trigger: { kind: 'chapter' as const, from: c.from, to: c.to },
      effect: c.effect,
    })),
  });
  const face = base.faces[0];
  if (face === undefined) throw new Error(`${name} has no face`);
  return {
    ...base,
    layout: 'saga',
    faces: [{ ...face, finalChapter: Math.max(...chapters.map((c) => c.to)) }],
  };
}

const SAGA_TARGET = {
  id: 't1',
  what: { kind: 'object', filter: { zone: 'battlefield', subtypes: ['Saga'] } },
} as const;
const T1 = { kind: 'target', id: 't1' } as const;

export const SYNTHETIC_SAGA_LIST: readonly CardDefinition[] = [
  // Three chapters, each different, so a test can tell which of them resolved.
  saga(
    'SYNTHETIC Rite of Three',
    ['2', 'W'],
    'W',
    'I — You gain 1 life.\nII — You gain 2 life.\nIII — You gain 4 life.',
    [
      { from: 1, to: 1, effect: gain(1) },
      { from: 2, to: 2, effect: gain(2) },
      { from: 3, to: 3, effect: gain(4) },
    ],
  ),
  // A chapter ability that covers two chapters (CR 714.2c).
  saga(
    'SYNTHETIC Echo Verse',
    ['1', 'U'],
    'U',
    'I, II — You gain 1 life.\nIII — You gain 5 life.',
    [
      { from: 1, to: 2, effect: gain(1) },
      { from: 3, to: 3, effect: gain(5) },
    ],
  ),
  // The usual shape: the last chapter puts a creature onto the battlefield.
  saga(
    'SYNTHETIC Rising Golem',
    ['3', 'R'],
    'R',
    'I — You gain 1 life.\nII — You gain 1 life.\nIII — Create a 3/3 colorless Golem artifact creature token.',
    [
      { from: 1, to: 1, effect: gain(1) },
      { from: 2, to: 2, effect: gain(1) },
      {
        from: 3,
        to: 3,
        effect: {
          kind: 'createToken',
          count: 1,
          token: {
            kind: 'custom',
            definition: {
              name: 'Golem',
              manaCost: null,
              supertypes: [],
              types: ['artifact', 'creature'],
              subtypes: ['Golem'],
              colors: [],
              power: 3,
              toughness: 3,
              loyalty: null,
              defense: null,
              oracleText: '',
              abilities: [],
            },
          },
        },
      },
    ],
  ),
  // Two chapters only: the shortest Saga, for the sacrifice and the extra counter.
  saga('SYNTHETIC Brief Tale', ['W'], 'W', 'I — You gain 1 life.\nII — You gain 2 life.', [
    { from: 1, to: 1, effect: gain(1) },
    { from: 2, to: 2, effect: gain(2) },
  ]),
  // Lore counters put on a Saga by an effect trigger its chapters like the turn-based one (CR 714.2b).
  singleFace({
    name: 'SYNTHETIC Lore Surge',
    manaCost: ['W'],
    types: ['instant'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText: 'Put a lore counter on target Saga.',
    spell: {
      targets: [SAGA_TARGET],
      effect: { kind: 'addCounters', objects: T1, counter: 'lore', count: 1 },
    },
  }),
  // Two at once: several chapters are reached by one event (CR 714.2b, 714.2c).
  singleFace({
    name: 'SYNTHETIC Lore Flood',
    manaCost: ['1', 'W'],
    types: ['instant'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText: 'Put two lore counters on target Saga.',
    spell: {
      targets: [SAGA_TARGET],
      effect: { kind: 'addCounters', objects: T1, counter: 'lore', count: 2 },
    },
  }),
  // A Saga that leaves the battlefield before its final chapter.
  singleFace({
    name: 'SYNTHETIC Saga Breaker',
    manaCost: ['W'],
    types: ['instant'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText: 'Destroy target Saga.',
    spell: { targets: [SAGA_TARGET], effect: { kind: 'destroy', objects: T1 } },
  }),
  // A Saga that leaves and comes back is a new object with one lore counter (CR 400.7, 714.3a).
  singleFace({
    name: 'SYNTHETIC Saga Flicker',
    manaCost: ['1', 'U'],
    types: ['instant'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: "Exile target Saga, then return it to the battlefield under its owner's control.",
    spell: {
      targets: [SAGA_TARGET],
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'exile', objects: T1 },
          {
            kind: 'moveToZone',
            objects: { kind: 'moved' },
            to: 'battlefield',
            controller: 'owner',
          },
        ],
      },
    },
  }),
  // A token copy of a Saga enters with a lore counter too (CR 707.2, 714.3a).
  singleFace({
    name: 'SYNTHETIC Saga Mirror',
    manaCost: ['2', 'U'],
    types: ['instant'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: 'Create a token that is a copy of target Saga.',
    spell: {
      // The filter names the enchantment type so that it cannot be a land or an Aura (see
      // `copySourceIssues` in ast/supported.ts).
      targets: [
        {
          id: 't1',
          what: {
            kind: 'object',
            filter: { zone: 'battlefield', types: ['enchantment'], subtypes: ['Saga'] },
          },
        },
      ],
      effect: { kind: 'createToken', count: 1, token: { kind: 'copyOf', object: T1 } },
    },
  }),
];
