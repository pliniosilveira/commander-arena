/**
 * Effect rule of issue 89 (Silverquill Influence, D-599): "Until end of turn, creatures your opponents control lose hexproof and shroud and can't have hexproof or shroud."
 */
import { fail, literal, pattern, sequence } from '../../combinators';
import type { IrDuration, IrNoun } from '../../ir/types';
import { defineRule, family, spanned } from '../registry';
import { type Clauses, single } from './operands';

/**
 * `effect.lose-hexproof-shroud`: "until end of turn, creatures your opponents control lose hexproof and shroud and can't have hexproof or shroud" (CR 702.11b,
 * 702.18a, 611.2c, 613.1f, D-599): the creatures the words name as the effect begins lose the two abilities and can't have them again for the turn. The group is
 * "creatures" and who controls them, nothing else (the engine's `loseHexproofShroud` reads a group of creatures as the effect resolves). Both keywords, in this order,
 * and both again in the second half: another list of abilities is another effect.
 */
export const EFFECT_LOSE_HEXPROOF_SHROUD = defineRule<Clauses>({
  id: 'effect.lose-hexproof-shroud',
  family: 'effect',
  leading: ['until'],
  cites: [
    'CR 702.11b (Hexproof)',
    'CR 702.18a (Shroud)',
    'CR 611.2c (Continuous Effects)',
    'CR 613.1f (Interaction of Continuous Effects)',
  ],
  examples: [
    "until end of turn, creatures your opponents control lose hexproof and shroud and can't have hexproof or shroud",
    "Until end of turn, creatures your opponents control lose hexproof and shroud and can't have hexproof or shroud",
    "until end of turn, creatures you control lose hexproof and shroud and can't have hexproof or shroud",
  ],
  rejects: [
    "until end of turn, creatures your opponents control lose hexproof and shroud and can't have hexproof",
    "until end of turn, creatures your opponents control lose hexproof and can't have hexproof or shroud",
    "until end of turn, creatures your opponents control lose hexproof and shroud and can't have shroud or hexproof",
    'until end of turn, creatures your opponents control lose hexproof and shroud',
    "until end of turn, creatures your opponents control lose hexproof and shroud and can't have hexproof or shroud and draw a card",
    "until your next turn, creatures your opponents control lose hexproof and shroud and can't have hexproof or shroud",
    "creatures your opponents control lose hexproof and shroud and can't have hexproof or shroud",
    "until end of turn, creature your opponents control loses hexproof and shroud and can't have hexproof or shroud",
    "until end of turn, target creature loses hexproof and shroud and can't have hexproof or shroud",
    "until end of turn, other creatures your opponents control lose hexproof and shroud and can't have hexproof or shroud",
    "until end of turn, artifacts your opponents control lose hexproof and shroud and can't have hexproof or shroud",
    "until end of turn, creatures lose hexproof and shroud and can't have hexproof or shroud",
  ],
  parse: single(
    'effect.lose-hexproof-shroud',
    (ctx, pos) => {
      const lead = spanned(pattern(/until end of turn, /iu))(ctx, pos);
      if (!lead.ok) return lead;
      const subject = family<IrNoun>('noun', { only: ['noun.plain-permanents'] })(ctx, lead.pos);
      if (!subject.ok) return subject;
      const noun = subject.value;
      const f = noun.filter;
      const onlyCreatures =
        noun.plural &&
        noun.det === 'each' &&
        !noun.other &&
        f.anyOf === undefined &&
        f.subtypes === undefined &&
        f.types?.length === 1 &&
        f.types[0] === 'creature' &&
        (f.controller === 'opponent' || f.controller === 'you');
      if (!onlyCreatures) return fail(ctx, lead.pos);
      const words = spanned(
        sequence(
          literal(' lose hexproof and shroud and '),
          literal("can't have hexproof or shroud"),
        ),
      )(ctx, subject.pos);
      if (!words.ok) return words;
      return {
        ok: true,
        value: { noun, span: { start: pos, end: words.pos } },
        pos: words.pos,
      };
    },
    ({ noun, span }) => {
      const duration: IrDuration = {
        kind: 'duration',
        scope: 'untilEndOfTurn',
        span,
        rule: 'effect.lose-hexproof-shroud',
      };
      return { verb: 'loseHexproofShroud', args: { objects: noun }, duration };
    },
  ),
});

export const HEXPROOF_LOSS_EFFECT_RULES = [EFFECT_LOSE_HEXPROOF_SHROUD];
