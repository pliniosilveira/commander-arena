/**
 * Effect rules of the Planeswalker Party deck (issue 132).
 */
import { fail, pattern, sequence } from '../../combinators';
import { defineRule, family, quietly } from '../registry';
import { type Clauses, makeClause } from './operands';

const ID = 'effect.damage-exile-if-dies';

/**
 * `effect.damage-exile-if-dies`: "~ deals X damage to target creature or planeswalker. If a permanent dealt damage this way would die this turn, exile it instead." (Chandra, Awakened
 * Inferno; CR 120.2, 614.1a, 614.6, 700.4): the damage of `effect.damage` and the replacement of the sentence after it, which are one instruction (the segmenter keeps the two sentences
 * together). The lowering turns the second sentence into the engine's `exileIfDiesThisTurn` of the target, behind the damage actually dealt. Only one target and the words "a permanent dealt
 * damage this way", "that creature" or "that permanent". Not read: another recipient than a target, "until end of turn", "instead of dying", a later sentence.
 */
export const EFFECT_DAMAGE_EXILE_IF_DIES = defineRule<Clauses>({
  id: ID,
  family: 'effect',
  leading: ['~'],
  cites: [
    'CR 120.2 (Damage)',
    'CR 614.1a (Replacement Effects)',
    'CR 614.6 (Replacement Effects)',
    'CR 700.4 (Dies)',
  ],
  examples: [
    '~ deals 3 damage to target creature. If that creature would die this turn, exile it instead',
    '~ deals 3 damage to target creature or planeswalker. If a permanent dealt damage this way would die this turn, exile it instead',
    '~ deals 2 damage to target creature. If that permanent would die this turn, exile it instead',
  ],
  rejects: [
    '~ deals 3 damage to target creature. If that creature would die this turn, exile it',
    '~ deals 3 damage to target creature. If that creature would die, exile it instead',
    '~ deals 3 damage to each creature. If that creature would die this turn, exile it instead',
    '~ deals 3 damage to target creature. If that creature would die this turn, exile it instead and draw a card',
    '~ deals 3 damage to target creature. If that creature would die this turn, put it on the bottom of its owner’s library instead',
    '~ deals 3 damage to target creature. If that creature would die until end of turn, exile it instead',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      family<Clauses>('effect', { only: ['effect.damage'] }),
      pattern(
        /\. if (?:a permanent dealt damage this way|that (?:creature|permanent)) would die this turn, exile it instead(?![\p{L}\p{N}])/iu,
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const [clauses] = r.value;
    const [first, ...rest] = clauses;
    const to = first?.args.to;
    const items = to?.kind === 'noun' ? [to] : to?.kind === 'nounList' ? to.items : [];
    // One target: the permanent "dealt damage this way" is that target (CR 115.1), so a group ("each creature") is not read.
    if (
      first === undefined ||
      rest.length > 0 ||
      first.verb !== 'dealDamage' ||
      items.length !== 1 ||
      items[0]?.det !== 'target'
    ) {
      return fail(ctx, pos);
    }
    const marked = makeClause(
      ID,
      'dealDamage',
      { ...first.args, exileIfDies: { kind: 'flag', value: true, span: first.span, rule: ID } },
      first.span,
    );
    return { ok: true, value: [{ ...marked, rule: ID }], pos: r.pos };
  },
});

export const PLANESWALKER_PARTY_EFFECT_RULES = [quietly(EFFECT_DAMAGE_EXILE_IF_DIES)];
