/**
 * SYNTHETIC CARDS FOR AN EFFECT THAT GIVES A PERMANENT A STATIC ABILITY FOR GOOD. NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of D-981 (the Bruna deck program, The Book of Exalted Deeds): "It gains \"You can't lose the game and your opponents
 * can't win the game.\"" with no duration, which lasts for the rest of the game (CR 611.2a), as an effect of an activated ability whose source was
 * exiled as a cost. Names start with "SYNTHETIC "; oracleId is null. The text describes what the AST does; it is not Oracle text, and none of
 * these is the definition of a real card.
 */
import type { Ability, Cost, Effect } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const TARGET = { kind: 'target', id: 't1' } as const;
const WHITE3: Cost = { kind: 'mana', symbols: ['W', 'W', 'W'] };
const TAP: Cost = { kind: 'tap' };
const ANGEL_TARGET = [
  { id: 't1', what: { kind: 'object', filter: { zone: 'battlefield', subtypes: ['Angel'] } } },
] as const;

const PROTECTION: Ability[] = [
  { kind: 'static', static: { kind: 'cantLoseGame' } },
  { kind: 'static', static: { kind: 'opponentsCantWin' } },
];

const grant = (abilities: readonly Ability[]): Effect => ({
  kind: 'grantAbility',
  objects: TARGET,
  abilities,
  duration: 'permanent',
});

const artifact = (
  name: string,
  cost: readonly Cost[],
  effect: Effect,
  oracleText: string,
  timing?: 'sorcery',
): CardDefinition =>
  singleFace({
    name,
    manaCost: ['W', 'W', 'W'],
    types: ['artifact'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText,
    abilities: [
      {
        kind: 'activated',
        cost,
        targets: ANGEL_TARGET,
        effect,
        ...(timing === undefined ? {} : { timing }),
      },
    ],
  });

export const SYNTHETIC_BOOK_EXALTED_LIST: readonly CardDefinition[] = [
  // "{W}{W}{W}, {T}, Exile ~: Put an enlightened counter on target Angel. It gains "You can't lose the game and your opponents can't win the
  // game." Activate only as a sorcery."
  artifact(
    'SYNTHETIC Exalted Tome',
    [WHITE3, TAP, { kind: 'exileThis' }],
    {
      kind: 'sequence',
      effects: [
        { kind: 'addCounters', objects: TARGET, counter: 'enlightened', count: 1 },
        grant(PROTECTION),
      ],
    },
    'WWW, {T}, Exile ~: Put an enlightened counter on target Angel. It gains "You can\'t lose the game and your opponents can\'t win the game." Activate only as a sorcery.',
    'sorcery',
  ),
  // The same at instant speed (a sibling: the grant does not depend on the timing).
  artifact(
    'SYNTHETIC Quick Tome',
    [WHITE3, TAP, { kind: 'exileThis' }],
    grant(PROTECTION),
    'WWW, {T}, Exile ~: Target Angel gains "You can\'t lose the game and your opponents can\'t win the game."',
  ),
  // Only the first half: "You can't lose the game." (the opponents may win).
  artifact(
    'SYNTHETIC Half Tome',
    [WHITE3, TAP, { kind: 'exileThis' }],
    grant([{ kind: 'static', static: { kind: 'cantLoseGame' } }]),
    'WWW, {T}, Exile ~: Target Angel gains "You can\'t lose the game."',
  ),
];
