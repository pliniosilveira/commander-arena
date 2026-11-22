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
import { ABZAN_ARMOR_STATIC_RULES } from './abzan-armor';
import { ADAMANTOISE_STATIC_RULES } from './adamantoise';
import { ANGEL_PROTECTION_RULES } from './angels';
import { ANGEL_PLAY_RULES } from './angels-play';
import { ARTIFACT_STATIC_RULES } from './artifacts';
import { BESTOW_PT_STATIC_RULES } from './bestow-pt';
import { BLOCK_POWER_STATIC_RULES } from './block-power';
import { CANT_BE_SACRIFICED_STATIC_RULES } from './cant-be-sacrificed';
import { CONDITIONAL_STATIC_RULES } from './conditional';
import { COST_STATIC_RULES } from './cost';
import { DANITHA_G3_STATIC_RULES } from './danitha-g3';
import { DEATH_TOLL_C_STATIC_RULES } from './death-toll-c';
import { DINOSAUR_STATIC_RULES } from './dinosaurs';
import { DRAGON_STATIC_RULES } from './dragons';
import { EACH_SPELL_COST_STATIC_RULES } from './each-spell-cost';
import { EDHREC_STATIC_RULES } from './edhrec';
import { EMINENCE_STATIC_RULES } from './eminence';
import { ETERNAL_MIGHT_STATIC_RULES } from './eternal-might';
import { F144_STATIC_RULES } from './f144';
import { GALADRIEL_G3_STATIC_RULES } from './galadriel-g3';
import { GISA_G4_STATIC_RULES } from './gisa-g4';
import { GRANT_STATIC_RULES } from './grants';
import { HASHATON_G2_STATIC_RULES } from './hashaton-group-2';
import { HASHATON_G3_STATIC_RULES } from './hashaton-group-3';
import { HASHATON_G6_STATIC_RULES } from './hashaton-group-6';
import { HOFRI_STATIC_RULES } from './hofri';
import { JESKAI_FLASHBACK_STATIC_RULES } from './jeskai-flashback';
import { KORVOLD_STATIC_RULES } from './korvold';
import { MELD_STATIC_RULES } from './meld';
import { OMNATH_STATIC_RULES } from './omnath';
import { PERMANENT_ABILITY_COST_STATIC_RULES } from './permanent-ability-cost';
import { PLAY_RULE_STATIC_RULES } from './play-rules';
import { PRISMARI_G1_STATIC_RULES } from './prismari-g1';
import { PT_COUNT_STATIC_RULES } from './pt-count';
import { PT_COUNTERS_ON_SOURCE_STATIC_RULES } from './pt-counters-on-source';
import { RESTRICTION_STATIC_RULES } from './restrictions';
import { SHALAI_STATIC_RULES } from './shalai';
import { SKYBONDER_STATIC_RULES } from './skybonder';
import { SLIVER_LORDS_STATIC_RULES } from './sliver-lords';
import { SPELL_KEYWORD_GRANT_STATIC_RULES } from './spell-keyword-grant';
import { VRASKA_STATIC_RULES } from './vraska';
import { WORLD_RULES_STATIC_RULES } from './world-rules';

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
  // Death Toll deck, group C (Grist, the Hunger Tide): "As long as ~ isn't on the battlefield, it's a 1/1 Insect creature ...", before the plain "as long as" statements.
  ...DEATH_TOLL_C_STATIC_RULES,
  // Issue 104 (Eternal Might deck): "Creatures you control are every creature type. ...", whose first words are those of `static.permanents`.
  ...ETERNAL_MIGHT_STATIC_RULES,
  ...JESKAI_FLASHBACK_STATIC_RULES,
  ...GRANT_STATIC_RULES,
  ...PT_COUNT_STATIC_RULES,
  // Call for Unity: "Creatures you control get +1/+1 for each unity counter on ~."
  ...PT_COUNTERS_ON_SOURCE_STATIC_RULES,
  // CR 702.103: "~ and enchanted creature each get +1/+1 for each creature you control ..." (a bestow card).
  ...BESTOW_PT_STATIC_RULES,
  ...RESTRICTION_STATIC_RULES,
  ...PLAY_RULE_STATIC_RULES,
  ...COST_STATIC_RULES,
  ...EMINENCE_STATIC_RULES,
  ...EACH_SPELL_COST_STATIC_RULES,
  ...CONDITIONAL_STATIC_RULES,
  // Stage P49 (D-206): "During your turn, equipped creature has flying."
  ...VRASKA_STATIC_RULES,
  // Stage P31 (D-140): flash for a kind of spell, what a linked exile gives, and "unless that player is the monarch".
  ...ARTIFACT_STATIC_RULES,
  // Issue 144 (Conspicuous Snoop): "As long as the top card of your library is a Goblin card, ~ has all activated abilities of that card."
  ...F144_STATIC_RULES,
  // Stage P32 (D-147): can't attack or block unless, an Aura that makes the creature something else, +X/+X for the commanders.
  ...DINOSAUR_STATIC_RULES,
  // Issue 160 (D-628): "Creatures with power less than ~'s power can't block creatures you control."
  ...BLOCK_POWER_STATIC_RULES,
  // Abzan Armor deck: "Creatures your opponents control without flying or reach can't block creatures with power 2 or less."
  ...ABZAN_ARMOR_STATIC_RULES,
  // Stage P33 (D-150): protections of a player, damage prevented to ~, a card that can't be cast early, a tax on blocking, permanents that
  // enter with counters, an alternative cost that taps creatures.
  ...ANGEL_PROTECTION_RULES,
  ...ANGEL_PLAY_RULES,
  // Stage P34 (D-152): mana that stays through steps and phases, casting from the top of the library.
  ...DRAGON_STATIC_RULES,
  // Stage P37 (D-180): lands that enter untapped, opponents that can't cast spells during your turn.
  ...KORVOLD_STATIC_RULES,
  ...OMNATH_STATIC_RULES,
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
  // Everlasting Torment: "Players can't gain life.", "Damage can't be prevented.", "All damage is dealt as though its source had wither."
  ...WORLD_RULES_STATIC_RULES,
  // Hashaton deck, group 6 (D-377): "You and creatures you control have protection from the chosen card type."
  ...HASHATON_G6_STATIC_RULES,
  ...SHALAI_STATIC_RULES,
  // Hashaton deck, group 3 (D-380): "Creatures you control can't have -1/-1 counters put on them."
  ...HASHATON_G3_STATIC_RULES,
  ...CANT_BE_SACRIFICED_STATIC_RULES,
  // Issue 26 (the Danitha deck, D-428): "Equip abilities you activate that target enchanted creature cost {3} less to activate."
  ...DANITHA_G3_STATIC_RULES,
  // Issue 41 (the Gisa deck, D-461): "Activated abilities of creature cards in your graveyard cost {1} less to activate."
  ...GISA_G4_STATIC_RULES,
  // Food and Fellowship deck, group B (Sam): "Activated abilities of Foods you control cost {1} less to activate."
  ...PERMANENT_ABILITY_COST_STATIC_RULES,
  // Prismari deck, group 1 (D-641): "~ costs {2}{R} more to cast for each target beyond the first.".
  ...PRISMARI_G1_STATIC_RULES,
  // First Flight deck (D-149): "Spells your opponents cast that target ~ cost {2} more to cast."
  ...SKYBONDER_STATIC_RULES,
  // Galadriel deck, group 3 (issue 43): "~ saddles Mounts and crews Vehicles as though its power were 2 greater."
  ...GALADRIEL_G3_STATIC_RULES,
  // Issue 145 (Hatsune Miku deck): "Creature spells you cast have demonstrate."
  ...SPELL_KEYWORD_GRANT_STATIC_RULES,
  // Issue 133 (the Sliver Swarm deck, group B): the legend rule that does not apply, a chosen type for groups, Encore for the cards of a graveyard.
  ...SLIVER_LORDS_STATIC_RULES,
];
