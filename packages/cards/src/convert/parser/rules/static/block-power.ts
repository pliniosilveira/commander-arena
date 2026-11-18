/**
 * Static rule of issue 160 (D-628): "Creatures with power less than ~'s power can't block creatures you control." (Champion of Lambholt, CR 509.1b, 208.1). The engine's
 * `cantBeBlockedBy` of the creatures its controller controls, the blockers being the creatures whose power is less than the power of the permanent with the ability, as it
 * is now (`powerLessThanSource`).
 */
import { fail, literal, pattern, sequence } from '../../combinators';
import type { IrNoun, IrStatic } from '../../ir/types';
import { defineRule, family, quietly } from '../registry';

const ID = 'static.creatures-with-less-power-cant-block';

export const STATIC_LESS_POWER_CANT_BLOCK = defineRule<IrStatic>({
  id: ID,
  family: 'static',
  leading: ['creatures'],
  cites: [
    'CR 509.1b (Declare Blockers Step)',
    'CR 208.1 (Power/Toughness)',
    'CR 613.11 (Interaction of Continuous Effects)',
  ],
  examples: [
    "Creatures with power less than ~'s power can't block creatures you control.",
    "Creatures with power less than this creature's power can't block creatures you control.",
  ],
  rejects: [
    "Creatures with power less than ~'s power can't block creatures you control",
    "Creatures with power less than ~'s power can't block.",
    "Creatures with power less than ~'s power can't attack creatures you control.",
    "Creatures with power less than ~'s power can't block creatures.",
    "Creatures with power less than 3 can't block creatures you control.",
    "Creatures with power greater than ~'s power can't block creatures you control.",
    "Other creatures with power less than ~'s power can't block creatures you control.",
    "Creatures with power less than ~'s power can't block creatures you control and draw a card.",
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      pattern(/creatures with power less than (?:~|this creature)['’]s power can['’]t block /iu),
      family<IrNoun>('noun', { only: ['noun.plain-permanents'] }),
      literal('.'),
    )(ctx, pos);
    if (!r.ok) return r;
    const subject = r.value[1];
    // Only the creatures the controller controls: the plain permanent phrase says "you control".
    if (subject.filter.controller !== 'you') return fail(ctx, pos);
    return {
      ok: true,
      value: {
        kind: 'static',
        subject,
        effects: [
          {
            kind: 'cantBeBlockedBy',
            blockers: {
              types: ['creature'],
              powerLessThanSource: true,
              raw: ctx.text.slice(pos, r.value[0].length + pos).replace(/ can['’]t block $/iu, ''),
            },
          },
        ],
        span: { start: pos, end: r.pos },
        rule: ID,
      },
      pos: r.pos,
    };
  },
});

export const BLOCK_POWER_STATIC_RULES = [STATIC_LESS_POWER_CANT_BLOCK].map(quietly);
