/**
 * Effect rule of Subterfuge: one object gains keywords and a triggered ability in the same sentence, for the turn.
 */
import { fail, literal, satisfy, sequence } from '../../combinators';
import type { IrClause, IrDuration, IrKeywordArg, IrNoun } from '../../ir/types';
import { KEYWORD_WORDS } from '../keyword/list';
import { defineRule, family, spanned } from '../registry';
import { readQuotedAbility } from '../static/quoted';
import { type Clauses, makeClause } from './operands';

/**
 * `effect.gain-keyword-and-ability`: "target creature gains flying and "Whenever ~ deals combat damage to a player, draw that many cards" until end of turn" (CR 611.2a: a continuous
 * effect of a resolving ability; CR 613.1f: it adds abilities; CR 514.2: it ends at the cleanup step). One chosen creature gets the keywords the engine can grant and the triggered
 * ability, which `~` of its own text means the creature itself. The same clauses as `effect.gain-keyword` (a keyword grant) and `effect.lead-granted-ability` (the ability grant), said
 * in one sentence with the duration at the end. Not read: a plural or another subject than one target creature, an activated ability, a pump, "until end of turn" missing or another duration,
 * the ability first, a keyword that has a parameter.
 */
export const EFFECT_GAIN_KEYWORD_AND_ABILITY = defineRule<Clauses>({
  id: 'effect.gain-keyword-and-ability',
  family: 'effect',
  leading: ['target'],
  cites: [
    'CR 611.2a (Continuous Effects)',
    'CR 613.1f (Interaction of Continuous Effects)',
    'CR 514.2 (Cleanup Step)',
  ],
  examples: [
    'target creature gains flying and "Whenever ~ deals combat damage to a player, draw that many cards" until end of turn',
    'target creature gains haste and first strike and "When ~ dies, draw a card" until end of turn',
  ],
  rejects: [
    'target creature gains flying and "Whenever ~ deals combat damage to a player, draw that many cards"',
    'target creature gains "Whenever ~ deals combat damage to a player, draw that many cards" until end of turn',
    'target creature gains flying and "{T}: Add {G}." until end of turn',
    'target creature gains flying until end of turn',
    'target creatures gain flying and "Whenever ~ deals combat damage to a player, draw that many cards" until end of turn',
    'target creature gets +1/+1 and gains flying and "Whenever ~ deals combat damage to a player, draw that many cards" until end of turn',
    'target creature gains "Whenever ~ deals combat damage to a player, draw that many cards" and flying until end of turn',
  ],
  parse: (ctx, pos) => {
    const id = 'effect.gain-keyword-and-ability';
    const subject = satisfy(
      family<IrNoun>('noun', { only: ['noun.target-permanent'] }),
      (n) =>
        n.det === 'target' &&
        !n.plural &&
        !n.upTo &&
        n.count === undefined &&
        n.filter.types?.includes('creature') === true,
    )(ctx, pos);
    if (!subject.ok) return subject;
    const grants = sequence(
      literal(' gains '),
      spanned(KEYWORD_WORDS),
      literal(' and '),
    )(ctx, subject.pos);
    if (!grants.ok) return grants;
    const [, keywords] = grants.value;
    const quoted = readQuotedAbility(ctx, grants.pos, { mana: false, unpunctuated: true });
    if (!quoted.ok) return quoted;
    if (quoted.value.ability.kind !== 'triggered') return fail(ctx, grants.pos);
    const space = literal(' ')(ctx, quoted.pos);
    if (!space.ok) return space;
    const duration = family<IrDuration>('duration')(ctx, space.pos);
    if (!duration.ok) return duration;
    if (duration.value.scope !== 'untilEndOfTurn') return fail(ctx, space.pos);
    const out: IrClause[] = keywords.value.map((name) => {
      const keyword: IrKeywordArg = { kind: 'keywordName', name, span: keywords.span, rule: id };
      return {
        ...makeClause(id, 'grantKeyword', { objects: subject.value, keyword }, keywords.span),
        duration: duration.value,
        connector: 'and' as const,
      };
    });
    out.push({
      ...makeClause(
        id,
        'grantAbility',
        { objects: subject.value, ability: quoted.value },
        quoted.value.span,
      ),
      duration: duration.value,
    });
    return { ok: true, value: out, pos: duration.pos };
  },
});

export const GAIN_KEYWORD_ABILITY_EFFECT_RULES = [EFFECT_GAIN_KEYWORD_AND_ABILITY];
