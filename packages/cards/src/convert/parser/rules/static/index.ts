/**
 * Static ability rules (CR 604): statements that are simply true while the permanent is on the
 * battlefield, as opposed to triggered and activated abilities. Only statements the engine
 * applies are read: "You have no maximum hand size.", what a permanent gives (grants.ts), the
 * restrictions of `~` (restrictions.ts), what a spell costs (cost.ts) and the play rules (play-rules.ts, stage P24:
 * additional land plays, the top card of the library, the cost of attacking, the optional untap).
 */

import { pattern } from '../../combinators';
import type { IrStatic } from '../../ir/types';
import { defineRule } from '../registry';
import { ADAMANTOISE_STATIC_RULES } from './adamantoise';
import { ANGEL_PROTECTION_RULES } from './angels';
import { ANGEL_PLAY_RULES } from './angels-play';
import { ARTIFACT_STATIC_RULES } from './artifacts';
import { CONDITIONAL_STATIC_RULES } from './conditional';
import { COST_STATIC_RULES } from './cost';
import { DINOSAUR_STATIC_RULES } from './dinosaurs';
import { DRAGON_STATIC_RULES } from './dragons';
import { EDHREC_STATIC_RULES } from './edhrec';
import { GRANT_STATIC_RULES } from './grants';
import { HASHATON_G2_STATIC_RULES } from './hashaton-group-2';
import { HOFRI_STATIC_RULES } from './hofri';
import { KORVOLD_STATIC_RULES } from './korvold';
import { MELD_STATIC_RULES } from './meld';
import { PLAY_RULE_STATIC_RULES } from './play-rules';
import { PT_COUNT_STATIC_RULES } from './pt-count';
import { RESTRICTION_STATIC_RULES } from './restrictions';
import { VRASKA_STATIC_RULES } from './vraska';

/**
 * `static.no-maximum-hand-size`: "You have no maximum hand size." (CR 402.2: a player's maximum
 * hand size is seven unless an effect says otherwise; CR 514.1: it is checked in the cleanup
 * step). Conditions ("as long as ...") and other subjects are not read.
 */
export const STATIC_NO_MAXIMUM_HAND_SIZE = defineRule<IrStatic>({
  id: 'static.no-maximum-hand-size',
  family: 'static',
  leading: ['you'],
  cites: ['CR 402.2 (Hand)', 'CR 514.1 (Cleanup Step)', 'CR 604.1 (Handling Static Abilities)'],
  examples: ['You have no maximum hand size.'],
  rejects: [
    'You have no maximum hand size',
    'You have no maximum hand size as long as you control a Dragon.',
    'Each opponent has no maximum hand size.',
    'You have no maximum hand size and you gain 1 life.',
    'Your maximum hand size is reduced by one.',
  ],
  parse: (ctx, pos) => {
    const r = pattern(/you have no maximum hand size\./i)(ctx, pos);
    if (!r.ok) return r;
    const span = { start: pos, end: r.pos };
    const subject = {
      kind: 'noun' as const,
      det: 'you' as const,
      filter: { raw: 'You' },
      upTo: false,
      plural: false,
      other: false,
      span: { start: pos, end: pos + 3 },
      rule: 'static.no-maximum-hand-size',
    };
    return {
      ok: true,
      value: {
        kind: 'static',
        subject,
        effects: [{ kind: 'noMaxHandSize' }],
        span,
        rule: 'static.no-maximum-hand-size',
      },
      pos: r.pos,
    };
  },
});

export const STATIC_RULES = [
  STATIC_NO_MAXIMUM_HAND_SIZE,
  ...GRANT_STATIC_RULES,
  ...PT_COUNT_STATIC_RULES,
  ...RESTRICTION_STATIC_RULES,
  ...PLAY_RULE_STATIC_RULES,
  ...COST_STATIC_RULES,
  ...CONDITIONAL_STATIC_RULES,
  // Stage P49 (D-206): "During your turn, equipped creature has flying."
  ...VRASKA_STATIC_RULES,
  // Stage P31 (D-140): flash for a kind of spell, what a linked exile gives, and "unless that player is the monarch".
  ...ARTIFACT_STATIC_RULES,
  // Stage P32 (D-147): can't attack or block unless, an Aura that makes the creature something else, +X/+X for the commanders.
  ...DINOSAUR_STATIC_RULES,
  // Stage P33 (D-150): protections of a player, damage prevented to ~, a card that can't be cast early, a tax on blocking, permanents that
  // enter with counters, an alternative cost that taps creatures.
  ...ANGEL_PROTECTION_RULES,
  ...ANGEL_PLAY_RULES,
  // Stage P34 (D-152): mana that stays through steps and phases, casting from the top of the library.
  ...DRAGON_STATIC_RULES,
  // Stage P37 (D-180): lands that enter untapped, opponents that can't cast spells during your turn.
  ...KORVOLD_STATIC_RULES,
  // Stage P70 (D-282): "Your opponents can't cast spells with mana value 3 or less."
  ...MELD_STATIC_RULES,
  // Stage P43 (D-193): all damage that would be dealt to you and other permanents you control dealt to ~ instead, damage that stays through cleanup steps.
  ...ADAMANTOISE_STATIC_RULES,
  // Stage P67 (D-220): "If a triggered ability of a Shaman or another Wizard you control triggers, that ability triggers an additional time."
  ...EDHREC_STATIC_RULES,
  // Stage P70 (D-232): "Once during each of your turns, you may play a land from your graveyard or cast ... from your graveyard."
  ...HOFRI_STATIC_RULES,
  // Hashaton deck, group 2 (D-363): "Your opponents can't gain life."
  ...HASHATON_G2_STATIC_RULES,
];
