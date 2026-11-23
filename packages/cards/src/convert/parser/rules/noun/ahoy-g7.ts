/**
 * Noun rule of the Ahoy Mateys deck, group 7: "target nonland permanent controlled by a player who was dealt combat damage by three or more Pirates this turn" (Admiral Beckett Brass).
 */
import { fail, pattern, sequence } from '../../combinators';
import type { IrNoun } from '../../ir/types';
import { defineRule, family } from '../registry';
import { CREATURE_TYPES } from './creature-types';
import { SUBTYPE_WORD_NUMBERED } from './subtypes';

const ID = 'noun.target-permanent-controller-dealt-damage-by';

const COUNT_WORDS: Readonly<Record<string, number>> = {
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
};

/**
 * `noun.target-permanent-controller-dealt-damage-by`: "target nonland permanent controlled by a player who was dealt combat damage by three or more Pirates this turn" (CR 510.2,
 * 120.2a, 115.1: a target whose controller must be a player that, this turn, was dealt combat damage by at least that many different creatures of the creature type, read from what
 * each was as it dealt the damage). The words before "controlled by" are one `noun.target-permanent`; the engine's `controllerDealtCombatDamageByAtLeast` (`selector:controllerDealtCombatDamageByAtLeast`).
 * Not read: "up to", a count of one or none ("a Pirate"), a number that is not 2 to 8 in words, a type that is no creature type or is singular, "each", another controller said in the
 * words before, "combat damage" without "dealt", another span than "this turn".
 */
export const NOUN_TARGET_PERMANENT_CONTROLLER_DEALT_DAMAGE_BY = defineRule<IrNoun>({
  id: ID,
  family: 'noun',
  leading: ['target'],
  cites: [
    'CR 510.2 (Combat Damage Step)',
    'CR 120.2a (Damage)',
    'CR 115.1 (Targets)',
    'CR 205.3m (Subtypes)',
  ],
  examples: [
    'target nonland permanent controlled by a player who was dealt combat damage by three or more Pirates this turn',
    'target creature controlled by a player who was dealt combat damage by two or more Zombies this turn',
  ],
  rejects: [
    'target nonland permanent controlled by a player who was dealt combat damage by one or more Pirates this turn',
    'target nonland permanent controlled by a player who was dealt combat damage by three or more Pirate this turn',
    'target nonland permanent controlled by a player who was dealt combat damage by three or more Bananas this turn',
    'target nonland permanent controlled by a player who was dealt combat damage by three or more pirates this turn',
    'target nonland permanent controlled by a player who was dealt combat damage by three or more Pirates',
    'target nonland permanent controlled by a player who was dealt combat damage by three Pirates this turn',
    'target nonland permanent controlled by a player who was dealt damage by three or more Pirates this turn',
    'target nonland permanent controlled by a player who was dealt combat damage by three or more Pirates this combat',
    'target nonland permanent an opponent controls controlled by a player who was dealt combat damage by three or more Pirates this turn',
    'up to one target nonland permanent controlled by a player who was dealt combat damage by three or more Pirates this turn',
    'each nonland permanent controlled by a player who was dealt combat damage by three or more Pirates this turn',
  ],
  parse: (ctx, pos) => {
    const base = family<IrNoun>('noun', { only: ['noun.target-permanent'] })(ctx, pos);
    if (!base.ok) return base;
    const target = base.value;
    if (target.plural || target.upTo || target.count !== undefined) return fail(ctx, pos);
    if (target.filter.controller !== undefined || target.filter.player !== undefined) {
      return fail(ctx, pos);
    }
    const r = sequence(
      pattern(
        /[ ]controlled by a player who was dealt combat damage by (two|three|four|five|six|seven|eight) or more /iu,
      ),
      SUBTYPE_WORD_NUMBERED,
      pattern(/ this turn(?![\p{L}\p{N}])/iu),
    )(ctx, base.pos);
    if (!r.ok) return fail(ctx, pos);
    const [head, word] = r.value;
    const atLeast = COUNT_WORDS[(head[1] ?? '').toLowerCase()];
    if (atLeast === undefined || word.plural !== true || !CREATURE_TYPES.has(word.subtype)) {
      return fail(ctx, pos);
    }
    // The type is written with its capital, as the creature types are.
    if (!/^[A-Z]/u.test(ctx.text.slice(base.pos + (head[0]?.length ?? 0)))) return fail(ctx, pos);
    const noun: IrNoun = {
      ...target,
      filter: {
        ...target.filter,
        controllerDealtCombatDamageBy: { atLeast, subtype: word.subtype },
        raw: ctx.text.slice(pos, r.pos),
      },
      span: { start: pos, end: r.pos },
      rule: ID,
    };
    return { ok: true, value: noun, pos: r.pos };
  },
});

export const AHOY_G7_NOUN_RULES = [NOUN_TARGET_PERMANENT_CONTROLLER_DEALT_DAMAGE_BY];
