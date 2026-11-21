/**
 * Effect rules of the Federation Fleet deck, group E (Spacecraft and chapters):
 *
 * - `effect.owner-draws-then-shuffles`: "The owner of up to one target creature draws two cards, then shuffles that creature into their library." (Unification, chapter I).
 * - `effect.exile-made-token-at-end-of-combat`: "Exile that token at end of combat." (U.S.S. Stargazer, Here and There): the delayed exile of the token the instruction before made.
 */
import { fail, literal, map, pattern, satisfy, sequence } from '../../combinators';
import type { IrAmount, IrNoun } from '../../ir/types';
import { defineRule, family, quietly, spanned } from '../registry';
import { type Clauses, makeClause } from './operands';

/**
 * `effect.owner-draws-then-shuffles`: "the owner of up to one target creature draws two cards, then shuffles that creature into their library" (CR 108.3: the owner of the permanent,
 * not its controller; CR 121.1: the draw; CR 701.24: the shuffle; CR 608.2c: the instructions are followed in the order written; CR 115.1: the target is chosen as the ability is put on
 * the stack, and "up to one" may be none). One target of "up to one"; with none chosen nothing happens. The engine's `draw` of the owner, the `moveToZone` of the target to the library
 * and the `shuffle` of the owner's library. Not read: another count of targets, the controller, another amount or place, a trailing clause.
 */
export const EFFECT_OWNER_DRAWS_THEN_SHUFFLES = defineRule<Clauses>({
  id: 'effect.owner-draws-then-shuffles',
  family: 'effect',
  leading: ['the'],
  cites: [
    'CR 108.3 (Owner and Controller)',
    'CR 121.1 (Drawing a Card)',
    'CR 701.24 (Shuffle)',
    'CR 608.2c (Resolving Spells and Abilities)',
    'CR 115.1 (Targets)',
  ],
  examples: [
    'the owner of up to one target creature draws two cards, then shuffles that creature into their library',
    'the owner of target creature draws a card, then shuffles that creature into their library',
    'the owner of up to one target artifact draws three cards, then shuffles that artifact into their library',
  ],
  rejects: [
    'the owner of up to one target creature draws two cards, then shuffles it into their library',
    'the owner of up to one target creature draws two cards, then shuffles that creature into your library',
    'the owner of up to one target creature draws two cards, then shuffles that artifact into their library',
    'the owner of up to two target creatures draw two cards, then shuffle those creatures into their libraries',
    'the owner of up to one target creature draws two cards, then shuffles that creature into their library and draws a card',
    'the owner of up to one target creature draws two cards',
    'the controller of up to one target creature draws two cards, then shuffles that creature into their library',
    'the owner of up to one target creature draws X cards, then shuffles that creature into their library',
    'the owner of each creature draws two cards, then shuffles that creature into their library',
  ],
  parse: (ctx, pos) => {
    const id = 'effect.owner-draws-then-shuffles';
    const r = sequence(
      literal('the owner of '),
      satisfy(
        family<IrNoun>('noun', { only: ['noun.target-permanent', 'noun.up-to-one-permanent'] }),
        (noun) =>
          noun.det === 'target' &&
          !noun.plural &&
          noun.anyNumber !== true &&
          (noun.count === undefined || (noun.count.kind === 'number' && noun.count.value === 1)) &&
          noun.filter.player === undefined &&
          noun.filter.anyTarget !== true,
      ),
      literal(' draws '),
      family<IrAmount>('amount', { only: ['amount.number', 'amount.article'] }),
      literal(' '),
      pattern(/cards?, then shuffles that /iu),
      spanned(pattern(/[a-z]+(?: [a-z]+)*(?= into their library(?![\p{L}\p{N}]))/u)),
      literal(' into their library'),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, objects, , count, , , what] = r.value;
    // "that creature" names the kind the target was chosen as ("that artifact" after "target artifact"): the words are the target's own, never a different object.
    const named = what.value[0] ?? '';
    const aimed = ctx.text.slice(objects.span.start, objects.span.end).toLowerCase();
    if (!aimed.endsWith(named.toLowerCase())) return fail(ctx, pos);
    const span = { start: pos, end: r.pos };
    return {
      ok: true,
      value: [makeClause(id, 'ownerDrawsThenShuffles', { objects, count }, span)],
      pos: r.pos,
    };
  },
});

/**
 * `effect.exile-made-token-at-end-of-combat`: "Exile that token at end of combat." (CR 603.7, 603.7c, 511.1): one delayed triggered ability, about the one token the instruction
 * before made and no other object, that exiles it as the end of combat step begins; a token that has left by then is a new object and nothing happens to it. The engine's
 * `delayedTrigger` at the end of combat step of an `exile` of `moved`. Not read: "it", several tokens, another time ("at the beginning of the next end step" is
 * `effect.end-step-made-tokens`), another verb.
 */
export const EFFECT_EXILE_MADE_TOKEN_AT_END_OF_COMBAT = defineRule<Clauses>({
  id: 'effect.exile-made-token-at-end-of-combat',
  family: 'effect',
  leading: ['exile'],
  cites: [
    'CR 603.7 (Delayed Triggered Abilities)',
    'CR 603.7c (Delayed Triggered Abilities)',
    'CR 511.1 (End of Combat Step)',
  ],
  examples: ['exile that token at end of combat', 'Exile that token at end of combat'],
  rejects: [
    'exile it at end of combat',
    'exile those tokens at end of combat',
    'exile that creature at end of combat',
    'exile that token at the end of combat',
    'exile that token at end of combat and draw a card',
    'exile that token at the beginning of the next end step',
    'sacrifice that token at end of combat',
    'exile that token at end of turn',
  ],
  parse: (ctx, pos) => {
    const id = 'effect.exile-made-token-at-end-of-combat';
    const r = map(
      spanned(pattern(/exile that token at end of combat(?![\p{L}\p{N}])/iu)),
      ({ span }) => span,
    )(ctx, pos);
    if (!r.ok) return r;
    if (!/^(?:\.|$)/u.test(ctx.text.slice(r.pos))) return fail(ctx, pos);
    return {
      ok: true,
      value: [makeClause(id, 'exileAtEndOfCombatMade', {}, r.value)],
      pos: r.pos,
    };
  },
});

export const FLEET_E_EFFECT_RULES = [
  EFFECT_OWNER_DRAWS_THEN_SHUFFLES,
  EFFECT_EXILE_MADE_TOKEN_AT_END_OF_COMBAT,
].map(quietly);
