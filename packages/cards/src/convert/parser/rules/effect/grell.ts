/**
 * Effect rule of Grell Philosopher (Mind Flayarrrs deck, group 7): a group of permanents gains the activated abilities of a target permanent for the turn, with the rider that
 * blue mana may pay for them as though it were mana of any color.
 */
import { fail, literal, optional, pattern, satisfy, sequence } from '../../combinators';
import type { IrDuration, IrNoun } from '../../ir/types';
import { defineRule, family } from '../registry';
import { flag } from './dragons';
import { type Clauses, makeClause } from './operands';

const RIDER =
  /\. You may spend blue mana as though it were mana of any color to activate those abilities(?![\p{L}\p{N}])/iu;

/**
 * `effect.gain-abilities-of-target`: "each Horror you control gains all activated abilities of target artifact an opponent controls until end of turn. You may spend blue mana as
 * though it were mana of any color to activate those abilities." (CR 611.2a, 611.2c, 613.1f, 609.4b, 602.2b): the group the words name as the effect resolves has, until the
 * end of the turn, every activated and mana ability the target has as the effect resolves; blue mana pays any color of the activation costs of those abilities. The engine's
 * `gainActivatedAbilitiesOf` of a group with a target. Not read: the rider alone, another rider, another duration, a plural target, a target with no "target" in it, "all
 * abilities", and a subject that is not "each ...".
 */
export const EFFECT_GAIN_ABILITIES_OF_TARGET = defineRule<Clauses>({
  id: 'effect.gain-abilities-of-target',
  family: 'effect',
  leading: ['each'],
  cites: [
    'CR 611.2a (Continuous Effects)',
    'CR 611.2c (Continuous Effects)',
    'CR 613.1f (Interaction of Continuous Effects)',
    'CR 609.4b (Replacement Effects)',
    'CR 602.2b (Activating Activated Abilities)',
  ],
  examples: [
    'each Horror you control gains all activated abilities of target artifact an opponent controls until end of turn',
    'each Horror you control gains all activated abilities of target artifact an opponent controls until end of turn. You may spend blue mana as though it were mana of any color to activate those abilities',
  ],
  rejects: [
    'each Horror you control gains all activated abilities of target artifact an opponent controls',
    'each Horror you control gains all activated abilities of target artifact an opponent controls until your next turn',
    'each Horror you control gains all activated abilities of target artifact an opponent controls until end of turn. You may spend red mana as though it were mana of any color to activate those abilities',
    'each Horror you control gain all activated abilities of target artifact an opponent controls until end of turn',
    'each Horror you control gains all abilities of target artifact an opponent controls until end of turn',
    'each Horror you control gains all activated abilities of that artifact until end of turn',
    'each Horror you control gains all activated abilities of target artifacts you control until end of turn',
    'target Horror gains all activated abilities of target artifact an opponent controls until end of turn',
  ],
  parse: (ctx, pos) => {
    const id = 'effect.gain-abilities-of-target';
    const subject = family<IrNoun>('noun', { only: ['noun.each-permanent'] })(ctx, pos);
    if (!subject.ok) return subject;
    const verb = literal(' gains all activated abilities of ')(ctx, subject.pos);
    if (!verb.ok) return verb;
    const from = satisfy(
      family<IrNoun>('noun', { only: ['noun.target-permanent'] }),
      (n) => n.det === 'target' && !n.plural && !n.upTo && n.count === undefined,
    )(ctx, verb.pos);
    if (!from.ok) return from;
    const dur = sequence(literal(' '), family<IrDuration>('duration'))(ctx, from.pos);
    if (!dur.ok) return dur;
    const [, duration] = dur.value;
    if (duration.scope !== 'untilEndOfTurn') return fail(ctx, from.pos);
    const rider = optional(pattern(RIDER), null)(ctx, dur.pos);
    if (!rider.ok) return rider;
    const span = { start: pos, end: rider.pos };
    const clause = makeClause(
      id,
      'gainActivatedAbilities',
      {
        objects: subject.value,
        from: from.value,
        ...(rider.value === null ? {} : { blueAsAnyColor: flag(id, true, span) }),
      },
      span,
    );
    return { ok: true, value: [{ ...clause, duration }], pos: rider.pos };
  },
});

export const GRELL_EFFECT_RULES = [EFFECT_GAIN_ABILITIES_OF_TARGET];
