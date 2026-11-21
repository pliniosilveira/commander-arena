/**
 * The Medium level of the Challenges block: the same opponent as Easy, plus emblems it owns from the start of the game. An emblem is an object of
 * the command zone (CR 114); giving one at the start is the app's own house rule, to make a challenge harder, not a rule of Magic. The abilities are
 * written as the engine's AST, not parsed from the text, because two of the wordings are not read by the Oracle text parser; `text` is what the
 * emblem shows. A challenge with no entry here is not offered in Medium. Each emblem is an experiment and may change.
 */
import type { Ability } from '@commander-arena/engine';

export interface ChallengeEmblem {
  readonly text: string;
  readonly abilities: readonly Ability[];
}

/** "At the beginning of your first upkeep": the upkeep of the first turn the owner takes (CR 500.1), not the first of the game. */
const FIRST_UPKEEP_BASIC_LAND: ChallengeEmblem = {
  text: 'At the beginning of your first upkeep, search your library for a basic land card, put it onto the battlefield, then shuffle.',
  abilities: [
    {
      kind: 'triggered',
      trigger: { kind: 'upkeep', whose: 'you' },
      interveningIf: { kind: 'ownTurnNumber', compare: { cmp: 'equal', value: 1 } },
      effect: {
        kind: 'search',
        player: { kind: 'you' },
        filter: { types: ['land'], supertypes: ['basic'] },
        max: 1,
        destinations: [{ zone: 'battlefield', count: 1 }],
        reveal: false,
        shuffle: true,
      },
    },
  ],
};

/** No limit per turn, on purpose: each Nazgûl that enters fetches another (an experiment). */
const NAZGUL_FETCHES_NAZGUL: ChallengeEmblem = {
  text: 'Whenever a creature named Nazgûl enters under your control, search your library for a card named Nazgûl, put it into your hand, then shuffle.',
  abilities: [
    {
      kind: 'triggered',
      trigger: {
        kind: 'entersBattlefield',
        what: { types: ['creature'], named: 'Nazgûl', controller: 'you' },
      },
      effect: {
        kind: 'search',
        player: { kind: 'you' },
        filter: { named: 'Nazgûl' },
        max: 1,
        destinations: [{ zone: 'hand', count: 1 }],
        reveal: false,
        shuffle: true,
      },
    },
  ],
};

/** The emblems the opponent of each challenge (by challenge id) owns at Medium. */
export const MEDIUM_EMBLEMS: Readonly<Record<string, readonly ChallengeEmblem[]>> = {
  'witch-king-of-angmar': [FIRST_UPKEEP_BASIC_LAND, NAZGUL_FETCHES_NAZGUL],
};

export type ChallengeLevel = 'easy' | 'medium';

/** The emblems the opponent owns at `level`; none at Easy. */
export function emblemsFor(level: ChallengeLevel, challenge: string): readonly ChallengeEmblem[] {
  return level === 'medium' ? (MEDIUM_EMBLEMS[challenge] ?? []) : [];
}
