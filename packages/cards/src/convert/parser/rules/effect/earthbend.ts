/**
 * Earthbend (Avatar: The Last Airbender keyword action; the rulings of 2025-10-02 are its source, the Comprehensive Rules text of the repository has no rule for it):
 * "Earthbend 2", "Earthbend X, where X is ...". The target is part of the keyword ("target land you control"), so the clause names none; the lowering declares it.
 * `effect.earthbend-additional` is the second sentence of Toph, Hardheaded Teacher: "If that spell is a Lesson, put an additional +1/+1 counter on that land."
 */
import { literal, sequence } from '../../combinators';
import type { IrAmount, IrNoun } from '../../ir/types';
import { defineRule, family } from '../registry';
import { type Clauses, makeClause, single } from './operands';

export const EFFECT_EARTHBEND = defineRule<Clauses>({
  id: 'effect.earthbend',
  family: 'effect',
  leading: ['earthbend'],
  cites: ['CR 608.2b (Resolving Spells and Abilities)', 'CR 122.6 (Counters)'],
  examples: ['earthbend 2', 'earthbend 1', 'earthbend X', 'Earthbend 4'],
  rejects: [
    'earthbend',
    'earthbend a',
    'earthbend 2 target land',
    'earthbend two lands',
    'earthbend 2 and draw a card',
    'earthbending 2',
  ],
  parse: (ctx, pos) => {
    const id = 'effect.earthbend';
    const r = sequence(
      literal('earthbend '),
      family<IrAmount>('amount', { only: ['amount.number', 'amount.x'] }),
    )(ctx, pos);
    if (!r.ok) return r;
    // The keyword names its target: "target land you control", a noun with no words of its own, so the binding pass gives it a slot like any target.
    const land: IrNoun = {
      kind: 'noun',
      det: 'target',
      filter: { types: ['land'], controller: 'you' },
      upTo: false,
      plural: false,
      other: false,
      span: { start: pos, end: pos },
      rule: id,
    };
    return {
      ok: true,
      value: [
        makeClause(
          id,
          'earthbend',
          { count: r.value[1], objects: land },
          { start: pos, end: r.pos },
        ),
      ],
      pos: r.pos,
    };
  },
});

export const EFFECT_EARTHBEND_ADDITIONAL = defineRule<Clauses>({
  id: 'effect.earthbend-additional',
  family: 'effect',
  leading: ['if'],
  cites: ['CR 122.6 (Counters)', 'CR 608.2c (Resolving Spells and Abilities)'],
  examples: ['if that spell is a Lesson, put an additional +1/+1 counter on that land'],
  rejects: [
    'if that spell is a Lesson, put an additional +1/+1 counter on that creature',
    'if that spell is a Lesson, put two additional +1/+1 counters on that land',
    'if that spell is a Lesson put an additional +1/+1 counter on that land',
    'if that spell is a Lesson, put an additional +1/+1 counter on that land and draw a card',
    'if that spell is a Goblin, put an additional +1/+1 counter on that land',
  ],
  parse: single(
    'effect.earthbend-additional',
    literal('if that spell is a Lesson, put an additional +1/+1 counter on that land'),
    () => ({ verb: 'earthbendAdditionalLesson', args: {} }),
  ),
});

export const EARTHBEND_RULES = [EFFECT_EARTHBEND, EFFECT_EARTHBEND_ADDITIONAL];
