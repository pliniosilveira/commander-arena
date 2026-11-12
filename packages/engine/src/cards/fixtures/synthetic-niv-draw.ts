/**
 * SYNTHETIC CARDS FOR TWO PRIMITIVES OF THE NIV-MIZZET DECK PROGRAM (issue 25, group 2b-a). NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of "If you would draw a card while your library has no cards in it, skip that draw instead" (the replacement `skipDraw`, D-941,
 * with the plain condition `cardsInLibrary`, D-940) and "Whenever a source you control deals noncombat damage to an opponent, you draw that many cards"
 * (the trigger `noncombatDamageDealt`, D-942, with `triggerDamage`). Names start with "SYNTHETIC "; oracleId is null. The text describes what the AST does; it
 * is not Oracle text, and none of these is the definition of a real card.
 */
import type { Ability, Condition, Effect } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { kw, singleFace } from './helpers';

const YOU = { kind: 'you' } as const;
const THIS = { kind: 'this' } as const;
const ANY_TARGET = { id: 't1', what: { kind: 'anyTarget' } } as const;

/** "there are no cards in your library" (CR 401.1). */
const EMPTY_LIBRARY: Condition = { kind: 'cardsInLibrary', compare: { cmp: 'atMost', value: 0 } };

const scribe = (
  name: string,
  words: string,
  trigger: Extract<Ability, { kind: 'triggered' }>['trigger'],
  effect: Effect,
): CardDefinition =>
  singleFace({
    name,
    manaCost: ['4', 'U', 'R'],
    types: ['creature'],
    subtypes: ['Dragon', 'Wizard'],
    colors: ['U', 'R'],
    colorIdentity: ['U', 'R'],
    power: 5,
    toughness: 5,
    oracleText: words,
    abilities: [kw('flying'), { kind: 'triggered', trigger, effect }],
  });

export const SYNTHETIC_NIV_DRAW_LIST: readonly CardDefinition[] = [
  // "Hexproof. If you would draw a card while your library has no cards in it, skip that draw instead. As long as there are no cards in your library, this
  //  creature has base power and toughness 10/10 and has flying and vigilance." (D-940, D-941)
  singleFace({
    name: 'SYNTHETIC Hollow Warden',
    manaCost: ['4', 'U'],
    types: ['creature'],
    subtypes: ['Elemental'],
    colors: ['U'],
    colorIdentity: ['U'],
    power: 2,
    toughness: 5,
    oracleText:
      'Hexproof\nIf you would draw a card while your library has no cards in it, skip that draw instead.\nAs long as there are no cards in your library, this creature has base power and toughness 10/10 and has flying and vigilance.',
    abilities: [
      kw('hexproof'),
      { kind: 'replacement', replacement: { kind: 'skipDraw', while: EMPTY_LIBRARY } },
      {
        kind: 'static',
        static: { kind: 'setPt', subject: THIS, power: 10, toughness: 10 },
        condition: EMPTY_LIBRARY,
      },
      {
        kind: 'static',
        static: { kind: 'grantKeyword', subject: THIS, keyword: { kind: 'flying' } },
        condition: EMPTY_LIBRARY,
      },
      {
        kind: 'static',
        static: { kind: 'grantKeyword', subject: THIS, keyword: { kind: 'vigilance' } },
        condition: EMPTY_LIBRARY,
      },
    ],
  }),
  // "If you would draw a card, skip that draw instead." (no condition)
  singleFace({
    name: 'SYNTHETIC Draw Veto',
    manaCost: ['2'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText: 'If you would draw a card, skip that draw instead.',
    abilities: [{ kind: 'replacement', replacement: { kind: 'skipDraw' } }],
  }),
  // "If you would draw a card while your library has fewer than three cards in it, skip that draw instead."
  singleFace({
    name: 'SYNTHETIC Thin Veto',
    manaCost: ['2'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText:
      'If you would draw a card while your library has fewer than three cards in it, skip that draw instead.',
    abilities: [
      {
        kind: 'replacement',
        replacement: {
          kind: 'skipDraw',
          while: { kind: 'cardsInLibrary', compare: { cmp: 'atMost', value: 2 } },
        },
      },
    ],
  }),
  // "Flying. Whenever a source you control deals noncombat damage to an opponent, you draw that many cards." (D-942)
  scribe(
    'SYNTHETIC Spark Scribe',
    'Flying\nWhenever a source you control deals noncombat damage to an opponent, you draw that many cards.',
    { kind: 'noncombatDamageDealt', by: 'you', to: 'opponent' },
    { kind: 'draw', player: YOU, count: { kind: 'triggerDamage' } },
  ),
  // "Flying. Whenever a source deals noncombat damage to a player, you gain that much life."
  scribe(
    'SYNTHETIC Rival Scribe',
    'Flying\nWhenever a source deals noncombat damage to a player, you gain that much life.',
    { kind: 'noncombatDamageDealt', by: 'any', to: 'player' },
    { kind: 'gainLife', player: YOU, amount: { kind: 'triggerDamage' } },
  ),
  // "Whenever a source you control deals noncombat damage to a player, that player loses 1 life." The player damaged is `triggerPlayer`.
  scribe(
    'SYNTHETIC Echo Scribe',
    'Flying\nWhenever a source you control deals noncombat damage to a player, that player loses 1 life.',
    { kind: 'noncombatDamageDealt', by: 'you', to: 'player' },
    { kind: 'loseLife', player: { kind: 'triggerPlayer' }, amount: 1 },
  ),
  // "{T}: This creature deals 2 damage to any target."
  singleFace({
    name: 'SYNTHETIC Spark Pinger',
    manaCost: ['1', 'R'],
    types: ['creature'],
    subtypes: ['Wizard'],
    colors: ['R'],
    colorIdentity: ['R'],
    power: 1,
    toughness: 1,
    oracleText: '{T}: This creature deals 2 damage to any target.',
    abilities: [
      {
        kind: 'activated',
        cost: [{ kind: 'tap' }],
        targets: [ANY_TARGET],
        effect: { kind: 'dealDamage', amount: 2, to: { kind: 'target', id: 't1' } },
      },
    ],
  }),
  // "This spell deals 2 damage to each opponent."
  singleFace({
    name: 'SYNTHETIC Scorch Wave',
    manaCost: ['1', 'R'],
    types: ['sorcery'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText: 'This spell deals 2 damage to each opponent.',
    spell: { effect: { kind: 'dealDamage', amount: 2, to: { kind: 'eachOpponent' } } },
  }),
];
