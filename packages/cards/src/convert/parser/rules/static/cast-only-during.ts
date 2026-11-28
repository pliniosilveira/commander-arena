/**
 * "Cast this spell only during the declare blockers step on an opponent's turn." (Illusionist's Gambit; CR 101.2, 601.3, 506.8c): a restriction on when the card may be cast, read as it is
 * cast by any means. The normalizer turns "this spell" into `~`.
 */
import { fail, literal, pattern, sequence } from '../../combinators';
import type { IrStatic } from '../../ir/types';
import { defineRule, spanned } from '../registry';
import { staticOf, subjectNoun } from './angels-words';

const ID = 'static.cast-only-during-step';

/** The combat steps the rule reads, by their names in the rules (CR 508, 509). */
const STEPS = {
  'declare attackers': 'declareAttackers',
  'declare blockers': 'declareBlockers',
} as const;

/**
 * `static.cast-only-during-step`: "Cast ~ only during the declare blockers step on an opponent's turn." (Illusionist's Gambit; CR 101.2, 601.3, 506.8c): the card can't be cast unless the
 * game is in that step (of any combat phase of the turn, CR 506.8c) and, with "on an opponent's turn", the active player is an opponent of the player who would cast it. The engine's
 * `cantCastThis` with the negation of that condition (`duringStep`, `not yourTurn`). Not read: another step or a phase ("during combat", "during your upkeep"), "before"
 * or "after" a point of combat (CR 506.8), "on your turn", a second restriction.
 */
export const STATIC_CAST_ONLY_DURING_STEP = defineRule<IrStatic>({
  id: ID,
  family: 'static',
  leading: ['cast'],
  cites: [
    'CR 101.2 (Golden Rules)',
    'CR 601.3 (Casting Spells)',
    'CR 506.8c (Combat Phase)',
    'CR 509.1 (Declare Blockers Step)',
  ],
  examples: [
    "Cast ~ only during the declare blockers step on an opponent's turn.",
    'Cast ~ only during the declare blockers step on an opponent’s turn.',
    'Cast ~ only during the declare attackers step.',
    'cast ~ only during the declare blockers step.',
  ],
  rejects: [
    "Cast ~ only during the declare blockers step on an opponent's turn",
    'Cast ~ only during combat.',
    "Cast ~ only during an opponent's turn.",
    'Cast ~ only during the combat damage step.',
    'Cast ~ only during the declare blockers step on your turn.',
    'Cast ~ only before blockers are declared.',
    "Cast ~ only during the declare blockers step on an opponent's turn and only if you control a creature.",
    "Cast creature spells only during the declare blockers step on an opponent's turn.",
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      pattern(/cast /iu),
      spanned(literal('~')),
      pattern(
        / only during the (declare attackers|declare blockers) step( on an opponent['’]s turn)?\./iu,
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, self, words] = r.value;
    const named = (words[1] ?? '').toLowerCase() as keyof typeof STEPS;
    const step = STEPS[named];
    if (step === undefined) return fail(ctx, pos);
    return {
      ok: true,
      value: staticOf(
        ID,
        subjectNoun('self', '~', self.span, ID),
        [
          {
            kind: 'cantCastThis',
            onlyDuring: { step, ...(words[2] === undefined ? {} : { opponentsTurn: true }) },
          },
        ],
        pos,
        r.pos,
      ),
      pos: r.pos,
    };
  },
});

export const CAST_ONLY_DURING_STATIC_RULES = [STATIC_CAST_ONLY_DURING_STEP];
