/**
 * `effect.attach`: "attach ~ to target creature you control", "attach it to target creature you
 * control" (CR 701.3: to attach an Aura or Equipment to an object means to take it from where it is
 * and put it onto that object). The object attached is `~` or the pronoun the binding pass reads as
 * `~` (the Equipment that just entered); the destination is a target chosen as the ability goes on
 * the stack (CR 603.3d, 115.1). Moving an Equipment onto a creature it cannot be attached to does
 * nothing (CR 701.3b). Since stage P48 (D-205) the destination may also be "it": the token the same sentence made ("When ~ enters, create a 2/2
 * red Dwarf creature token, then attach ~ to it", CR 111.2, 400.7j), which the binding pass finds as the token of the clause before it and the
 * lowering reads as the engine's `moved`; where nothing made a token, "it" is an unbound reference and the line is not read.
 */
import { choice, literal, map, pattern, refuseAt, sequence } from '../../combinators';
import type { IrNoun } from '../../ir/types';
import { BOUNDARY } from '../noun/phrases';
import { defineRule, family, spanned } from '../registry';
import { type Clauses, single } from './operands';

/** "it" as the token the sentence made: an anaphor the binding pass resolves to the token as it does "that token". */
const IT_AS_TOKEN = map(
  spanned(pattern(new RegExp(`it${BOUNDARY}`, 'iu'))),
  ({ span }): IrNoun => ({
    kind: 'noun',
    det: 'anaphor',
    filter: { raw: 'that token' },
    upTo: false,
    plural: false,
    other: false,
    span,
    rule: 'effect.attach',
  }),
);

export const EFFECT_ATTACH = defineRule<Clauses>({
  id: 'effect.attach',
  family: 'effect',
  leading: ['attach'],
  cites: [
    'CR 701.3 (Attach)',
    'CR 701.3b (Attach)',
    'CR 301.5 (Artifacts)',
    'CR 603.3d (Handling Triggered Abilities)',
  ],
  examples: [
    'attach ~ to target creature you control',
    'attach it to target creature you control',
    'attach ~ to target legendary creature you control',
    'attach ~ to target creature',
    'attach ~ to it',
    // D-406 (CR 303.4j): the permanent a trigger is about.
    'attach ~ to that creature',
    'attach ~ to that permanent',
  ],
  rejects: [
    'attach ~ to ~',
    'attach ~',
    'attach target Equipment to target creature',
    'attach ~ to each creature you control',
    'attach ~ to two target creatures',
    'attach all Equipment you control to target creature',
    'attach ~ to target creature you control or',
    'attach ~ to its',
    'attach ~ to them',
    'attach ~ to itself',
    'attach ~ to that creature card',
    'attach ~ to that creatures',
    'attach ~ to those creatures',
  ],
  parse: single(
    'effect.attach',
    sequence(
      literal('attach '),
      family<IrNoun>('noun', { only: ['noun.self', 'noun.it'] }),
      literal(' to '),
      // One object: an Equipment moves to one creature.
      choice(
        refuseAt(
          family<IrNoun>('noun', { only: ['noun.target-permanent'] }),
          (n) => !n.plural,
          (_n, _ctx, start) => start,
        ),
        // D-406: "attach ~ to that creature": the object an earlier part of the text named, which the binding pass makes the permanent the trigger is about.
        family<IrNoun>('noun', { only: ['noun.that-object'] }),
        IT_AS_TOKEN,
      ),
    ),
    ([, object, , to]) => ({ verb: 'attach', args: { object, to } }),
  ),
});

export const ATTACH_RULES = [EFFECT_ATTACH];
