/**
 * Effect rule of the Limit Break deck (Ultimate Magic: Meteor): "for each opponent, choose an artifact or land that player controls. Destroy the chosen permanents."
 */
import { fail, pattern } from '../../combinators';
import type { IrFilter, IrNoun } from '../../ir/types';
import { defineRule, quietly } from '../registry';
import { type Clauses, makeClause } from './operands';

/**
 * `effect.for-each-opponent-choose-destroy`: "for each opponent, choose an artifact or land that player controls. Destroy the chosen permanents" (CR 608.2d, 701.8, 102.2): the
 * controller chooses, for each opponent, one permanent of that opponent's the words name, and all the permanents chosen are destroyed together. Two sentences that `splitSentences`
 * keeps together (the first may follow the comma of a condition). The engine's `chooseOnePerOpponentDestroy`. Not read: "each player", another number or kind of choice, a verb
 * other than destroy, "they" for the opponent, a controller other than "that player".
 */
export const EFFECT_FOR_EACH_OPPONENT_CHOOSE_DESTROY = defineRule<Clauses>({
  id: 'effect.for-each-opponent-choose-destroy',
  family: 'effect',
  leading: ['for'],
  cites: [
    'CR 608.2d (Resolving Spells and Abilities)',
    'CR 701.8 (Destroy)',
    'CR 102.2 (Players)',
  ],
  examples: [
    'for each opponent, choose an artifact or land that player controls. Destroy the chosen permanents',
    'for each opponent, choose an artifact that player controls. Destroy the chosen permanents',
    'for each opponent, choose a creature or planeswalker that player controls. Destroy the chosen permanents',
  ],
  rejects: [
    'for each opponent, choose an artifact or land that player controls',
    'for each opponent, choose an artifact or land that player controls. Destroy the chosen permanents.',
    'for each player, choose an artifact or land that player controls. Destroy the chosen permanents',
    'for each opponent, choose two artifacts that player controls. Destroy the chosen permanents',
    'for each opponent, choose an artifact or land that player controls. Exile the chosen permanents',
    'for each opponent, choose an artifact or land they control. Destroy the chosen permanents',
    'for each opponent, choose an artifact or land you control. Destroy the chosen permanents',
    'for each opponent, choose a permanent that player controls. Destroy the chosen permanents and draw a card',
    'for each opponent, choose an artifact or a land that player controls. Destroy the chosen permanents',
  ],
  parse: (ctx, pos) => {
    const id = 'effect.for-each-opponent-choose-destroy';
    const r = pattern(
      /for each opponent, choose an? (artifact|creature|enchantment|land|planeswalker|permanent)(?: or (artifact|creature|enchantment|land|planeswalker))? that player controls\. destroy the chosen permanents(?![\p{L}\p{N}])/iu,
    )(ctx, pos);
    if (!r.ok) return r;
    const m = r.value;
    const kinds = [m[1], m[2]]
      .filter((k): k is string => k !== undefined)
      .map((k) => k.toLowerCase());
    const named = kinds.filter((k) => k !== 'permanent');
    // "a permanent or land" would name the same objects twice: only one word may be "permanent", and it stands alone.
    if (named.length !== kinds.length && kinds.length > 1) return fail(ctx, pos);
    const members: IrFilter[] = named.map((k) => ({ types: [k], raw: k }));
    const span = { start: pos, end: r.pos };
    const what: IrNoun = {
      kind: 'noun',
      det: 'a',
      filter: {
        raw: m[0],
        ...(named.length === 1 ? { types: named } : {}),
        ...(members.length > 1 ? { anyOf: members } : {}),
      },
      upTo: false,
      plural: false,
      other: false,
      span,
      rule: id,
    };
    return {
      ok: true,
      value: [makeClause(id, 'chooseOnePerOpponentDestroy', { what }, span)],
      pos: r.pos,
    };
  },
});

export const CHOOSE_PER_OPPONENT_EFFECT_RULES = [EFFECT_FOR_EACH_OPPONENT_CHOOSE_DESTROY].map(
  quietly,
);
