/**
 * Effect rule of Slithermuse: "choose an opponent." (CR 608.2d, 102.2). The opponent is what "that player" means in the sentences after it.
 */
import { pattern } from '../../combinators';
import { defineRule, spanned } from '../registry';
import { type Clauses, makeClause } from './operands';

/**
 * `effect.choose-an-opponent`: "choose an opponent" (CR 608.2d: the controller of the effect chooses as it resolves; CR 102.2: an opponent is a player of another team, still in the game). The
 * engine's `choosePlayer` among the opponents; with one opponent left nothing is asked. The player is what the sentences after it call "that player" (`chosenPlayer`). Not read: a
 * number of opponents ("two opponents"), a rule for the choice ("an opponent with the most life"), "target opponent", "a player", more words after it.
 */
export const EFFECT_CHOOSE_AN_OPPONENT = defineRule<Clauses>({
  id: 'effect.choose-an-opponent',
  family: 'effect',
  leading: ['choose'],
  cites: ['CR 608.2d (Resolving Spells and Abilities)', 'CR 102.2 (Players)'],
  examples: ['choose an opponent'],
  rejects: [
    'choose two opponents',
    'choose an opponent at random',
    'choose an opponent with the most life',
    'choose a player',
    'choose target opponent',
    'choose an opponent and draw a card',
    'chooses an opponent',
  ],
  parse: (ctx, pos) => {
    const r = spanned(pattern(/choose an opponent(?![\p{L}\p{N}]| at random| that )/iu))(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: [makeClause('effect.choose-an-opponent', 'chooseOpponent', {}, r.value.span)],
      pos: r.pos,
    };
  },
});

export const CHOOSE_OPPONENT_EFFECT_RULES = [EFFECT_CHOOSE_AN_OPPONENT];
