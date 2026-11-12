/**
 * SYNTHETIC CARDS FOR "WHEN YOU NEXT CAST AN INSTANT OR SORCERY SPELL THIS TURN, COPY THAT SPELL". NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of D-336 to D-338 (group 3-a of the Niv-Mizzet deck): a delayed triggered ability on a cast event that is created as a spell or an
 * activated ability resolves, triggers once (the next matching spell its controller casts) and ends with the turn (CR 603.7, 603.7a, 603.7c), and
 * `copySpell` with a count taken from the game ("for each time you've cast your commander from the command zone this game", CR 903.8, 707.10).
 * Names start with "SYNTHETIC "; oracleId is null. The text describes what the AST does; it is not Oracle text, and none of these is the definition of
 * a real card.
 */
import type { ObjectFilter } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

/** "an instant or sorcery spell". */
const INSTANT_OR_SORCERY: ObjectFilter = {
  stackKind: 'spell',
  anyOf: [{ types: ['instant'] }, { types: ['sorcery'] }],
};

export const SYNTHETIC_NIV_GROUP_3_A_LIST: readonly CardDefinition[] = [
  // "When you next cast an instant or sorcery spell this turn, copy that spell. You may choose new targets for the copy."
  singleFace({
    name: 'SYNTHETIC Next Echo',
    manaCost: ['U', 'R'],
    types: ['instant'],
    colors: ['U', 'R'],
    colorIdentity: ['U', 'R'],
    oracleText:
      'When you next cast an instant or sorcery spell this turn, copy that spell. You may choose new targets for the copy.',
    spell: {
      effect: {
        kind: 'delayedCast',
        filter: INSTANT_OR_SORCERY,
        effect: { kind: 'copySpell', spell: { kind: 'triggerSubject' }, newTargets: 'may' },
      },
    },
  }),
  // "When you next cast an instant or sorcery spell this turn, copy that spell." (the copy keeps the targets)
  singleFace({
    name: 'SYNTHETIC Next Exact Echo',
    manaCost: ['U'],
    types: ['instant'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: 'When you next cast an instant or sorcery spell this turn, copy that spell.',
    spell: {
      effect: {
        kind: 'delayedCast',
        filter: INSTANT_OR_SORCERY,
        effect: { kind: 'copySpell', spell: { kind: 'triggerSubject' }, newTargets: 'no' },
      },
    },
  }),
  // "{2}{U}, Sacrifice this creature: When you next cast an instant or sorcery spell this turn, copy it for each time you've cast your commander from the
  // command zone this game. You may choose new targets for the copies."
  singleFace({
    name: 'SYNTHETIC Commander Echo Drake',
    manaCost: ['1', 'U'],
    types: ['creature'],
    subtypes: ['Drake'],
    colors: ['U'],
    colorIdentity: ['U'],
    power: 2,
    toughness: 1,
    oracleText:
      "{2}{U}, Sacrifice this creature: When you next cast an instant or sorcery spell this turn, copy it for each time you've cast your commander from the command zone this game. You may choose new targets for the copies.",
    abilities: [
      {
        kind: 'activated',
        cost: [
          { kind: 'mana', symbols: ['2', 'U'] },
          { kind: 'sacrifice', what: { kind: 'this' } },
        ],
        effect: {
          kind: 'delayedCast',
          filter: INSTANT_OR_SORCERY,
          effect: {
            kind: 'copySpell',
            spell: { kind: 'triggerSubject' },
            newTargets: 'may',
            count: { kind: 'commanderCasts' },
          },
        },
      },
    ],
  }),
];
