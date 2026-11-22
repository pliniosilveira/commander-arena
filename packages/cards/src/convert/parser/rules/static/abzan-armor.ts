/**
 * Static rule of the Abzan Armor deck: "Creatures your opponents control without flying or reach can't block creatures with power 2 or less." (Sidar Kondo of Jamuraa).
 */
import { pattern } from '../../combinators';
import type { IrNoun, IrStatic } from '../../ir/types';
import { defineRule, quietly } from '../registry';

const ID = 'static.creatures-without-keywords-cant-block-low-power';

/**
 * `static.creatures-without-keywords-cant-block-low-power`: "Creatures your opponents control without flying or reach can't block creatures with power 2 or less." (CR 509.1b, 208.1,
 * 702.9 (Flying), 702.17 (Reach): a restriction on blocking, read as blockers are declared; it holds whoever attacks, so the attackers are every creature whose power is that low, not
 * only the controller's). The engine's `cantBeBlockedBy` of the creatures with power at most N, the blockers being the creatures of the opponents of the controller that have neither
 * keyword. Not read: another controller, another pair of keywords, a power of "or greater", "can't block" alone, "creatures you control".
 */
export const STATIC_WITHOUT_KEYWORDS_CANT_BLOCK_LOW_POWER = defineRule<IrStatic>({
  id: ID,
  family: 'static',
  leading: ['creatures'],
  cites: [
    'CR 509.1b (Declare Blockers Step)',
    'CR 208.1 (Power/Toughness)',
    'CR 613.11 (Interaction of Continuous Effects)',
  ],
  examples: [
    "Creatures your opponents control without flying or reach can't block creatures with power 2 or less.",
    'Creatures your opponents control without flying or reach can’t block creatures with power 3 or less.',
  ],
  rejects: [
    "Creatures your opponents control without flying or reach can't block creatures with power 2 or less",
    "Creatures your opponents control without flying or reach can't block creatures with power 2 or greater.",
    "Creatures your opponents control without flying or reach can't block creatures.",
    "Creatures you control without flying or reach can't block creatures with power 2 or less.",
    "Creatures your opponents control without flying can't block creatures with power 2 or less.",
    "Creatures your opponents control without flying or trample can't block creatures with power 2 or less.",
    "Creatures your opponents control with flying or reach can't block creatures with power 2 or less.",
    "Creatures your opponents control without flying or reach can't block creatures with power 2 or less and draw a card.",
    "Other creatures your opponents control without flying or reach can't block creatures with power 2 or less.",
  ],
  parse: (ctx, pos) => {
    const r = pattern(
      /creatures your opponents control without flying or reach can['’]t block creatures with power (\d+) or less\./iu,
    )(ctx, pos);
    if (!r.ok) return r;
    const value = Number(r.value[1]);
    const span = { start: pos, end: r.pos };
    const attackers: IrNoun = {
      kind: 'noun',
      det: 'each',
      filter: {
        types: ['creature'],
        power: { cmp: 'atMost', value },
        raw: `creatures with power ${value} or less`,
      },
      upTo: false,
      plural: true,
      other: false,
      span,
      rule: ID,
    };
    return {
      ok: true,
      value: {
        kind: 'static',
        subject: attackers,
        effects: [
          {
            kind: 'cantBeBlockedBy',
            blockers: {
              types: ['creature'],
              controller: 'opponent',
              notKeywords: ['flying', 'reach'],
              raw: 'creatures your opponents control without flying or reach',
            },
          },
        ],
        span,
        rule: ID,
      },
      pos: r.pos,
    };
  },
});

export const ABZAN_ARMOR_STATIC_RULES = [STATIC_WITHOUT_KEYWORDS_CANT_BLOCK_LOW_POWER].map(quietly);
