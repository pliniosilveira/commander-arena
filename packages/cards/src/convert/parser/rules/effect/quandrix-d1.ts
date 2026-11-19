/**
 * "Auras, Equipment, and modified creatures you control gain hexproof until end of turn." (Silkguard, CR 702.11 Hexproof, 700.9 Modified, 611.2c, 613.1f): a keyword
 * granted to a group fixed as the effect resolves, the group being `noun.auras-equipment-modified`.
 */
import { defineRule } from '../registry';
import { gainParser } from './gain';
import type { Clauses } from './operands';
import { QUANDRIX_D1_TOKEN_RULES } from './quandrix-d1-tokens';

export const EFFECT_GAIN_KEYWORD_AURAS_EQUIPMENT_MODIFIED = defineRule<Clauses>({
  id: 'effect.gain-keyword-auras-equipment-modified',
  family: 'effect',
  leading: ['auras'],
  cites: [
    'CR 700.9 (Modified)',
    'CR 611.2a (Continuous Effects)',
    'CR 611.2c (Continuous Effects)',
    'CR 613.1f (Interaction of Continuous Effects)',
  ],
  examples: [
    'Auras, Equipment, and modified creatures you control gain hexproof until end of turn',
    'Auras, Equipment, and modified creatures you control gain hexproof and indestructible until end of turn',
  ],
  rejects: [
    'Auras, Equipment, and modified creatures you control gains hexproof until end of turn',
    'Auras, Equipment, and modified creatures you control gain hexproof',
    'Auras, Equipment, and modified creatures you control gain hexproof until your next turn',
    'Auras, Equipment, and modified creatures you control get +1/+1 until end of turn',
  ],
  parse: gainParser(
    'effect.gain-keyword-auras-equipment-modified',
    ['noun.auras-equipment-modified'],
    true,
  ),
});

export const QUANDRIX_D1_EFFECT_RULES = [
  EFFECT_GAIN_KEYWORD_AURAS_EQUIPMENT_MODIFIED,
  ...QUANDRIX_D1_TOKEN_RULES,
];
