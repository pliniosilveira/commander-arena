/**
 * SYNTHETIC MORE-MANA CARDS. NOT REAL MAGIC CARDS.
 *
 * Invented for the tests and the soak games of D-099: mana of a type that other lands "could
 * produce" (CR 106.7), a filter land with a hybrid cost and a choice among combinations (CR 107.4e,
 * 605.3b), "Activate only if ..." on mana abilities (CR 602.5b), a mana ability that costs life (CR
 * 119.4, 605.3) and a static ability that gives lands a mana ability (CR 613.1f). Names start with
 * "SYNTHETIC "; oracleId is null. The text describes what the AST does; it is not Oracle text, and
 * none of these is the definition of a real card.
 */
import type { Condition, Cost, ManaAbility, ManaProduction, StaticSubject } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const tap: Cost = { kind: 'tap' };
const OPPONENT_LAND = { types: ['land'], controller: 'opponent' } as const;
const YOUR_LAND = { types: ['land'], controller: 'you' } as const;
const YOUR_LANDS: StaticSubject = { kind: 'filter', filter: YOUR_LAND };

const mana = (
  cost: readonly Cost[],
  production: ManaProduction,
  activateOnlyIf?: Condition,
): ManaAbility => ({
  kind: 'mana',
  cost,
  production,
  ...(activateOnlyIf === undefined ? {} : { activateOnlyIf }),
});

const CONTROL_A_SWAMP: Condition = {
  kind: 'controlsAtLeast',
  filter: { types: ['land'], subtypes: ['Swamp'] },
  count: 1,
};

const land = (
  name: string,
  identity: readonly ('W' | 'U' | 'B' | 'R' | 'G')[],
  oracleText: string,
  abilities: readonly ManaAbility[],
): CardDefinition =>
  singleFace({
    name,
    manaCost: null,
    types: ['land'],
    colors: [],
    colorIdentity: identity,
    oracleText,
    abilities,
  });

export const SYNTHETIC_MANA_PLUS_LIST: readonly CardDefinition[] = [
  // CR 106.7: "any color that a land an opponent controls could produce".
  land(
    'SYNTHETIC Orchard',
    [],
    '{T}: Add one mana of any color that a land an opponent controls could produce.',
    [mana([tap], { kind: 'couldProduce', lands: OPPONENT_LAND })],
  ),
  singleFace({
    name: 'SYNTHETIC Fellwar Rock',
    manaCost: ['2'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText: '{T}: Add one mana of any color that a land an opponent controls could produce.',
    abilities: [mana([tap], { kind: 'couldProduce', lands: OPPONENT_LAND })],
  }),
  // "any type": colorless counts (CR 106.1b).
  land(
    'SYNTHETIC Reflecting Pond',
    [],
    '{T}: Add one mana of any type that a land you control could produce.',
    [mana([tap], { kind: 'couldProduce', lands: YOUR_LAND, anyType: true })],
  ),
  // The colorless tap that real filter lands have, and the filter itself (CR 107.4e).
  land(
    'SYNTHETIC Filter Land',
    ['W', 'R'],
    '{T}: Add {C}. {R/W}, {T}: Add {R}{R}, {R}{W}, or {W}{W}.',
    [
      mana([tap], { kind: 'fixed', mana: ['C'] }),
      mana([{ kind: 'mana', symbols: ['R/W'] }, tap], {
        kind: 'combination',
        options: [
          ['R', 'R'],
          ['R', 'W'],
          ['W', 'W'],
        ],
      }),
    ],
  ),
  // Only the filter ability: nothing taps it without other mana.
  land('SYNTHETIC Bare Filter Land', ['U', 'B'], '{U/B}, {T}: Add {U}{U}, {U}{B}, or {B}{B}.', [
    mana([{ kind: 'mana', symbols: ['U/B'] }, tap], {
      kind: 'combination',
      options: [
        ['U', 'U'],
        ['U', 'B'],
        ['B', 'B'],
      ],
    }),
  ]),
  // A generic half in the hybrid symbol: {2/G} is one green or two of any type.
  land('SYNTHETIC Twist Filter Land', ['W', 'G'], '{2/G}, {T}: Add {G}{W}.', [
    mana([{ kind: 'mana', symbols: ['2/G'] }, tap], { kind: 'fixed', mana: ['G', 'W'] }),
  ]),
  // "Activate only if you control five or more lands."
  land(
    'SYNTHETIC Temple',
    [],
    '{T}: Add {C}{C}. Activate only if you control five or more lands.',
    [
      mana(
        [tap],
        { kind: 'fixed', mana: ['C', 'C'] },
        {
          kind: 'controlsAtLeast',
          filter: { types: ['land'] },
          count: 5,
        },
      ),
    ],
  ),
  // "Activate only if you control a Swamp."
  land(
    'SYNTHETIC Tainted Land',
    ['B', 'G'],
    '{T}: Add {C}. {T}: Add {B} or {G}. Activate only if you control a Swamp.',
    [
      mana([tap], { kind: 'fixed', mana: ['C'] }),
      mana([tap], { kind: 'oneOf', colors: ['B', 'G'] }, CONTROL_A_SWAMP),
    ],
  ),
  // "{T}, Pay 1 life: Add one mana of any color."
  land('SYNTHETIC Confluence', [], '{T}, Pay 1 life: Add one mana of any color.', [
    mana([tap, { kind: 'payLife', amount: 1 }], { kind: 'anyColor' }),
  ]),
  // Two mana for 2 life: a bigger payment.
  singleFace({
    name: 'SYNTHETIC Blood Rock',
    manaCost: ['1'],
    types: ['artifact'],
    colors: [],
    colorIdentity: ['B'],
    oracleText: '{T}, Pay 2 life: Add {B}{B}.',
    abilities: [mana([tap, { kind: 'payLife', amount: 2 }], { kind: 'fixed', mana: ['B', 'B'] })],
  }),
  // "Lands you control have "{T}: Add one mana of any color.""
  singleFace({
    name: 'SYNTHETIC Prism Lantern',
    manaCost: ['3'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText: 'Lands you control have "{T}: Add one mana of any color."',
    abilities: [
      {
        kind: 'static',
        static: {
          kind: 'grantAbility',
          subject: YOUR_LANDS,
          ability: mana([tap], { kind: 'anyColor' }),
        },
      },
    ],
  }),
  // The granted ability carries its own restriction (CR 602.5c): only while you control a Swamp.
  singleFace({
    name: 'SYNTHETIC Murk Lantern',
    manaCost: ['3'],
    types: ['artifact'],
    colors: [],
    colorIdentity: ['B'],
    oracleText: 'Lands you control have "{T}: Add {B}. Activate only if you control a Swamp."',
    abilities: [
      {
        kind: 'static',
        static: {
          kind: 'grantAbility',
          subject: YOUR_LANDS,
          ability: mana([tap], { kind: 'fixed', mana: ['B'] }, CONTROL_A_SWAMP),
        },
      },
    ],
  }),
  // An activated ability that is not a mana ability, with the same kind of restriction (CR 602.5b).
  singleFace({
    name: 'SYNTHETIC Gated Fountain',
    manaCost: ['1'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText: '{T}: You gain 1 life. Activate only if you control a Swamp.',
    abilities: [
      {
        kind: 'activated',
        cost: [tap],
        effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 1 },
        activateOnlyIf: CONTROL_A_SWAMP,
      },
    ],
  }),
  // Takes the abilities of a land away until end of turn (CR 613.1f).
  singleFace({
    name: 'SYNTHETIC Land Wipe',
    manaCost: ['U'],
    types: ['instant'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: 'Target land loses all abilities until end of turn.',
    spell: {
      targets: [
        { id: 't1', what: { kind: 'object', filter: { zone: 'battlefield', types: ['land'] } } },
      ],
      effect: {
        kind: 'loseAllAbilities',
        objects: { kind: 'target', id: 't1' },
        duration: 'untilEndOfTurn',
      },
    },
  }),
  singleFace({
    name: 'SYNTHETIC Artifact Smash',
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
