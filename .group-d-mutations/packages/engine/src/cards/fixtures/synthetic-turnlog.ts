/**
 * SYNTHETIC CARDS FOR "WHOSE CONTROLLER WAS DEALT COMBAT DAMAGE BY THIS CREATURE THIS TURN", "MANA VALUE X" AND "ACTIVATE ONLY ONCE EACH
 * TURN" (CR 510.2, 202.3, 602.5b). NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of D-139 (the Artifacts slice): an {X} ability that destroys each permanent with mana value X (of a type
 * filter) whose controller the creature hit this turn, one with no X that destroys every creature of the players it hit, and an
 * ability that may be activated only once each turn. Names start with "SYNTHETIC "; oracleId is null. The text describes what the AST
 * does; it is not Oracle text, and none of these is the definition of a real card.
 */
import type { Ability, Effect, ObjectFilter } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const activated = (
  cost: Extract<Ability, { kind: 'activated' }>['cost'],
  effect: Effect,
  oncePerTurn: boolean,
): Ability => ({ kind: 'activated', cost, effect, ...(oncePerTurn ? { oncePerTurn: true } : {}) });

/** A creature whose one ability destroys each permanent that matches `filter` of the players it hit this turn. */
const hunter = (
  name: string,
  cost: Extract<Ability, { kind: 'activated' }>['cost'],
  filter: ObjectFilter,
  once: boolean,
  oracle: string,
  keywords: readonly string[] = [],
  extra: readonly Ability[] = [],
): CardDefinition =>
  singleFace({
    name,
    manaCost: ['3', 'R'],
    types: ['artifact', 'creature'],
    subtypes: ['Dragon'],
    colors: ['R'],
    colorIdentity: ['R'],
    power: 4,
    toughness: 4,
    oracleText: oracle,
    abilities: [
      ...(keywords.includes('flying')
        ? [{ kind: 'keyword', keyword: { kind: 'flying' } } as const]
        : []),
      activated(cost, { kind: 'destroy', objects: { kind: 'each', filter } }, once),
      ...extra,
    ],
  });

export const SYNTHETIC_TURNLOG_LIST: readonly CardDefinition[] = [
  hunter(
    'SYNTHETIC Brand Hellkite',
    [{ kind: 'mana', symbols: ['X'] }],
    { notTypes: ['land'], manaValueX: true, controllerDealtDamageBySource: true },
    true,
    '{X}: Destroy each nonland permanent with mana value X whose controller was dealt combat damage by this creature this turn. Activate only once each turn.',
    ['flying'],
  ),
  hunter(
    'SYNTHETIC Reprisal Wyrm',
    [{ kind: 'mana', symbols: ['1'] }],
    { types: ['creature'], controllerDealtDamageBySource: true },
    false,
    '{1}: Destroy each creature whose controller was dealt combat damage by this creature this turn.\n{2}: This creature deals 1 damage to each opponent.',
    [],
    [
      activated(
        [{ kind: 'mana', symbols: ['2'] }],
        { kind: 'dealDamage', amount: 1, to: { kind: 'eachOpponent' } },
        false,
      ),
    ],
  ),
  // Two abilities, each once each turn on its own: "{1}: Draw a card. Activate only once each turn." and "{2}: You gain 2 life. Activate only once each turn."
  singleFace({
    name: 'SYNTHETIC Twin Well',
    manaCost: ['2'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText:
      '{1}: Draw a card. Activate only once each turn.\n{2}: You gain 2 life. Activate only once each turn.',
    abilities: [
      activated(
        [{ kind: 'mana', symbols: ['1'] }],
        { kind: 'draw', player: { kind: 'you' }, count: 1 },
        true,
      ),
      activated(
        [{ kind: 'mana', symbols: ['2'] }],
        { kind: 'gainLife', player: { kind: 'you' }, amount: 2 },
        true,
      ),
    ],
  }),
  singleFace({
    name: 'SYNTHETIC Daily Well',
    manaCost: ['1'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText: '{1}: Draw a card. Activate only once each turn.',
    abilities: [
      activated(
        [{ kind: 'mana', symbols: ['1'] }],
        { kind: 'draw', player: { kind: 'you' }, count: 1 },
        true,
      ),
    ],
  }),
];
