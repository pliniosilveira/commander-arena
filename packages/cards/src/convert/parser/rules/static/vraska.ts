/**
 * Static rules of the Vraska deck (stage P49, D-206): "During your turn, equipped creature has flying." (Dragoon's Lance).
 */
import { fail, literal } from '../../combinators';
import type { IrStatic } from '../../ir/types';
import { defineRule, family } from '../registry';
import { statement } from './grants';

/**
 * `static.during-your-turn`: "During your turn, equipped creature has flying." (CR 611.3a, 613.8: the effect applies only while it is your turn, which is
 * looked at all the time and which no layer changes). The statement after the comma is one of an attached permanent (`static.attached`: "equipped
 * creature gets +1/+0 and has flying"), so the condition is that of the whole statement. Not read: another turn ("during an opponent's turn"), a
 * condition after the statement ("equipped creature has flying during your turn"), a subject that is not the attached permanent, `~`, a group of permanents (`static.permanents`, Gourmand's Talent) or "each creature" (`static.each`, Baldin: "During your turn,
 * each creature assigns combat damage equal to its toughness rather than its power.").
 */
export const STATIC_DURING_YOUR_TURN = defineRule<IrStatic>({
  id: 'static.during-your-turn',
  family: 'static',
  leading: ['during'],
  cites: ['CR 611.3a (Continuous Effects)', 'CR 613.8 (Interaction of Continuous Effects)'],
  examples: [
    'During your turn, equipped creature has flying.',
    'During your turn, equipped creature gets +1/+0 and has first strike.',
    // Issue 345 (Radha, Heart of Keld): the permanent itself.
    'During your turn, ~ has first strike.',
    // CR 510.1a, 609.4 (Baldin, Century Herdmaster): each creature, whoever controls it, while it is your turn.
    'During your turn, each creature assigns combat damage equal to its toughness rather than its power.',
    'During your turn, each creature you control gets +1/+0.',
    // Flint deck (issue 685, At Knifepoint): a group of permanents, while it is your turn.
    'During your turn, creatures you control have flying.',
    'During your turn, outlaws you control have first strike.',
    // Gourmand's Talent (CR 611.3a, 613.1d, 613.1f): a statement about a group of permanents, with its types or abilities.
    'During your turn, artifacts you control are Foods in addition to their other types.',
    'During your turn, artifacts you control are Foods in addition to their other types and have "{2}, {T}, Sacrifice this artifact: You gain 3 life."',
    // Bello, Bard of the Brambles (CR 613.6): a group that is creatures of a stated size as well, with what they have.
    'During your turn, each non-Equipment artifact and non-Aura enchantment you control with mana value 4 or greater is a 4/4 Elemental creature in addition to its other types and has indestructible, haste, and "Whenever ~ deals combat damage to a player, draw a card."',
  ],
  rejects: [
    'During your turn, equipped creature has flying',
    "During an opponent's turn, equipped creature has flying.",
    'During your turn equipped creature has flying.',
    'During your turn, creatures you control have flying',
    'During your turn, each creature assigns combat damage equal to its toughness rather than its power',
    'During your turn, each creature assign combat damage equal to its toughness rather than its power.',
    'During your turn, ~ has banana.',
    'During your turn, draw a card.',
    'During your turn, equipped creature has banana.',
    'During your turn, each artifact you control is a 4/4 Elemental creature.',
  ],
  parse: (ctx, pos) => {
    const lead = literal('during your turn, ')(ctx, pos);
    if (!lead.ok) return lead;
    // Issue 345 (Radha, Heart of Keld, CR 611.3a): "During your turn, ~ has first strike.": the permanent itself, what it gets or has.
    const own = statement('static.during-your-turn', ['noun.self'], 'selfGrant')(ctx, lead.pos);
    const inner = own.ok
      ? own
      : family<IrStatic>('static', {
          only: [
            'static.attached',
            // Issue 110 (Bello, Bard of the Brambles): "During your turn, each ... is a 4/4 Elemental creature in addition to its other types and has ...".
            'static.each-is-creature',
            'static.each',
            'static.permanents',
          ],
        })(ctx, lead.pos);
    if (!inner.ok) return inner;
    if (inner.value.condition !== undefined) return fail(ctx, pos);
    return {
      ok: true,
      value: {
        ...inner.value,
        condition: {
          kind: 'condition',
          test: { kind: 'yourTurn' },
          span: { start: pos, end: lead.pos },
          rule: 'static.during-your-turn',
        },
        span: { start: pos, end: inner.pos },
        rule: 'static.during-your-turn',
      },
      pos: inner.pos,
    };
  },
});

export const VRASKA_STATIC_RULES = [STATIC_DURING_YOUR_TURN];
