/**
 * Condition of the Sauron deck (Uglúk of the White Hand): "that creature was a Goblin or Orc" (CR 205.3m creature types, 603.10a, 608.2c, 113.7a): what an object the event of a
 * trigger is about was, as it last was, said as one of two creature types.
 */
import { fail, literal, pattern, sequence } from '../../combinators';
import type { IrCondition, IrFilter, IrNoun } from '../../ir/types';
import { CREATURE_TYPES } from '../noun/creature-types';
import { BOUNDARY } from '../noun/phrases';
import { SUBTYPE_WORD_NUMBERED } from '../noun/subtypes';
import { defineRule, spanned } from '../registry';

/**
 * `condition.that-was-either`: "that creature was a Goblin or Orc", "that creature was a Goblin or an Orc", "it was an Elf or Wizard" (CR 205.3m): a creature type, "or", and a second
 * one, each said in the singular, of "it" or of "that" and a noun. The engine's `objectMatches` with an `anyOf` of the two types (the same object test as `condition.it-matches` reads
 * for one type). Not read: no article, a plural, a third type, "and", a word that is no creature type, the same type twice, a card type, "or" with nothing after it.
 */
export const CONDITION_THAT_WAS_EITHER = defineRule<IrCondition>({
  id: 'condition.that-was-either',
  family: 'condition',
  leading: ['it', 'that'],
  cites: [
    'CR 205.3m (Subtypes)',
    'CR 603.10a (Handling Triggered Abilities)',
    'CR 608.2c (Resolving Spells and Abilities)',
    'CR 113.7a (Abilities)',
  ],
  examples: [
    'that creature was a Goblin or Orc',
    'that creature was a Goblin or an Orc',
    'it was an Elf or Wizard',
    'that creature was a Zombie or Skeleton',
  ],
  rejects: [
    'that creature was a Goblin',
    'that creature was Goblin or Orc',
    'that creature was a Goblin and Orc',
    'that creature was a Goblins or Orcs',
    'that creature was a Goblin, Orc or Elf',
    'that creature was a Goblin or Goblin',
    'that creature was a Goblin or Banana',
    'that creature was a Goblin or creature',
    'that creature was a Goblin or',
    'it was a Goblin or Orc card',
  ],
  parse: (ctx, pos) => {
    const lead = spanned(pattern(/(it was|that [a-z]+ was) an? /iu))(ctx, pos);
    if (!lead.ok) return lead;
    const r = sequence(
      SUBTYPE_WORD_NUMBERED,
      literal(' or '),
      pattern(/(?:an? )?/iu),
      SUBTYPE_WORD_NUMBERED,
      pattern(new RegExp(BOUNDARY, 'iu')),
    )(ctx, lead.pos);
    if (!r.ok) return r;
    const [first, , , second] = r.value;
    const kinds = [first, second];
    if (
      first.subtype === second.subtype ||
      kinds.some((w) => w.plural === true || !CREATURE_TYPES.has(w.subtype))
    ) {
      return fail(ctx, pos);
    }
    const words = (lead.value.value[1] ?? 'it').replace(/ was$/iu, '').toLowerCase();
    const it: IrNoun = {
      kind: 'noun',
      det: 'anaphor',
      filter: { raw: words },
      upTo: false,
      plural: false,
      other: false,
      span: { start: pos, end: pos + words.length },
      rule: 'condition.that-was-either',
    };
    const raw = ctx.text.slice(lead.pos, r.pos);
    const filter: IrFilter = {
      raw,
      anyOf: kinds.map((w): IrFilter => ({ subtypes: [w.subtype], raw: w.subtype })),
    };
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: { kind: 'objectMatches', who: it, filter },
        span: { start: pos, end: r.pos },
        rule: 'condition.that-was-either',
      },
      pos: r.pos,
    };
  },
});

export const THAT_WAS_EITHER_CONDITION_RULES = [CONDITION_THAT_WAS_EITHER];
