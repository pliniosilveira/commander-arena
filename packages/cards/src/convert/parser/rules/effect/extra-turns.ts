/**
 * Extra turns (CR 500.7): the bare imperative "Take an extra turn after this one." The same words said of a player ("target player takes an extra turn after this one") are an
 * action of `effect.player` (`rules/effect/player.ts`).
 */
import { fail, pattern } from '../../combinators';
import { defineRule, quietly, spanned } from '../registry';
import { type Clauses, makeClause } from './operands';
import { impliedYou } from './player';

/**
 * `effect.take-extra-turn`: "Take an extra turn after this one." (CR 500.7: the turn is added directly after the current one). The engine's `extraTurn` for the controller.
 * Not read: a number of turns ("take two extra turns after this one"), a turn after another turn ("after your next turn"), a rider ("skip the untap step of that turn").
 */
export const EFFECT_TAKE_EXTRA_TURN = defineRule<Clauses>({
  id: 'effect.take-extra-turn',
  family: 'effect',
  leading: ['take'],
  cites: ['CR 500.7 (Turn Structure)'],
  examples: ['take an extra turn after this one', 'Take an extra turn after this one'],
  rejects: [
    'take an extra turn',
    'take two extra turns after this one',
    'take an extra turn after this one and draw a card',
    'take an extra turn after your next turn',
    'takes an extra turn after this one',
    'take an extra turn after this',
    'take an extra turn after this one. skip the untap step of that turn',
  ],
  parse: (ctx, pos) => {
    const id = 'effect.take-extra-turn';
    const r = spanned(pattern(/take an extra turn after this one(?![\p{L}\p{N}])/iu))(ctx, pos);
    if (!r.ok) return r;
    // The sentence ends here: a rider about the turn is another effect the engine does not have.
    if (!/^(?:\.?\s*$|\.(?!\s*skip)|\s*$)/iu.test(ctx.text.slice(r.pos))) return fail(ctx, pos);
    return {
      ok: true,
      value: [makeClause(id, 'extraTurn', { player: impliedYou(id, pos) }, r.value.span)],
      pos: r.pos,
    };
  },
});

/** Quiet: a line this rule does not read stops where it always did. */
export const EXTRA_TURN_EFFECT_RULES = [quietly(EFFECT_TAKE_EXTRA_TURN)];
