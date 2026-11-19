/**
 * "Auras, Equipment, and modified creatures you control" (Silkguard, CR 700.9 Modified, 303.4 Auras, 301.5 Equipment, 611.2c): the permanents its controller controls that
 * are an Aura, an Equipment or a modified creature, fixed as the effect resolves. The engine's `each` selector over a choice (`anyOf`) of the Aura subtype, the Equipment
 * subtype and a creature that is `modified`, all of them permanents "you control" (the outer filter's controller).
 */
import { pattern } from '../../combinators';
import type { IrNoun } from '../../ir/types';
import { defineRule } from '../registry';
import { BOUNDARY } from './phrases';

export const NOUN_AURAS_EQUIPMENT_MODIFIED = defineRule<IrNoun>({
  id: 'noun.auras-equipment-modified',
  family: 'noun',
  leading: ['auras'],
  cites: ['CR 700.9 (Modified)', 'CR 611.2c (Continuous Effects)'],
  examples: ['Auras, Equipment, and modified creatures you control'],
  rejects: [
    'Auras, Equipment, and modified creatures',
    'Auras, Equipment and modified creatures you control',
    'Auras and modified creatures you control',
    'Equipment, Auras, and modified creatures you control',
    'Auras, Equipment, and modified creatures your opponents control',
    'Auras, Equipment, and creatures you control',
  ],
  parse: (ctx, pos) => {
    const r = pattern(
      new RegExp(`auras, equipment, and modified creatures you control${BOUNDARY}`, 'iu'),
    )(ctx, pos);
    if (!r.ok) return r;
    const noun: IrNoun = {
      kind: 'noun',
      det: 'each',
      filter: {
        zone: 'battlefield',
        controller: 'you',
        anyOf: [
          { subtypes: ['Aura'], raw: 'Auras' },
          { subtypes: ['Equipment'], raw: 'Equipment' },
          { types: ['creature'], modified: true, raw: 'modified creatures' },
        ],
        raw: r.value[0],
      },
      upTo: false,
      plural: true,
      other: false,
      span: { start: pos, end: r.pos },
      rule: 'noun.auras-equipment-modified',
    };
    return { ok: true, value: noun, pos: r.pos };
  },
});

export const QUANDRIX_D1_NOUN_RULES = [NOUN_AURAS_EQUIPMENT_MODIFIED];
