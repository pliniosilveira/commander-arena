/**
 * Static abilities of `~` itself that say what it can't do or must do (stage P12, D-094, CR 604.1):
 * "~ can't block.", "~ can't be blocked.", "~ attacks each combat if able.", "~ doesn't untap
 * during your untap step." and, on a spell, "This spell can't be countered." (read as "~ can't be
 * countered.": the normalizer turns "this spell" into `~`). What an Aura or Equipment gives and what
 * a group has is read by `static.attached` and `static.permanents` with the same words.
 */
import { pattern } from '../../combinators';
import type { IrStatic } from '../../ir/types';
import { defineRule } from '../registry';
import { statement } from './grants';

/**
 * `static.self`: one or more restrictions of `~`, joined by " and " ("~ can't block and can't be
 * blocked."). "Can't be countered" is a spell's own ability (CR 113.6g: it works on the stack, CR
 * 101.2 a "can't" effect wins). Since stage P29 "can't be blocked by more than one creature", and since stage P31 "can't be
 * blocked by Walls" and "can't be blocked by creatures with power 2 or less" (CR 509.1b). Not read: exceptions ("can't be blocked
 * except by creatures with flying", "can't block unless ..."), "can't attack", "can't attack or block", "may choose not to untap",
 * and other subjects ("Spells you control can't be countered").
 */
export const STATIC_SELF = defineRule<IrStatic>({
  id: 'static.self',
  family: 'static',
  leading: ['~'],
  cites: [
    'CR 509.1b (Declare Blockers Step)',
    'CR 508.1d (Declare Attackers Step)',
    'CR 502.3 (Untap Step)',
    'CR 101.2 (Golden Rules)',
    'CR 113.6g (Abilities That Function in Zones Other Than the Battlefield)',
    'CR 604.1 (Handling Static Abilities)',
  ],
  examples: [
    '~ can’t block.',
    "~ can't block.",
    "~ can't be blocked.",
    '~ attacks each combat if able.',
    "~ doesn't untap during your untap step.",
    "~ can't be countered.",
    "~ can't block and can't be blocked.",
    "~ attacks each combat if able and can't block.",
    "~ can't be countered and can't block.",
    "~ can't be blocked by more than one creature.",
    "~ can't block and can't be blocked by more than one creature.",
    "~ can't be blocked by creatures with power 2 or less.",
    "~ can't be blocked by Walls.",
  ],
  rejects: [
    "~ can't block",
    "~ can't blocks.",
    "~ can't be blocked except by creatures with flying.",
    "~ can't block unless you control a Plains.",
    "~ can't block creatures with flying.",
    "~ can't block and can't block.",
    "~ can't attack.",
    "~ can't attack or block.",
    '~ attack each combat if able.',
    '~ attacks each turn if able.',
    "~ doesn't untap during its controller's untap step.",
    "~ doesn't untap during each other player's untap step.",
    "~ don't untap during your untap step.",
    "~ can't be countered by blue spells.",
    "~ can't be countered or blocked.",
    "Spells you control can't be countered.",
    "Creature spells you control can't be countered.",
    "~ can't be blocked this turn.",
  ],
  parse: statement('static.self', ['noun.self'], 'self'),
});

/**
 * `static.self-chosen-type`: "~ is the chosen type in addition to its other types." (CR 205.1b, 613.1d,
 * 607.2d: the permanent has the creature type its own "As ~ enters, choose a creature type" chose, as
 * well as its own; D-100). Only the permanent itself: "each creature you control is the chosen type"
 * and "becomes the chosen type" are other effects, and the engine runs neither.
 */
export const STATIC_SELF_CHOSEN_TYPE = defineRule<IrStatic>({
  id: 'static.self-chosen-type',
  family: 'static',
  leading: ['~'],
  cites: [
    'CR 205.1b (Card Types)',
    'CR 613.1d (Interaction of Continuous Effects)',
    'CR 607.2d (Linked Abilities)',
  ],
  examples: ['~ is the chosen type in addition to its other types.'],
  rejects: [
    '~ is the chosen type in addition to its other types',
    '~ is the chosen type.',
    '~ is the chosen color in addition to its other colors.',
    '~ is every creature type.',
    'Creatures you control are the chosen type in addition to their other types.',
    '~ is a Zombie in addition to its other types.',
    '~ is the chosen type in addition to its other types until end of turn.',
  ],
  parse: (ctx, pos) => {
    const r = pattern(/~ is the chosen type in addition to its other types\./i)(ctx, pos);
    if (!r.ok) return r;
    const id = 'static.self-chosen-type';
    const subject = {
      kind: 'noun' as const,
      det: 'self' as const,
      filter: { raw: '~' },
      upTo: false,
      plural: false,
      other: false,
      span: { start: pos, end: pos + 1 },
      rule: id,
    };
    return {
      ok: true,
      value: {
        kind: 'static',
        subject,
        effects: [{ kind: 'chosenType' }],
        span: { start: pos, end: r.pos },
        rule: id,
      },
      pos: r.pos,
    };
  },
});

export const RESTRICTION_STATIC_RULES = [STATIC_SELF, STATIC_SELF_CHOSEN_TYPE];
