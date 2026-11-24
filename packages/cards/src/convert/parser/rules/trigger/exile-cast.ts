/**
 * Trigger rules of the Exit from Exile deck: "you cast a spell from exile" (CR 601.2a, 601.2i, 406.1).
 */
import { fail, pattern, satisfy, sequence } from '../../combinators';
import type { IrTrigger } from '../../ir/types';
import { defineRule, family, spanned } from '../registry';

const NOT_IN_WORD = '(?![\\p{L}\\p{N}])';

/**
 * `trigger.cast-from-exile`: "you cast a spell from exile" (CR 601.2a: the spell is cast from where the card was; CR 601.2i: the ability triggers as the spell becomes cast). The spell
 * `trigger.cast` reads, and "from exile" (the engine's `castFromExile`). Not read: another zone, another caster than you, "from exile" with nothing before it, a second event after "or".
 */
export const TRIGGER_CAST_FROM_EXILE = defineRule<IrTrigger>({
  id: 'trigger.cast-from-exile',
  family: 'trigger',
  leading: ['you'],
  cites: [
    'CR 601.2a (Casting Spells)',
    'CR 601.2i (Casting Spells)',
    'CR 603.2 (Handling Triggered Abilities)',
  ],
  examples: [
    'you cast a spell from exile',
    'you cast a creature spell from exile',
    'you cast an instant or sorcery spell from exile',
  ],
  rejects: [
    'you cast a spell from your hand',
    'you cast a spell from a graveyard',
    'you cast a spell',
    'you cast a spell from exile or',
    'you cast a spell from exile or a land you control enters from exile',
    'an opponent casts a spell from exile',
    'a player casts a spell from exile',
    'you cast from exile',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      satisfy(
        family<IrTrigger>('trigger', { only: ['trigger.cast'] }),
        (t) => t.actor?.det === 'you',
      ),
      spanned(pattern(new RegExp(` from exile${NOT_IN_WORD}(?! or\\b)`, 'iu'))),
    )(ctx, pos);
    if (!r.ok) return r;
    const [cast, tail] = r.value;
    const subject = cast.subject;
    if (subject === undefined) return fail(ctx, pos);
    return {
      ok: true,
      value: {
        ...cast,
        span: { start: pos, end: tail.span.end },
        rule: 'trigger.cast-from-exile',
        subject: { ...subject, filter: { ...subject.filter, castFromExile: true } },
      },
      pos: r.pos,
    };
  },
});

export const EXILE_CAST_TRIGGER_RULES = [TRIGGER_CAST_FROM_EXILE];
