/**
 * Trigger rule of Exert (CR 701.43): "You may exert ~ as it attacks. When you do, ..." (the real text of Glorybringer, golden corpus, acceptance card of issue 103). The
 * paragraph is one triggered ability whose trigger is the first sentence, "you may exert ~ as it attacks", and whose body follows "When you do," (the segmenter splits it,
 * `EXERT_LEAD`). The lowering makes of it the two abilities of CR 701.43d and 607.2h: the static ability that offers the optional cost of attacking (`exertOnAttack`)
 * and the triggered ability linked to it (`exerted`).
 */
import { literal, map, pattern, sequence } from '../../combinators';
import type { IrTrigger } from '../../ir/types';
import { defineRule, spanned } from '../registry';
import { makeNoun } from './subjects';

/**
 * `trigger.exerted`: "you may exert ~ as it attacks" (CR 701.43d: "You may exert [this creature] as it attacks" is an optional cost to attack, and the "When you do"
 * ability printed with it is linked to it). The creature is the one with the ability: only "~" (or "this creature") is read, not another creature ("you may exert
 * target creature" is another action) and not "exert" with a different condition.
 */
export const TRIGGER_EXERTED = defineRule<IrTrigger>({
  id: 'trigger.exerted',
  family: 'trigger',
  leading: ['you'],
  cites: [
    'CR 701.43a (Exert)',
    'CR 701.43d (Exert)',
    'CR 508.1g (Declare Attackers Step)',
    'CR 607.2h (Linked Abilities)',
    'CR 603.12 (Reflexive Triggered Abilities)',
  ],
  examples: ['you may exert ~ as it attacks', 'you may exert this creature as it attacks'],
  rejects: [
    'you may exert ~',
    'you may exert ~ as it blocks',
    'you may exert ~ as it attacks.',
    'you may exert another creature as it attacks',
    'you may exert target creature as it attacks',
    'you may exert ~ as it attacks or blocks',
    'you exert ~ as it attacks',
    'an opponent may exert ~ as it attacks',
    'you may exert it as it attacks',
    'you may exert ~ as it attacked',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      literal('you may exert '),
      spanned(map(pattern(/(?:~|this creature)(?![\p{L}\p{N}])/iu), (m) => m[0].toLowerCase())),
      pattern(/ as it attacks(?![\p{L}\p{N}.])/iu),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, creature] = r.value;
    const subject = makeNoun('trigger.exerted', creature.span, 'self', { raw: creature.value });
    return {
      ok: true,
      value: {
        kind: 'trigger',
        event: 'exerted',
        subject,
        args: {},
        span: { start: pos, end: r.pos },
        rule: 'trigger.exerted',
      },
      pos: r.pos,
    };
  },
});

export const EXERT_TRIGGER_RULES = [TRIGGER_EXERTED];
