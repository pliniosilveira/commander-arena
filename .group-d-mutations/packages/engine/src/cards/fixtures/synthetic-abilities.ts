/**
 * SYNTHETIC ACTIVATED-ABILITY CARDS. NOT REAL MAGIC CARDS.
 *
 * Invented for the M5 tests of activated abilities (CR 602), "until end of turn" pumps (CR 611.2,
 * 613.4c) and Cycling (CR 702.29): each cost kind the engine pays has a card, and so has each way
 * an activation can be timed or aimed. Names start with "SYNTHETIC "; oracleId is null. The text
 * describes what the AST does; it is not Oracle text, and none of these copies a real card.
 */
import type { Ability, Cost, Effect } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const THIS = { kind: 'this' } as const;
const YOU = { kind: 'you' } as const;

const tap: Cost = { kind: 'tap' };
const mana = (...symbols: string[]): Cost => ({ kind: 'mana', symbols });
const sacrificeThis: Cost = { kind: 'sacrifice', what: THIS };

const activated = (
  cost: readonly Cost[],
  effect: Effect,
  extra: Partial<Extract<Ability, { kind: 'activated' }>> = {},
): Ability => ({ kind: 'activated', cost, effect, ...extra });

const pumpThis = (power: number, toughness: number): Effect => ({
  kind: 'modifyPt',
  objects: THIS,
  power,
  toughness,
  duration: 'untilEndOfTurn',
});
const drawOne: Effect = { kind: 'draw', player: YOU, count: 1 };
const gain = (amount: number): Effect => ({ kind: 'gainLife', player: YOU, amount });

const BASE = { colorIdentity: [] as const };

export const SYNTHETIC_ABILITY_LIST: readonly CardDefinition[] = [
  singleFace({
    name: 'SYNTHETIC Pump Bear',
    manaCost: ['1', 'G'],
    types: ['creature'],
    subtypes: ['Bear'],
    colors: ['G'],
    colorIdentity: ['G'],
    power: 2,
    toughness: 2,
    oracleText: '{1}: This creature gets +1/+1 until end of turn.',
    abilities: [activated([mana('1')], pumpThis(1, 1))],
  }),
  singleFace({
    name: 'SYNTHETIC Firebreather',
    manaCost: ['1', 'R'],
    types: ['creature'],
    subtypes: ['Construct'],
    colors: ['R'],
    colorIdentity: ['R'],
    power: 1,
    toughness: 1,
    oracleText: '{R}: This creature gets +1/+0 until end of turn.',
    abilities: [activated([mana('R')], pumpThis(1, 0))],
  }),
  // A pump with a target and a {T} cost: the target is chosen first, then the cost is paid.
  singleFace({
    name: 'SYNTHETIC Coach',
    manaCost: ['1', 'W'],
    types: ['creature'],
    subtypes: ['Human'],
    colors: ['W'],
    colorIdentity: ['W'],
    power: 1,
    toughness: 1,
    oracleText: '{T}: Target creature gets +2/+2 until end of turn.',
    abilities: [
      activated(
        [tap],
        {
          kind: 'modifyPt',
          objects: { kind: 'target', id: 't1' },
          power: 2,
          toughness: 2,
          duration: 'untilEndOfTurn',
        },
        {
          targets: [
            {
              id: 't1',
              what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
            },
          ],
        },
      ),
    ],
  }),
  // A sacrifice outlet: the cost names a filter, so the player chooses what to sacrifice.
  singleFace({
    name: 'SYNTHETIC Altar',
    manaCost: ['2'],
    types: ['enchantment'],
    colors: [],
    ...BASE,
    oracleText: 'Sacrifice a creature: You gain 2 life.',
    abilities: [activated([{ kind: 'sacrifice', what: { types: ['creature'] } }], gain(2))],
  }),
  // {T}, mana and a sacrifice of itself in one cost.
  singleFace({
    name: 'SYNTHETIC Snack',
    manaCost: ['1'],
    types: ['artifact'],
    colors: [],
    ...BASE,
    oracleText: '{2}, {T}, Sacrifice this artifact: You gain 3 life.',
    abilities: [activated([mana('2'), tap, sacrificeThis], gain(3))],
  }),
  singleFace({
    name: 'SYNTHETIC Life Tap',
    manaCost: ['2'],
    types: ['artifact'],
    colors: [],
    ...BASE,
    oracleText: '{T}, Pay 2 life: Draw a card.',
    abilities: [activated([tap, { kind: 'payLife', amount: 2 }], drawOne)],
  }),
  singleFace({
    name: 'SYNTHETIC Charge Battery',
    manaCost: ['1'],
    types: ['artifact'],
    colors: [],
    ...BASE,
    oracleText:
      'This artifact enters with two charge counters. Remove a charge counter: You gain 1 life.',
    abilities: [
      {
        kind: 'replacement',
        replacement: { kind: 'entersWithCounters', counter: 'charge', count: 2 },
      },
      activated([{ kind: 'removeCounters', counter: 'charge', count: 1 }], gain(1)),
    ],
  }),
  singleFace({
    name: 'SYNTHETIC Slow Scholar',
    manaCost: ['1', 'U'],
    types: ['creature'],
    subtypes: ['Human', 'Wizard'],
    colors: ['U'],
    colorIdentity: ['U'],
    power: 1,
    toughness: 2,
    oracleText: '{1}: Draw a card. Activate only as a sorcery.',
    abilities: [activated([mana('1')], drawOne, { timing: 'sorcery' })],
  }),
  singleFace({
    name: 'SYNTHETIC Cycling Bear',
    manaCost: ['1', 'G'],
    types: ['creature'],
    subtypes: ['Bear'],
    colors: ['G'],
    colorIdentity: ['G'],
    power: 2,
    toughness: 2,
    oracleText: 'Cycling {2}',
    abilities: [{ kind: 'keyword', keyword: { kind: 'cycling', cost: [mana('2')] } }],
  }),
  singleFace({
    name: 'SYNTHETIC Cycling Land',
    manaCost: null,
    types: ['land'],
    colors: [],
    colorIdentity: ['G'],
    oracleText: '{T}: Add {G}. Cycling {1}',
    abilities: [
      { kind: 'mana', cost: [tap], production: { kind: 'fixed', mana: ['G'] } },
      { kind: 'keyword', keyword: { kind: 'cycling', cost: [mana('1')] } },
    ],
  }),
  // Cycling that costs life instead of mana.
  singleFace({
    name: 'SYNTHETIC Life Cycler',
    manaCost: ['3', 'B'],
    types: ['creature'],
    subtypes: ['Horror'],
    colors: ['B'],
    colorIdentity: ['B'],
    power: 3,
    toughness: 3,
    oracleText: 'Cycling-Pay 2 life.',
    abilities: [
      { kind: 'keyword', keyword: { kind: 'cycling', cost: [{ kind: 'payLife', amount: 2 }] } },
    ],
  }),
];
