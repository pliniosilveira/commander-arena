/**
 * SYNTHETIC UPKEEP CARDS: ECHO, CUMULATIVE UPKEEP AND THE MONARCH. NOT REAL MAGIC CARDS.
 *
 * Invented for the tests and the soak games of D-127: Echo (CR 702.30), Cumulative upkeep (CR 702.24) and
 * the monarch (CR 725). Names start with "SYNTHETIC "; oracleId is null. The text describes what the AST does;
 * it is not Oracle text, and none of these copies a real card's definition.
 */
import type { Ability, Cost } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const mana = (...symbols: string[]): Cost => ({ kind: 'mana', symbols });
const echo = (...cost: Cost[]): Ability => ({ kind: 'keyword', keyword: { kind: 'echo', cost } });
const cumulative = (...cost: Cost[]): Ability => ({
  kind: 'keyword',
  keyword: { kind: 'cumulativeUpkeep', cost },
});

/** "When this permanent enters, you become the monarch." (CR 725.1) */
const becomeMonarchOnEntry: Ability = {
  kind: 'triggered',
  trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
  effect: { kind: 'becomeMonarch', player: { kind: 'you' } },
};

export const SYNTHETIC_UPKEEP_LIST: readonly CardDefinition[] = [
  // ---- Echo (CR 702.30)
  singleFace({
    name: 'SYNTHETIC Echo Hound',
    manaCost: ['1', 'R'],
    types: ['creature'],
    subtypes: ['Hound'],
    colors: ['R'],
    colorIdentity: ['R'],
    power: 3,
    toughness: 1,
    oracleText: 'Echo {1}{R}',
    abilities: [echo(mana('1', 'R'))],
  }),
  singleFace({
    name: 'SYNTHETIC Echo Giant',
    manaCost: ['3', 'G'],
    types: ['creature'],
    subtypes: ['Giant'],
    colors: ['G'],
    colorIdentity: ['G'],
    power: 4,
    toughness: 4,
    oracleText: 'Echo {G}',
    abilities: [echo(mana('G'))],
  }),
  singleFace({
    name: 'SYNTHETIC Echo Twins',
    manaCost: ['2', 'W'],
    types: ['creature'],
    subtypes: ['Spirit'],
    colors: ['W'],
    colorIdentity: ['W'],
    power: 2,
    toughness: 2,
    oracleText: 'Echo {W}\nEcho {1}',
    abilities: [echo(mana('W')), echo(mana('1'))],
  }),
  singleFace({
    name: 'SYNTHETIC Echo Relic',
    manaCost: ['2'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText: 'Echo {2}',
    abilities: [echo(mana('2'))],
  }),

  // ---- Cumulative upkeep (CR 702.24)
  singleFace({
    name: 'SYNTHETIC Aging Wall',
    manaCost: ['1', 'W'],
    types: ['creature'],
    subtypes: ['Wall'],
    colors: ['W'],
    colorIdentity: ['W'],
    power: 0,
    toughness: 5,
    oracleText: 'Defender\nCumulative upkeep {1}',
    abilities: [{ kind: 'keyword', keyword: { kind: 'defender' } }, cumulative(mana('1'))],
  }),
  singleFace({
    name: 'SYNTHETIC Aging Bloodline',
    manaCost: ['B', 'B'],
    types: ['creature'],
    subtypes: ['Vampire'],
    colors: ['B'],
    colorIdentity: ['B'],
    power: 4,
    toughness: 4,
    oracleText: 'Cumulative upkeep—Pay 1 life.',
    abilities: [cumulative({ kind: 'payLife', amount: 1 })],
  }),
  singleFace({
    name: 'SYNTHETIC Aging Scholar',
    manaCost: ['2', 'U'],
    types: ['creature'],
    subtypes: ['Wizard'],
    colors: ['U'],
    colorIdentity: ['U'],
    power: 3,
    toughness: 3,
    oracleText: 'Cumulative upkeep—Discard a card.',
    abilities: [cumulative({ kind: 'discard', count: 1 })],
  }),
  singleFace({
    name: 'SYNTHETIC Aging Twins',
    manaCost: ['3'],
    types: ['artifact', 'creature'],
    subtypes: ['Golem'],
    colors: [],
    colorIdentity: [],
    power: 2,
    toughness: 2,
    oracleText: 'Cumulative upkeep {1}\nCumulative upkeep {1}',
    abilities: [cumulative(mana('1')), cumulative(mana('1'))],
  }),
  singleFace({
    name: 'SYNTHETIC Aging Garden',
    manaCost: ['G'],
    types: ['enchantment'],
    colors: ['G'],
    colorIdentity: ['G'],
    oracleText: 'Cumulative upkeep {G}',
    abilities: [cumulative(mana('G'))],
  }),

  // ---- The monarch (CR 725)
  singleFace({
    name: 'SYNTHETIC Court Herald',
    manaCost: ['2', 'W'],
    types: ['creature'],
    subtypes: ['Human', 'Noble'],
    colors: ['W'],
    colorIdentity: ['W'],
    power: 2,
    toughness: 2,
    oracleText: 'When this creature enters, you become the monarch.',
    abilities: [becomeMonarchOnEntry],
  }),
  singleFace({
    name: 'SYNTHETIC Throne Hall',
    manaCost: ['3', 'W'],
    types: ['enchantment'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText: 'When this enchantment enters, you become the monarch.',
    abilities: [becomeMonarchOnEntry],
  }),
  singleFace({
    name: 'SYNTHETIC Crown Claim',
    manaCost: ['2', 'U'],
    types: ['sorcery'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: 'You become the monarch.',
    spell: { effect: { kind: 'becomeMonarch', player: { kind: 'you' } } },
  }),
  singleFace({
    name: 'SYNTHETIC Crown Flash',
    manaCost: ['1', 'U'],
    types: ['instant'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: 'You become the monarch.',
    spell: { effect: { kind: 'becomeMonarch', player: { kind: 'you' } } },
  }),
];
