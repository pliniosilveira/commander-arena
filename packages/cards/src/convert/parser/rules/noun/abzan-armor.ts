/**
 * Noun rules of the Abzan Armor deck: "target permanent you own" (Staff of Compleation).
 */
import { fail, pattern } from '../../combinators';
import type { IrNoun } from '../../ir/types';
import { defineRule, family } from '../registry';

const ID = 'noun.target-permanent-you-own';

/**
 * `noun.target-permanent-you-own`: "target permanent you own" (CR 108.3, 115.1: a target permanent whose owner, the player whose deck it started in or who created it as a token, is
 * the controller of the ability, whoever controls it now); the engine's `ownedByYou` (`selector:ownedByYou`). The words before " you own" are one `noun.target-permanent` that names
 * no controller. Not read: "up to", a count, "each", "you control" or another controller said before, "an opponent owns", "you don't own" and "you own" without a target.
 */
export const NOUN_TARGET_PERMANENT_YOU_OWN = defineRule<IrNoun>({
  id: ID,
  family: 'noun',
  leading: ['target', 'another'],
  cites: ['CR 108.3 (Owner)', 'CR 115.1 (Targets)'],
  examples: [
    'target permanent you own',
    'target nonland permanent you own',
    'target artifact you own',
    // Charming Prince (issue 590): "another" leaves the source out.
    'another target creature you own',
  ],
  rejects: [
    'target permanent you control',
    "target permanent you don't own",
    'target permanent an opponent owns',
    'target permanent you owned',
    'target permanent you own and control',
    'target permanent you control you own',
    'up to one target permanent you own',
    'two target permanents you own',
    'permanent you own',
    'each permanent you own',
    'another creature you own',
    'another target creature you control you own',
  ],
  parse: (ctx, pos) => {
    // Looked at first, so that a "target ..." without the words stops where it always did (the diagnostics of the rules that read it).
    const seen = pattern(/(?=(?:another )?target [^.,;:]*? you own(?![\p{L}\p{N}'’]))/iu)(ctx, pos);
    if (!seen.ok) return seen;
    const base = family<IrNoun>('noun', { only: ['noun.target-permanent'] })(ctx, pos);
    if (!base.ok) return base;
    const target = base.value;
    if (target.plural || target.upTo || target.count !== undefined) return fail(ctx, pos);
    if (target.filter.controller !== undefined || target.filter.player !== undefined) {
      return fail(ctx, pos);
    }
    const tail = pattern(/ you own(?![\p{L}\p{N}'’])/iu)(ctx, base.pos);
    if (!tail.ok) return fail(ctx, pos);
    const noun: IrNoun = {
      ...target,
      filter: {
        ...target.filter,
        ownedByYou: true,
        raw: ctx.text.slice(pos, tail.pos),
      },
      span: { start: pos, end: tail.pos },
      rule: ID,
    };
    return { ok: true, value: noun, pos: tail.pos };
  },
});

const DIFFERENT_ID = 'noun.up-to-targets-controlled-by-different-players';

/**
 * `noun.up-to-targets-controlled-by-different-players`: "up to two target artifacts and/or enchantments controlled by different players" (CR 115.1, 601.2c, 603.3d: at most that
 * many targets, no two of them controlled by the same player; the engine's `differentControllers` with a most). The words before " controlled by different players" are one
 * `noun.target-permanent` of "up to" a number of two or more; it names no controller of its own. Not read: no "up to", one target, "different opponents", "different owners", "each".
 */
export const NOUN_UP_TO_TARGETS_DIFFERENT_PLAYERS = defineRule<IrNoun>({
  id: DIFFERENT_ID,
  family: 'noun',
  leading: ['up'],
  cites: [
    'CR 115.1 (Targets)',
    'CR 601.2c (Casting Spells)',
    'CR 603.3d (Handling Triggered Abilities)',
  ],
  examples: [
    'up to two target artifacts and/or enchantments controlled by different players',
    'up to two target creatures controlled by different players',
    'up to three target nonland permanents controlled by different players',
  ],
  rejects: [
    'up to two target artifacts and/or enchantments',
    'two target creatures controlled by different players',
    'up to one target creature controlled by different players',
    'up to two target creatures controlled by different opponents',
    'up to two target creatures controlled by different owners',
    'up to two target creatures controlled by different players.',
    'up to two target creatures you control controlled by different players',
    'up to two target creatures an opponent controls controlled by different players',
    'up to two creatures controlled by different players',
    'each creature controlled by different players',
  ],
  parse: (ctx, pos) => {
    // Looked at first, so that an "up to ..." without the words stops where it always did.
    const seen = pattern(
      /(?=up to \w+ target [^.,;:]*? controlled by different players(?![\p{L}\p{N}'’]))/iu,
    )(ctx, pos);
    if (!seen.ok) return seen;
    const base = family<IrNoun>('noun', { only: ['noun.target-permanent'] })(ctx, pos);
    if (!base.ok) return base;
    const target = base.value;
    if (!target.upTo || target.count?.kind !== 'number' || target.count.value < 2) {
      return fail(ctx, pos);
    }
    if (target.filter.controller !== undefined || target.filter.player !== undefined) {
      return fail(ctx, pos);
    }
    const tail = pattern(/ controlled by different players(?![\p{L}\p{N}'’])/iu)(ctx, base.pos);
    if (!tail.ok) return fail(ctx, pos);
    const noun: IrNoun = {
      ...target,
      filter: { ...target.filter, raw: ctx.text.slice(pos, tail.pos) },
      differentControllers: true,
      span: { start: pos, end: tail.pos },
      rule: DIFFERENT_ID,
    };
    return { ok: true, value: noun, pos: tail.pos };
  },
});

export const ABZAN_ARMOR_NOUN_RULES = [
  NOUN_TARGET_PERMANENT_YOU_OWN,
  NOUN_UP_TO_TARGETS_DIFFERENT_PLAYERS,
];
