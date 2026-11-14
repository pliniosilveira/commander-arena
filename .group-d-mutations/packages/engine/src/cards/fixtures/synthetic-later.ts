/**
 * SYNTHETIC "CAST LATER" CARDS: DELAYED TRIGGERS, SUSPEND, MADNESS AND FORETELL. NOT REAL MAGIC CARDS.
 *
 * Invented for the tests and the soak games of D-128: delayed triggered abilities (CR 603.7), Suspend (CR 702.62),
 * Madness (CR 702.35) and Foretell (CR 702.143). Names start with "SYNTHETIC "; oracleId is null. The text
 * describes what the AST does; it is not Oracle text, and none of these copies a real card's definition.
 *
 * The abilities the keywords stand for (the suspend triggers, the madness replacement and trigger, the foretell
 * special action) are the engine's (`rules/derive-keywords.ts`, `rules/derive-alt.ts`, `rules/special-actions.ts`):
 * the cards list only the keyword or the alternative cost.
 */
import type { Ability, Cost } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const mana = (...symbols: string[]): Cost => ({ kind: 'mana', symbols });
const suspend = (count: number, ...cost: string[]): Ability => ({
  kind: 'keyword',
  keyword: { kind: 'suspend', count, cost: [mana(...cost)] },
});
const T1 = { kind: 'target', id: 't1' } as const;
const CREATURE_TARGET = {
  id: 't1',
  what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
} as const;

export const SYNTHETIC_LATER_LIST: readonly CardDefinition[] = [
  // ---- Delayed triggered abilities (CR 603.7)
  singleFace({
    name: 'SYNTHETIC Delayed Insight',
    manaCost: ['1', 'U'],
    types: ['instant'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: "You draw a card at the beginning of the next turn's upkeep.",
    spell: {
      effect: {
        kind: 'delayedTrigger',
        at: { step: 'upkeep', whose: 'each' },
        effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
      },
    },
  }),
  singleFace({
    name: 'SYNTHETIC Delayed Windfall',
    manaCost: ['2', 'G'],
    types: ['sorcery'],
    colors: ['G'],
    colorIdentity: ['G'],
    oracleText: 'You draw two cards at the beginning of your next upkeep.',
    spell: {
      effect: {
        kind: 'delayedTrigger',
        at: { step: 'upkeep', whose: 'you' },
        effect: { kind: 'draw', player: { kind: 'you' }, count: 2 },
      },
    },
  }),
  singleFace({
    name: 'SYNTHETIC Delayed Tithe',
    manaCost: ['W'],
    types: ['sorcery'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText: 'You gain 3 life at the beginning of the next end step.',
    spell: {
      effect: {
        kind: 'delayedTrigger',
        at: { step: 'endStep', whose: 'each' },
        effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 3 },
      },
    },
  }),
  singleFace({
    name: 'SYNTHETIC Delayed Drain',
    manaCost: ['1', 'B'],
    types: ['sorcery'],
    colors: ['B'],
    colorIdentity: ['B'],
    oracleText: 'Each opponent loses 2 life at the beginning of the next turn’s upkeep.',
    spell: {
      effect: {
        kind: 'delayedTrigger',
        at: { step: 'upkeep', whose: 'each' },
        effect: { kind: 'loseLife', player: { kind: 'eachOpponent' }, amount: 2 },
      },
    },
  }),
  // ---- Suspend (CR 702.62)
  singleFace({
    name: 'SYNTHETIC Suspend Bear',
    manaCost: ['2', 'G'],
    types: ['creature'],
    subtypes: ['Bear'],
    colors: ['G'],
    colorIdentity: ['G'],
    power: 3,
    toughness: 3,
    oracleText: 'Suspend 3—{G}',
    abilities: [suspend(3, 'G')],
  }),
  singleFace({
    name: 'SYNTHETIC Suspend Bolt',
    manaCost: ['1', 'R'],
    types: ['instant'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText: 'Suspend 1—{R}\nSYNTHETIC Suspend Bolt deals 3 damage to any target.',
    abilities: [suspend(1, 'R')],
    spell: {
      targets: [{ id: 't1', what: { kind: 'anyTarget' } }],
      effect: { kind: 'dealDamage', amount: 3, to: T1 },
    },
  }),
  singleFace({
    name: 'SYNTHETIC Suspend Scrap',
    manaCost: ['3', 'R'],
    types: ['sorcery'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText: 'Suspend 2—{R}\nDestroy target creature.',
    abilities: [suspend(2, 'R')],
    spell: { targets: [CREATURE_TARGET], effect: { kind: 'destroy', objects: T1 } },
  }),
  singleFace({
    name: 'SYNTHETIC Suspend Insight',
    manaCost: ['2', 'U'],
    types: ['sorcery'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: 'Suspend 2—{U}\nDraw two cards.',
    abilities: [suspend(2, 'U')],
    spell: { effect: { kind: 'draw', player: { kind: 'you' }, count: 2 } },
  }),
  singleFace({
    name: 'SYNTHETIC Suspend Relic',
    manaCost: ['3'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText: 'Suspend 2—{0}',
    abilities: [suspend(2, '0')],
  }),
  singleFace({
    name: 'SYNTHETIC Suspend Flash Giant',
    manaCost: ['4', 'G'],
    types: ['creature'],
    subtypes: ['Giant'],
    colors: ['G'],
    colorIdentity: ['G'],
    power: 5,
    toughness: 5,
    oracleText: 'Flash\nSuspend 1—{1}{G}',
    abilities: [{ kind: 'keyword', keyword: { kind: 'flash' } }, suspend(1, '1', 'G')],
  }),
  singleFace({
    name: 'SYNTHETIC Suspend Commander',
    manaCost: ['3', 'G'],
    supertypes: ['legendary'],
    types: ['creature'],
    subtypes: ['Elf'],
    colors: ['G'],
    colorIdentity: ['G'],
    power: 3,
    toughness: 3,
    oracleText: 'Suspend 2—{G}',
    abilities: [suspend(2, 'G')],
  }),
  // ---- Madness (CR 702.35)
  singleFace({
    name: 'SYNTHETIC Madness Fiend',
    manaCost: ['3', 'B'],
    types: ['creature'],
    subtypes: ['Horror'],
    colors: ['B'],
    colorIdentity: ['B'],
    power: 4,
    toughness: 3,
    oracleText: 'Madness {1}{B}',
    alternativeCosts: [{ kind: 'madness', cost: [mana('1', 'B')] }],
  }),
  singleFace({
    name: 'SYNTHETIC Madness Bolt',
    manaCost: ['1', 'R'],
    types: ['instant'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText: 'SYNTHETIC Madness Bolt deals 3 damage to target creature.\nMadness {R}',
    alternativeCosts: [{ kind: 'madness', cost: [mana('R')] }],
    spell: { targets: [CREATURE_TARGET], effect: { kind: 'dealDamage', amount: 3, to: T1 } },
  }),
  singleFace({
    name: 'SYNTHETIC Madness Cycler',
    manaCost: ['4', 'B'],
    types: ['creature'],
    subtypes: ['Horror'],
    colors: ['B'],
    colorIdentity: ['B'],
    power: 4,
    toughness: 4,
    oracleText: 'Cycling {1}\nMadness {B}',
    abilities: [{ kind: 'keyword', keyword: { kind: 'cycling', cost: [mana('1')] } }],
    alternativeCosts: [{ kind: 'madness', cost: [mana('B')] }],
  }),
  singleFace({
    name: 'SYNTHETIC Madness Commander',
    manaCost: ['2', 'B'],
    supertypes: ['legendary'],
    types: ['creature'],
    subtypes: ['Vampire'],
    colors: ['B'],
    colorIdentity: ['B'],
    power: 3,
    toughness: 3,
    oracleText: 'Madness {B}',
    alternativeCosts: [{ kind: 'madness', cost: [mana('B')] }],
  }),
  singleFace({
    name: 'SYNTHETIC Mind Rot',
    manaCost: ['1', 'B'],
    types: ['sorcery'],
    colors: ['B'],
    colorIdentity: ['B'],
    oracleText: 'Each opponent discards two cards.',
    spell: { effect: { kind: 'discard', player: { kind: 'eachOpponent' }, count: 2 } },
  }),
  singleFace({
    name: 'SYNTHETIC Mind Nibble',
    manaCost: ['B'],
    types: ['sorcery'],
    colors: ['B'],
    colorIdentity: ['B'],
    oracleText: 'Each opponent discards a card.',
    spell: { effect: { kind: 'discard', player: { kind: 'eachOpponent' }, count: 1 } },
  }),
  singleFace({
    name: 'SYNTHETIC Rummage Spell',
    manaCost: ['R'],
    types: ['instant'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText: 'As an additional cost to cast this spell, discard a card.\nDraw a card.',
    additionalCosts: [{ kind: 'discard', count: 1 }],
    spell: { effect: { kind: 'draw', player: { kind: 'you' }, count: 1 } },
  }),

  // ---- Foretell (CR 702.143)
  singleFace({
    name: 'SYNTHETIC Foretell Bolt',
    manaCost: ['2', 'R'],
    types: ['instant'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText: 'Foretell {R}\nSYNTHETIC Foretell Bolt deals 3 damage to target creature.',
    alternativeCosts: [{ kind: 'foretell', cost: [mana('R')] }],
    spell: { targets: [CREATURE_TARGET], effect: { kind: 'dealDamage', amount: 3, to: T1 } },
  }),
  singleFace({
    name: 'SYNTHETIC Foretell Insight',
    manaCost: ['3', 'U'],
    types: ['sorcery'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: 'Foretell {U}\nDraw two cards.',
    alternativeCosts: [{ kind: 'foretell', cost: [mana('U')] }],
    spell: { effect: { kind: 'draw', player: { kind: 'you' }, count: 2 } },
  }),
  singleFace({
    name: 'SYNTHETIC Foretell Giant',
    manaCost: ['4', 'G'],
    types: ['creature'],
    subtypes: ['Giant'],
    colors: ['G'],
    colorIdentity: ['G'],
    power: 5,
    toughness: 5,
    oracleText: 'Foretell {1}{G}',
    alternativeCosts: [{ kind: 'foretell', cost: [mana('1', 'G')] }],
  }),
  singleFace({
    name: 'SYNTHETIC Foretell Commander',
    manaCost: ['3', 'U'],
    supertypes: ['legendary'],
    types: ['creature'],
    subtypes: ['Wizard'],
    colors: ['U'],
    colorIdentity: ['U'],
    power: 3,
    toughness: 3,
    oracleText: 'Foretell {U}',
    alternativeCosts: [{ kind: 'foretell', cost: [mana('U')] }],
  }),
];
