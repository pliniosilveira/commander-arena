/**
 * Effect rule of the Hatsune Miku deck (issue 145), Halo Fountain: "You win the game."
 */
import { pattern } from '../../combinators';
import { defineRule, spanned } from '../registry';
import { type Clauses, makeClause } from './operands';
import { impliedYou } from './player';

/**
 * `effect.win-game`: "you win the game" (CR 104.2b: an effect may state that a player wins the game; CR 104.1: the game ends immediately when a player wins). Said of "you" only, with
 * nothing after it: the engine's `winGame` names one player, and a condition ("if ..."), another player ("target player wins the game", "each opponent wins the game"), a
 * result that goes with it ("and draw a card") or a different verb form ("you wins") is another instruction that stays unread.
 */
export const EFFECT_WIN_GAME = defineRule<Clauses>({
  id: 'effect.win-game',
  family: 'effect',
  leading: ['you'],
  cites: ['CR 104.2b (Ending the Game)', 'CR 104.1 (Ending the Game)'],
  examples: ['you win the game', 'You win the game'],
  rejects: [
    'you win',
    'you wins the game',
    'you win the game if you control a creature',
    'you win the games',
    'you lose the game',
    'target player wins the game',
    'each opponent wins the game',
    'you win the game and draw a card',
    'you may win the game',
    'you win the game.',
  ],
  parse: (ctx, pos) => {
    const r = spanned(pattern(/you win the game(?![\p{L}\p{N}])/iu))(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: [
        makeClause(
          'effect.win-game',
          'winGame',
          { player: impliedYou('effect.win-game', pos) },
          r.value.span,
        ),
      ],
      pos: r.pos,
    };
  },
});

export const WIN_GAME_EFFECT_RULES = [EFFECT_WIN_GAME];
