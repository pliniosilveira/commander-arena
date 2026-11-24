/**
 * Effect rules of the Planeswalker Party deck (issue 132).
 */
import { fail, literal, pattern, sequence } from '../../combinators';
import type { IrCounterSpec, IrNoun } from '../../ir/types';
import { defineRule, family, quietly, spanned } from '../registry';
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

const MOVE_ID = 'effect.move-counter-from-self';

/**
 * `effect.move-counter-from-self`: "move a loyalty counter from ~ onto that planeswalker" (Gatewatch Beacon; CR 122.1, 122.6): one counter of a named kind from the permanent with the
 * ability onto the permanent the trigger is about. The engine's `moveCounterFromThis`. Not read: "any number" (`effect.move-counters-onto-others`), a number of counters other than "a",
 * the counters of another permanent, a target, another noun than "that [type]".
 */
export const EFFECT_MOVE_COUNTER_FROM_SELF = defineRule<Clauses>({
  id: MOVE_ID,
  family: 'effect',
  leading: ['move'],
  cites: [
    'CR 122.1 (Counters)',
    'CR 122.6 (Counters)',
    'CR 608.2c (Resolving Spells and Abilities)',
  ],
  examples: [
    'move a loyalty counter from ~ onto that planeswalker',
    'move a +1/+1 counter from ~ onto that creature',
  ],
  rejects: [
    'move a loyalty counter from ~ onto target planeswalker',
    'move two loyalty counters from ~ onto that planeswalker',
    'move a loyalty counter from target planeswalker onto that planeswalker',
    'move any number of loyalty counters from ~ onto that planeswalker',
    'move a loyalty counter from ~ onto that planeswalker and draw a card',
    'move a loyalty counter from ~ onto that',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      literal('move a '),
      spanned(pattern(/[+-]\d+\/[+-]\d+|[a-z]+/i)),
      literal(' counter from ~ onto '),
      family<IrNoun>('noun', { only: ['noun.that-object'] }),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, counterWord, , noun] = r.value;
    const counter: IrCounterSpec = {
      kind: 'counterSpec',
      name: counterWord.value[0].toLowerCase(),
      span: counterWord.span,
      rule: MOVE_ID,
    };
    return {
      ok: true,
      value: [
        makeClause(
          MOVE_ID,
          'moveCounterFromThis',
          { counter, objects: noun },
          { start: pos, end: r.pos },
        ),
      ],
      pos: r.pos,
    };
  },
});

export const PLANESWALKER_PARTY_EFFECT_RULES = [
  quietly(EFFECT_DAMAGE_EXILE_IF_DIES),
  quietly(EFFECT_MOVE_COUNTER_FROM_SELF),
];
