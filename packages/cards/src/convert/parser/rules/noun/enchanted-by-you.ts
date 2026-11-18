/**
 * "Each creature that's enchanted by an Aura you control" (Eriette of the Charmed Apple, D-597, CR 303.4e: the Aura's controller is separate from the enchanted permanent's
 * controller): the creatures that have an Aura attached to them that the controller of the ability controls. The engine's `ObjectFilter.enchantedByYou`, read as the group
 * changes (CR 611.3a).
 */
import { literal, pattern, sequence } from '../../combinators';
import type { IrNoun } from '../../ir/types';
import { defineRule } from '../registry';
import { BOUNDARY } from './phrases';

export const NOUN_EACH_CREATURE_ENCHANTED_BY_YOU = defineRule<IrNoun>({
  id: 'noun.each-creature-enchanted-by-you',
  family: 'noun',
  leading: ['each'],
  cites: ['CR 303.4e (Auras)', 'CR 611.3a (Continuous Effects)'],
  examples: ["each creature that's enchanted by an Aura you control"],
  rejects: [
    "each creature that's enchanted by an Aura",
    "each creature that's enchanted by an Aura your opponents control",
    "each creature that's enchanted",
    "each creature that's enchanted by Auras you control",
    "each creatures that's enchanted by an Aura you control",
    "each permanent that's enchanted by an Aura you control",
    'all creatures that are enchanted by an Aura you control',
    "each creature that's enchanted by an Aura you control or",
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      literal('each creature'),
      pattern(new RegExp(`\\s+that['’]s enchanted by an Aura you control${BOUNDARY}`, 'iu')),
    )(ctx, pos);
    if (!r.ok) return r;
    const noun: IrNoun = {
      kind: 'noun',
      det: 'each',
      filter: {
        types: ['creature'],
        enchantedByYou: true,
        raw: ctx.text.slice(pos, r.pos),
      },
      upTo: false,
      plural: false,
      other: false,
      span: { start: pos, end: r.pos },
      rule: 'noun.each-creature-enchanted-by-you',
    };
    return { ok: true, value: noun, pos: r.pos };
  },
});

export const ENCHANTED_BY_YOU_NOUN_RULES = [NOUN_EACH_CREATURE_ENCHANTED_BY_YOU];
