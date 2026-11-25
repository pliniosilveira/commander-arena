/**
 * Noun rule of Breaking of the Fellowship (Sauron deck): "another target creature that player controls" after a target noun (CR 115.1, 115.3, 109.4).
 */
import { fail, literal, pattern, sequence } from '../../combinators';
import type { IrNoun } from '../../ir/types';
import { defineRule, spanned } from '../registry';
import { BOUNDARY, permanentPhrase } from './phrases';

const ID = 'noun.another-target-of-same-controller';

/**
 * `noun.another-target-of-same-controller`: "another target creature that player controls" (CR 115.1, 115.3, 109.4): one target that is not the target of the slot before it and
 * is controlled by the same player as that target ("that player" is the player who controls it). The engine's `TargetSpec.differentFrom` and `sameControllerAs` of the slot before;
 * a text with no target before it is not run. Not read: no "another", "other", a plural, "up to", a controller said twice, "that opponent controls", "that player's", "target creature
 * that player" and any target that is not a permanent.
 */
export const NOUN_ANOTHER_TARGET_OF_SAME_CONTROLLER = defineRule<IrNoun>({
  id: ID,
  family: 'noun',
  leading: ['another'],
  cites: [
    'CR 115.1 (Targets)',
    'CR 115.3 (Targets)',
    'CR 109.4 (Objects)',
    'CR 608.2b (Resolving Spells and Abilities)',
  ],
  examples: [
    'another target creature that player controls',
    'another target nonland permanent that player controls',
    'another target artifact that player controls',
  ],
  rejects: [
    'target creature that player controls',
    'another target creature',
    'another target creatures that player controls',
    'another creature that player controls',
    'another target creature you control that player controls',
    'another target creature an opponent controls that player controls',
    'another target creature that opponent controls',
    'another target creature that players control',
    'another target creature that player',
    "another target creature that player's",
    'another target card that player controls',
    'up to one another target creature that player controls',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      literal('another target '),
      permanentPhrase(false, 'all'),
      spanned(pattern(new RegExp(` that player controls${BOUNDARY}`, 'iu'))),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, filter] = r.value;
    if (filter.controller !== undefined) return fail(ctx, pos);
    const noun: IrNoun = {
      kind: 'noun',
      det: 'target',
      filter: { ...filter, raw: ctx.text.slice(pos, r.pos) },
      upTo: false,
      plural: false,
      other: false,
      otherTarget: true,
      sameControllerAsPrevious: true,
      span: { start: pos, end: r.pos },
      rule: ID,
    };
    return { ok: true, value: noun, pos: r.pos };
  },
});

/** Before `noun.target-permanent`, whose "another target creature" is the first words of this phrase. */
export const SAME_CONTROLLER_TARGET_NOUN_RULES = [NOUN_ANOTHER_TARGET_OF_SAME_CONTROLLER];
