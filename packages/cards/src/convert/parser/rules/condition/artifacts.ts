/**
 * Conditions of stage P31 (D-139, D-140): "you control the artifact with the greatest mana value or tied for the greatest mana value"
 * (CR 603.4, 202.3, 208.1): among every permanent of the kind on the battlefield, whoever controls it, the one or ones with the greatest
 * value of the stat; the condition holds when the player controls one of them. Only the wording that says the tie counts is read.
 */
import { fail, map, pattern, satisfy, sequence } from '../../combinators';
import type { IrCondition, IrNoun } from '../../ir/types';
import { permanentPhrase, withoutZone } from '../noun/phrases';
import { defineRule } from '../registry';

const STATS: Readonly<Record<string, 'power' | 'toughness' | 'manaValue'>> = {
  power: 'power',
  toughness: 'toughness',
  'mana value': 'manaValue',
};

/**
 * `condition.control-greatest`: "you control the artifact with the greatest mana value or tied for the greatest mana value", "you
 * control the creature with the greatest power or tied for the greatest power" (CR 603.4: an intervening "if"; CR 202.3 mana value; CR
 * 208.1 power and toughness). The stat is said twice and must be the same; the kind of permanent names no controller.
 */
export const CONDITION_CONTROL_GREATEST = defineRule<IrCondition>({
  id: 'condition.control-greatest',
  family: 'condition',
  leading: ['you'],
  cites: [
    'CR 603.4 (Handling Triggered Abilities)',
    'CR 202.3 (Mana Value)',
    'CR 208.1 (Power/Toughness)',
  ],
  examples: [
    'you control the artifact with the greatest mana value or tied for the greatest mana value',
    'you control the creature with the greatest power or tied for the greatest power',
    'you control the creature with the greatest toughness or tied for the greatest toughness',
  ],
  rejects: [
    'you control the artifact with the greatest mana value',
    'you control the creature with the greatest power or tied for the greatest toughness',
    'you control the artifact you control with the greatest mana value or tied for the greatest mana value',
    'you control the artifacts with the greatest mana value or tied for the greatest mana value',
    'you control the creature with the least power or tied for the least power',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      pattern(/you control the /iu),
      satisfy(
        map(permanentPhrase(false, 'all'), withoutZone),
        (filter) => filter.controller === undefined && filter.power === undefined,
      ),
      pattern(
        / with the greatest (power|toughness|mana value) or tied for the greatest (power|toughness|mana value)(?![\p{L}\p{N}])/iu,
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, filter, words] = r.value;
    const first = (words[1] ?? '').toLowerCase();
    const second = (words[2] ?? '').toLowerCase();
    const stat = STATS[first];
    if (stat === undefined || first !== second) return fail(ctx, pos);
    const span = { start: pos, end: r.pos };
    const noun: IrNoun = {
      kind: 'noun',
      det: 'a',
      filter,
      upTo: false,
      plural: false,
      other: false,
      span,
      rule: 'condition.control-greatest',
    };
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: { kind: 'controlsGreatest', noun, stat },
        span,
        rule: 'condition.control-greatest',
      },
      pos: r.pos,
    };
  },
});

export const ARTIFACT_CONDITION_RULES = [CONDITION_CONTROL_GREATEST];
