/**
 * Effect rule of the Hatsune Miku deck (issue 145, Suture Priest): "you may have that player lose 1 life". The "you may" is the sentence's own prefix
 * (the controller is asked, CR 603.5), so the rule reads what follows it: "have", a player the text names, and the life instruction in the base form.
 */
import { literal, sequence } from '../../combinators';
import type { IrNoun } from '../../ir/types';
import { defineRule, family } from '../registry';
import type { Clauses } from './operands';
import { lifeAction } from './player';

const ID = 'effect.have-player-lose-life';

/**
 * `effect.have-player-lose-life`: "have that player lose 1 life", "have its controller gain 2 life" after "you may" (CR 119.3 Life, CR 603.5 Triggered Abilities): the
 * controller of the ability chooses whether the player the text names (the player of the event, or the controller of a permanent the text points at) gains or loses life.
 * Not read: "you" or "they" as the player, a verb with an "s" ("have that player loses"), any other instruction after "have".
 */
export const EFFECT_HAVE_PLAYER_LOSE_LIFE = defineRule<Clauses>({
  id: ID,
  family: 'effect',
  leading: ['have'],
  cites: ['CR 119.3 (Life)', 'CR 603.5 (Triggered Abilities)'],
  examples: [
    'have that player lose 1 life',
    'have that player gain 2 life',
    'have its controller lose 3 life',
    'have that player lose life equal to its power',
  ],
  rejects: [
    'have you lose 1 life',
    'have that player loses 1 life',
    'have that player draw a card',
    'have that player lose',
    'that player lose 1 life',
  ],
  parse: (ctx, pos) => {
    const subject = sequence(
      literal('have '),
      family<IrNoun>('noun', { only: ['noun.that-player', 'noun.its-controller'] }),
      literal(' '),
    )(ctx, pos);
    if (!subject.ok) return subject;
    const [, player] = subject.value;
    const action = lifeAction(player, true, ID)(ctx, subject.pos);
    if (!action.ok) return action;
    return { ok: true, value: [action.value], pos: action.pos };
  },
});

export const YOU_MAY_HAVE_EFFECT_RULES = [EFFECT_HAVE_PLAYER_LOSE_LIFE];
