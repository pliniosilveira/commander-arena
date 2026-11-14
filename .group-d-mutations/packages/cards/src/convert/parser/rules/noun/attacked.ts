/**
 * `noun.attacked-by-it` (stage P31, D-140): the player, planeswalker or battle a creature attacks.
 */
import { pattern } from '../../combinators';
import type { IrNoun } from '../../ir/types';
import { defineRule } from '../registry';
import { possessedNoun } from './controller';

/**
 * `noun.attacked-by-it`: "the player or planeswalker it's attacking" (stage P31, D-140, CR 508.1b: an attacking creature attacks a player,
 * a planeswalker or a battle; CR 506.4: a creature removed from combat attacks nothing). "It" is a pronoun the binding pass reads.
 */
export const NOUN_ATTACKED_BY_IT = defineRule<IrNoun>({
  id: 'noun.attacked-by-it',
  family: 'noun',
  leading: ['the'],
  cites: ['CR 508.1b (Declare Attackers Step)', 'CR 506.4 (Combat Phase)'],
  examples: [
    "the player or planeswalker it's attacking",
    'the player or planeswalker it’s attacking',
  ],
  rejects: [
    "the player it's attacking",
    "the planeswalker it's attacking",
    'the player or planeswalker it attacked',
  ],
  parse: (ctx, pos) => {
    const r = pattern(/the player or planeswalker (it)['’]s attacking(?![\p{L}\p{N}])/iu)(ctx, pos);
    if (!r.ok) return r;
    const at = pos + 'the player or planeswalker '.length;
    const noun: IrNoun = {
      kind: 'noun',
      det: 'attackedBy',
      filter: { raw: ctx.text.slice(pos, r.pos) },
      upTo: false,
      plural: false,
      other: false,
      of: possessedNoun('noun.attacked-by-it', 'its', at),
      span: { start: pos, end: r.pos },
      rule: 'noun.attacked-by-it',
    };
    return { ok: true, value: noun, pos: r.pos };
  },
});
