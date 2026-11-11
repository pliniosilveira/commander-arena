/**
 * The keyword line Escalate (stage P32; D-145, D-147, CR 702.120): "Escalate {G}". The reminder text in parentheses is dropped before
 * the line is read. The cost is paid once for each mode chosen beyond the first (CR 601.2f), which the engine adds as the spell is cast;
 * it is a plain mana cost (the only cost the engine pays for it). The line stands alone, never in a keyword list, and goes with a modal
 * spell that says "Choose one or more" (`validateCard` checks the face).
 */
import type { IrKeyword } from '../../ir/types';
import { defineRule } from '../registry';
import { upkeepKeyword } from './upkeep';

/** `keyword.escalate`: "Escalate {G}" (CR 702.120a). */
export const KEYWORD_ESCALATE = defineRule<readonly IrKeyword[]>({
  id: 'keyword.escalate',
  family: 'keyword',
  leading: ['escalate'],
  cites: ['CR 702.120a (Escalate)', 'CR 601.2f (Casting Spells)'],
  examples: ['Escalate {G}', 'Escalate {1}', 'Escalate {2}{R}', 'escalate {W}'],
  rejects: [
    'Escalate',
    'Escalate {X}',
    'Escalate {W/U}',
    'Escalate—Discard a card.',
    'Escalate—Pay 3 life.',
    'Escalate {G}.',
    'Escalate {G}, flying',
    'Escalate {G} {1}',
    'Escalate {G}, escalate {1}',
    'Escalates {G}',
    'Flying, escalate {G}',
    'Echo {G}',
  ],
  parse: upkeepKeyword('keyword.escalate', 'escalate', 'escalate'),
});

export const ESCALATE_KEYWORD_RULES = [KEYWORD_ESCALATE];
