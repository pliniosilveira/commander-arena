/**
 * SYNTHETIC X CARDS. NOT REAL MAGIC CARDS.
 *
 * Invented for the tests and the soak games of D-103: an {X} in a mana cost (CR 107.3, 107.3a), two
 * {X} (2X generic mana), "deals X damage", "draw X cards" (SYNTHETIC X Draw is in synthetic.ts),
 * "put X +1/+1 counters", "enters with X +1/+1 counters on it" (CR 107.3m; SYNTHETIC Hydra Zero is a 0/0 body), "pay X life" as an
 * additional cost (CR 118.8, 119.4), a spell with kicker and X, a spell with a free alternative cost
 * (CR 107.3b), an activated ability with {X} in its cost and one that pays X life (CR 602.2b), and a
 * cost reducer. Names start with "SYNTHETIC "; oracleId is null. The text describes what the AST
 * does; it is not Oracle text, and none of these is the definition of a real card.
 */
import type { Ability, Effect, TargetSpec } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const YOU = { kind: 'you' } as const;
const X = { kind: 'x' } as const;
const T1 = { kind: 'target', id: 't1' } as const;
const ANY_TARGET: TargetSpec = { id: 't1', what: { kind: 'anyTarget' } };
const CREATURE_TARGET: TargetSpec = {
  id: 't1',
  what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
};
const XDAMAGE: Effect = { kind: 'dealDamage', amount: X, to: T1 };
const XCOUNTERS: Effect = { kind: 'addCounters', objects: T1, counter: '+1/+1', count: X };

const KICKER_TWO: Ability = {
  kind: 'keyword',
  keyword: { kind: 'kicker', cost: [{ kind: 'mana', symbols: ['2'] }] },
};

export const SYNTHETIC_X_LIST: readonly CardDefinition[] = [
  // "~ deals X damage to any target."
  singleFace({
    name: 'SYNTHETIC X Burn',
    manaCost: ['X', 'R'],
    types: ['instant'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText: 'Deals X damage to any target.',
    spell: { x: true, targets: [ANY_TARGET], effect: XDAMAGE },
  }),
  // "Draw X cards." with two {X}: it costs 2X plus {U}.
  singleFace({
    name: 'SYNTHETIC Double X Draw',
    manaCost: ['X', 'X', 'U'],
    types: ['sorcery'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: 'Draw X cards.',
    spell: { x: true, effect: { kind: 'draw', player: YOU, count: X } },
  }),
  // "Put X +1/+1 counters on target creature."
  singleFace({
    name: 'SYNTHETIC X Pump',
    manaCost: ['X', 'G'],
    types: ['instant'],
    colors: ['G'],
    colorIdentity: ['G'],
    oracleText: 'Put X +1/+1 counters on target creature.',
    spell: { x: true, targets: [CREATURE_TARGET], effect: XCOUNTERS },
  }),
  // "This creature enters with X +1/+1 counters on it."
  singleFace({
    name: 'SYNTHETIC Hydra Cub',
    manaCost: ['X', 'G'],
    types: ['creature'],
    subtypes: ['Hydra'],
    colors: ['G'],
    colorIdentity: ['G'],
    power: 1,
    toughness: 1,
    oracleText: 'Enters with X +1/+1 counters on it.',
    abilities: [
      {
        kind: 'replacement',
        replacement: { kind: 'entersWithCounters', counter: '+1/+1', count: X },
      },
    ],
  }),
  // "This creature enters with X +1/+1 counters on it." on a 0/0 body: dead on arrival at X = 0 (CR 704.5f).
  singleFace({
    name: 'SYNTHETIC Hydra Zero',
    manaCost: ['X', 'G'],
    types: ['creature'],
    subtypes: ['Hydra'],
    colors: ['G'],
    colorIdentity: ['G'],
    power: 0,
    toughness: 0,
    oracleText: 'Enters with X +1/+1 counters on it.',
    abilities: [
      {
        kind: 'replacement',
        replacement: { kind: 'entersWithCounters', counter: '+1/+1', count: X },
      },
    ],
  }),
  // "As an additional cost to cast this spell, pay X life. Deals X damage to any target."
  singleFace({
    name: 'SYNTHETIC Blood Burn',
    manaCost: ['R'],
    types: ['sorcery'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText:
      'As an additional cost to cast this spell, pay X life. Deals X damage to any target.',
    additionalCosts: [{ kind: 'payXLife' }],
    spell: { x: true, targets: [ANY_TARGET], effect: XDAMAGE },
  }),
  // "Kicker {2}. Deals X damage to any target."
  singleFace({
    name: 'SYNTHETIC Kicked X Burn',
    manaCost: ['X', 'R'],
    types: ['instant'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText: 'Kicker {2}. Deals X damage to any target.',
    abilities: [KICKER_TWO],
    spell: { x: true, targets: [ANY_TARGET], effect: XDAMAGE },
  }),
  // "You may cast this spell without paying its mana cost. Deals X damage to any target."
  singleFace({
    name: 'SYNTHETIC Free X Burn',
    manaCost: ['X', 'R'],
    types: ['instant'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText:
      'You may cast this spell without paying its mana cost. Deals X damage to any target.',
    alternativeCosts: [{ kind: 'free' }],
    spell: { x: true, targets: [ANY_TARGET], effect: XDAMAGE },
  }),
  // "{X}, {T}: ~ deals X damage to target creature."
  singleFace({
    name: 'SYNTHETIC X Cannon',
    manaCost: ['2'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText: '{X}, {T}: Deals X damage to target creature.',
    abilities: [
      {
        kind: 'activated',
        cost: [{ kind: 'mana', symbols: ['X'] }, { kind: 'tap' }],
        targets: [CREATURE_TARGET],
        effect: XDAMAGE,
      },
    ],
  }),
  // "Pay X life: ~ deals X damage to target creature."
  singleFace({
    name: 'SYNTHETIC Blood Lance',
    manaCost: ['1'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText: 'Pay X life: Deals X damage to target creature.',
    abilities: [
      {
        kind: 'activated',
        cost: [{ kind: 'payXLife' }],
        targets: [CREATURE_TARGET],
        effect: XDAMAGE,
      },
    ],
  }),
  // "{X}{X}, {T}: Draw X cards." (two {X} in an activation cost)
  singleFace({
    name: 'SYNTHETIC Double Well',
    manaCost: ['2'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText: '{X}{X}, {T}: Draw X cards.',
    abilities: [
      {
        kind: 'activated',
        cost: [{ kind: 'mana', symbols: ['X', 'X'] }, { kind: 'tap' }],
        effect: { kind: 'draw', player: YOU, count: X },
      },
    ],
  }),
  // "Spells you cast cost {1} less to cast."
  singleFace({
    name: 'SYNTHETIC Spell Discount',
    manaCost: ['1'],
    types: ['enchantment'],
    colors: [],
    colorIdentity: [],
    oracleText: 'Spells you cast cost {1} less to cast.',
    abilities: [
      {
        kind: 'static',
        static: { kind: 'costReduction', spells: { controller: 'you' }, amount: 1 },
      },
    ],
  }),
];
