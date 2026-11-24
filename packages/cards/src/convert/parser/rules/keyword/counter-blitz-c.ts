/**
 * Keyword rule of group C of the Counter Blitz deck: "Escalate—Tap an untapped creature you control." (Collective Effort).
 */
import { literal, map, optional, satisfy, sequence } from '../../combinators';
import type { IrCost, IrKeyword } from '../../ir/types';
import { defineRule, family, node } from '../registry';

/**
 * `keyword.escalate-tap`: "Escalate—Tap an untapped creature you control." (CR 702.120a: "Escalate [cost]" means "As an additional cost to cast this spell, you may pay [cost] any number of times
 * as you choose modes; CR 118.3: tapping permanents is a cost, CR 302.6: only a creature's own {T} ability is held back by summoning sickness). The cost is paid once for each mode chosen beyond the
 * first, as the spell is cast; the engine's `escalate` keyword with a `tapPermanents` cost. The line stands alone, ends in a period as a keyword of an action does, and its reminder text is dropped
 * before the line is read. Not read: a mana cost (`keyword.escalate`), another cost, "another", a count of two or more, "untapped" missing, a controller other than "you control", "Escalate" in a list.
 */
export const KEYWORD_ESCALATE_TAP = defineRule<readonly IrKeyword[]>({
  id: 'keyword.escalate-tap',
  family: 'keyword',
  leading: [],
  cites: [
    'CR 702.120a (Escalate)',
    'CR 601.2f (Casting Spells)',
    'CR 118.3 (Costs)',
    'CR 302.6 (Summoning Sickness)',
  ],
  examples: [
    'Escalate—Tap an untapped creature you control.',
    'Escalate—Tap an untapped creature you control',
    'escalate—tap an untapped creature you control.',
    'Escalate—Tap an untapped artifact you control.',
  ],
  rejects: [
    'Escalate',
    'Escalate {G}',
    'Escalate—Discard a card.',
    'Escalate—Pay 3 life.',
    'Escalate—Tap an untapped creature.',
    'Escalate—Tap another untapped creature you control.',
    'Escalate—Tap two untapped creatures you control.',
    'Escalate—Tap a creature you control.',
    'Escalate—Tap an untapped creature you control. Flying',
    'Escalate—Tap an untapped creature you control, flying',
    'Escalate — Tap an untapped creature you control.',
    'Flying, escalate—tap an untapped creature you control.',
    'Echo—Tap an untapped creature you control.',
  ],
  parse: map(
    node<readonly IrCost[], IrKeyword>(
      'keyword.escalate-tap',
      map(
        sequence(
          literal('escalate—'),
          // One creature, not "another" (the engine taps `count` untapped permanents for each mode).
          satisfy(
            family<IrCost>('cost', { only: ['cost.tap-permanents'] }),
            (cost) => cost.kind === 'tapPermanents' && cost.count === 1 && !cost.what.other,
          ),
          optional(literal('.'), null),
        ),
        ([, cost]): readonly IrCost[] => [cost],
      ),
      (cost) => ({ kind: 'keyword', name: 'escalate', params: [], cost }),
    ),
    (keyword): readonly IrKeyword[] => [keyword],
  ),
});

export const COUNTER_BLITZ_C_KEYWORD_RULES = [KEYWORD_ESCALATE_TAP];
