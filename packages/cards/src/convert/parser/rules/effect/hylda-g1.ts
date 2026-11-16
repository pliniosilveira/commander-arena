/**
 * Effect rules of group 1 of the Hylda deck (issue 42, D-512, D-513): "for each opponent, tap up to one target creature that player controls" (Hammers of Moradin) and "tap up
 * to X target nonland permanents, where X is the number of cards looked at while scrying this way" (Elvish Mariner). The effects are the engine's `tap` of a target slot
 * (`onePerOpponent`, `upToTriggerAmount`); only the words are new.
 */
import { fail, literal, map, pattern, satisfy, sequence } from '../../combinators';
import type { IrFilter, IrNoun } from '../../ir/types';
import { BOUNDARY, permanentPhrase, withoutZone } from '../noun/phrases';
import { defineRule, quietly, spanned } from '../registry';
import { perOpponentNoun } from './angels';
import { type Clauses, makeClause } from './operands';

/**
 * `effect.tap-per-opponent`: "for each opponent, tap up to one target creature that player controls" (CR 115.1, 601.2c, 603.3d: one slot that takes at most one target of each
 * opponent; CR 701.26a: tap). The same slot as the exile and the destroy of D-150 and D-273 (`TargetSpec.onePerOpponent`). "Up to one" only: without it each opponent would need a
 * target, and an opponent who controls no creature could not be chosen; other counts, other verbs' words after the phrase and "each player" are not this slot.
 */
export const EFFECT_TAP_PER_OPPONENT = defineRule<Clauses>({
  id: 'effect.tap-per-opponent',
  family: 'effect',
  leading: ['for'],
  cites: ['CR 115.1 (Targets)', 'CR 601.2c (Casting Spells)', 'CR 701.26a (Tap and Untap)'],
  examples: [
    'for each opponent, tap up to one target creature that player controls',
    'for each opponent, tap up to one target artifact that player controls',
    'for each opponent, tap up to one target nonland permanent that player controls',
  ],
  rejects: [
    'for each opponent, tap target creature that player controls',
    'for each opponent, tap up to two target creatures that player controls',
    'for each opponent, tap up to one target creature',
    'for each opponent, tap up to one target creature you control',
    'for each opponent, tap up to one target creature an opponent controls',
    'for each opponent, tap up to one target creature that player controls and draw a card',
    'for each opponent, tap up to one target creature that player controls until end of turn',
    'for each player, tap up to one target creature that player controls',
    'for each other opponent, tap up to one target creature that player controls',
    'for each opponent, untap up to one target creature that player controls',
    'tap up to one target creature that player controls',
    'for each opponent, tap up to one target creature that player owns',
  ],
  parse: (ctx, pos) => {
    const id = 'effect.tap-per-opponent';
    const head = literal('for each opponent, tap up to one target ')(ctx, pos);
    if (!head.ok) return head;
    const noun = perOpponentNoun(ctx, pos, 'tap', head.pos, id);
    if (!noun.ok) return noun;
    const span = { start: pos, end: noun.pos };
    return {
      ok: true,
      value: [makeClause(id, 'tap', { objects: noun.value }, span)],
      pos: noun.pos,
    };
  },
});

/**
 * `effect.tap-up-to-x-scried`: "tap up to X target nonland permanents, where X is the number of cards looked at while scrying this way" (CR 603.3d, 701.22: the number is the cards
 * the player looked at as they scried, which the event of "whenever you scry" carries; the slot takes up to that many targets, chosen as the ability goes on the stack). The engine's
 * `tap` of a slot `upToTriggerAmount`. Read only after a scry trigger (the lowering refuses another place). Not read: another count, an owner ("you control"), "this way" for another
 * action, a number instead of X.
 */
export const EFFECT_TAP_UP_TO_X_SCRIED = defineRule<Clauses>({
  id: 'effect.tap-up-to-x-scried',
  family: 'effect',
  leading: ['tap'],
  cites: [
    'CR 603.3d (Handling Triggered Abilities)',
    'CR 701.22 (Scry)',
    'CR 701.26a (Tap and Untap)',
  ],
  examples: [
    'tap up to X target nonland permanents, where X is the number of cards looked at while scrying this way',
    'tap up to X target creatures, where X is the number of cards looked at while scrying this way',
    'Tap up to X target nonland permanents, where X is the number of cards looked at while scrying this way',
  ],
  rejects: [
    'tap up to X target nonland permanents',
    'tap up to X target nonland permanents, where X is the number of cards in your hand',
    'tap up to two target nonland permanents, where X is the number of cards looked at while scrying this way',
    'tap X target nonland permanents, where X is the number of cards looked at while scrying this way',
    'tap up to X target nonland permanent, where X is the number of cards looked at while scrying this way',
    'tap up to X target nonland permanents you control, where X is the number of cards looked at while scrying this way',
    'tap up to X target nonland permanents, where X is the number of cards looked at while surveilling this way',
    'untap up to X target nonland permanents, where X is the number of cards looked at while scrying this way',
    'tap up to X target nonland permanents, where X is the number of cards looked at while scrying this way and draw a card',
  ],
  parse: (ctx, pos) => {
    const id = 'effect.tap-up-to-x-scried';
    const r = sequence(
      literal('tap up to X target '),
      spanned(
        satisfy(
          map(permanentPhrase(true, 'all'), withoutZone),
          (filter: IrFilter) => filter.controller === undefined,
        ),
      ),
      pattern(
        new RegExp(
          `, where X is the number of cards looked at while scrying this way${BOUNDARY}`,
          'iu',
        ),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, phrase] = r.value;
    const noun: IrNoun = {
      kind: 'noun',
      det: 'target',
      filter: { ...phrase.value, zone: 'battlefield' },
      upTo: true,
      plural: true,
      other: false,
      upToTriggerAmount: true,
      span: phrase.span,
      rule: id,
    };
    const span = { start: pos, end: r.pos };
    if (/^\S/u.test(ctx.text.slice(r.pos)) && !/^[.,]/u.test(ctx.text.slice(r.pos))) {
      return fail(ctx, pos);
    }
    return { ok: true, value: [makeClause(id, 'tap', { objects: noun }, span)], pos: r.pos };
  },
});

export const HYLDA_G1_EFFECT_RULES = [EFFECT_TAP_PER_OPPONENT, EFFECT_TAP_UP_TO_X_SCRIED].map(
  quietly,
);
