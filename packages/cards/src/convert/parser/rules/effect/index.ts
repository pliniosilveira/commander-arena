/**
 * Effect rules: one instruction of a spell or ability, as IR clauses (CR 608.2 resolving
 * spells and abilities). Each rule reads one verb phrase; sentences and joins are structure and
 * live in ../../sentence.ts. A rule may yield several clauses when one phrase is several
 * instructions ("Target player draws two cards and loses 2 life" is two clauses, one subject).
 *
 * Ids lose the S1 `spell.` prefix (D-062) because the same verbs serve spells and the bodies of
 * abilities (proposal 3.2).
 */
import {
  choice,
  fail,
  literal,
  map,
  optional,
  type Parser,
  pattern,
  quiet,
  satisfy,
  sequence,
} from '../../combinators';
import type { IrArg, IrCost, IrNoun, IrNounList, IrZoneSpec, Span } from '../../ir/types';
import { FOR_EACH_TAIL, scaled } from '../amount/scaled';
import { defineRule, family, spanned } from '../registry';
import { ABZAN_SPELLS_EFFECT_RULES } from './abzan-spells';
import { ADAPT_EFFECT_RULES } from './adapt';
import { ADDITIONAL_LAND_EFFECT_RULES } from './additional-land';
import { AHOY_G1B_EFFECT_RULES } from './ahoy-g1b';
import { AHOY_G2_EFFECT_RULES } from './ahoy-g2';
import { AHOY_G3_EFFECT_RULES } from './ahoy-g3';
import { AHOY_G7_EFFECT_RULES } from './ahoy-g7';
import { AHOY_G8_EFFECT_RULES } from './ahoy-g8';
import { AHOY_G10_EFFECT_RULES } from './ahoy-g10';
import { ANGEL_EFFECT_RULES, UNTIL_SOURCE_LEAVES } from './angels';
import { ARCANUM_EFFECT_RULES } from './arcanum';
import { ARDEN_EFFECT_RULES } from './arden';
import { ARTIFACT_EFFECT_RULES } from './artifacts';
import { ATTACH_RULES } from './attach';
import { AURA_GRAVEYARD_EFFECT_RULES } from './aura-graveyard';
import { BECOMES_RULES } from './becomes';
import { BITE_RULES, DAMAGE_AMOUNT } from './bite';
import { BLACK_GATE_EFFECT_RULES } from './black-gate';
import { BLIGHT_EFFECT_RULES } from './blight';
import { BOTTOM_GRAVEYARD_EFFECT_RULES } from './bottom-graveyard';
import { BRUNA_EFFECT_RULES } from './bruna';
import { CAST_MILLED_EFFECT_RULES } from './cast-milled';
import { EFFECT_CHANGE_TARGET } from './change-target';
import { CHOOSE_OPPONENT_EFFECT_RULES } from './choose-opponent';
import { CHOSEN_COLOR_MANA_EFFECT_RULES } from './chosen-color-mana';
import { COLORS_AMONG_MANA_EFFECT_RULES } from './colors-among-mana';
import { COMBAT_RULE_EFFECT_RULES } from './combat-rules';
import { CONTROL_EFFECT_RULES } from './control';
import { CONTROLLER_DAMAGE_EFFECT_RULES } from './controller-damage';
import { COPY_CAST_PAYING_EFFECT_RULES } from './copy-cast-paying';
import { COPY_CHOSEN_TOKEN_EFFECT_RULES } from './copy-chosen-token';
import { COPY_ONE_OF_THEM_EFFECT_RULES } from './copy-one-of-them';
import { EFFECT_COPY_SPELL } from './copy-spell';
import { COPY_SPELL_TWICE_EFFECT_RULES } from './copy-spell-twice';
import { COUNCIL_EFFECT_RULES } from './council';
import { COUNTER_CHOICE_RULES } from './counter-choice';
import { COUNTER_TRIGGER_EFFECT_RULES } from './counter-trigger';
import { COUNTER_RULES } from './counters';
import { CROSS_ZONE_EFFECT_RULES } from './cross-zone';
import { DACK_EFFECT_RULES } from './dack';
import { DAMAGE_BATCH_EFFECT_RULES } from './damage-batch';
import { DAMAGE_HAND_EFFECT_RULES } from './damage-hand';
import { DAMAGE_IT_COUNT_EFFECT_RULES } from './damage-it-count';
import { DANITHA_G1B_EFFECT_RULES } from './danitha-g1b';
import { DANITHA_G2_EFFECT_RULES } from './danitha-g2';
import { DANITHA_G4_EFFECT_RULES } from './danitha-g4';
import { DAWNBREAK_EFFECT_RULES } from './dawnbreak';
import { DEATH_TOLL_B_EFFECT_RULES } from './death-toll-b';
import { DEATH_TOLL_C_EFFECT_RULES } from './death-toll-c';
import { DEATH_TOLL_WINTER_EFFECT_RULES } from './death-toll-winter';
import { DELAYED_RULES } from './delayed';
import { DINOSAUR_EFFECT_RULES } from './dinosaurs';
import { DRAGON_EFFECT_RULES } from './dragons';
import { DRAGON_LIBRARY_EFFECT_RULES } from './dragons-more';
import { DRAW_COMMANDER_CASTS_EFFECT_RULES } from './draw-commander-casts';
import { EACH_LIBRARY_EFFECT_RULES } from './each-library';
import { EACH_PLAYER_CHOOSES_RULES } from './each-player-chooses';
import { ENCHANTED_PLAYER_EFFECT_RULES } from './enchanted-player';
import { ENTERS_WITH_ADDITIONAL_EFFECT_RULES } from './enters-with-additional';
import { EXILE_TOP_INSTEAD_EFFECT_RULES } from './exile-top-instead';
import { EXILED_WITH_EFFECT_RULES } from './exiled-with';
import { EXTRA_TURN_EFFECT_RULES } from './extra-turns';
import { F144_EFFECT_RULES, F144_FIRST_EFFECT_RULES } from './f144';
import { FEATHER_G1_EFFECT_RULES } from './feather-g1';
import { FEATHER_G2_EFFECT_RULES } from './feather-g2';
import { FEATHER_G3_EFFECT_RULES } from './feather-g3';
import { FEDERATION_D_EFFECT_RULES } from './federation-d';
import { FEDERATION_F_EFFECT_RULES } from './federation-f';
import { FINALE_EFFECT_RULES } from './finale';
import { FLASH_PERMISSION_EFFECT_RULES } from './flash-permission';
import { FLEET_E_EFFECT_RULES } from './fleet-e';
import { FLICKER_RULES } from './flicker';
import { FOOD_D_EFFECT_RULES } from './food-d';
import { GAIN_RULES } from './gain';
import { GAIN_KEYWORD_ABILITY_EFFECT_RULES } from './gain-keyword-ability';
import { GAIN_LIFE_AND_DRAW_EFFECT_RULES } from './gain-life-and-draw';
import { GALADRIEL_G1_EFFECT_RULES } from './galadriel-g1';
import { GALADRIEL_G2_EFFECT_RULES } from './galadriel-g2';
import { GALADRIEL_G3_EFFECT_RULES } from './galadriel-g3';
import { GIDEON_EFFECT_RULES } from './gideon';
import { GISA_G3_EFFECT_RULES } from './gisa-g3';
import { GISA_G4_EFFECT_RULES } from './gisa-g4';
import { GISA_G5_EFFECT_RULES } from './gisa-g5';
import { GOAD_EFFECT_RULES } from './goad';
import { GRANTED_STATIC_EFFECT_RULES } from './granted-static';
import { GRAVECAST_EFFECT_RULES } from './gravecast';
import { GRAVEYARD_CAST_EFFECT_RULES } from './graveyard-cast';
import { GRAVEYARD_CHOICE_RULES } from './graveyard-choice';
import { GRAVEYARD_COPY_EFFECT_RULES } from './graveyard-copy';
import { GROUP_BASE_PT_RULES } from './group-base-pt';
import { GROUP_BASE_PT_SOURCE_RULES } from './group-base-pt-source';
import { HASHATON_G5_EFFECT_RULES } from './hashaton-g5';
import { HASHATON_G7_EFFECT_RULES } from './hashaton-g7';
import { HASHATON_G8_EFFECT_RULES } from './hashaton-g8';
import { HASHATON_G9_EFFECT_RULES } from './hashaton-g9';
import { HASHATON_GROUP_4_EFFECT_RULES } from './hashaton-group-4';
import { HAVE_DAMAGE_EFFECT_RULES } from './have-damage';
import { HEXPROOF_LOSS_EFFECT_RULES } from './hexproof-loss';
import { HOFRI_EFFECT_RULES } from './hofri';
import { HYLDA_G1_EFFECT_RULES } from './hylda-g1';
import { HYLDA_G2_EFFECT_RULES } from './hylda-g2';
import { HYLDA_G3_EFFECT_RULES } from './hylda-g3';
import { INCUBATE_EFFECT_RULES } from './incubate';
import { JESKAI_CASTFREE_EFFECT_RULES } from './jeskai-castfree';
import { JESKAI_FLASHBACK_EFFECT_RULES } from './jeskai-flashback';
import { KORVOLD_EFFECT_RULES } from './korvold';
import { LAND_CREATURE_ABILITY_EFFECT_RULES } from './land-creature-ability';
import { LAND_CREATURE_KEYWORDS_EFFECT_RULES } from './land-creature-keywords';
import { LIBRARY_RULES } from './library';
import { LIBRARY_TOP_EFFECT_RULES } from './library-top';
import { LOOK_ELSE_EFFECT_RULES } from './look-else';
import { LOREHOLD_G1_EFFECT_RULES } from './lorehold-g1';
import { LOREHOLD_G2_EFFECT_RULES } from './lorehold-g2';
import {
  EFFECT_ADD_ADDITIONAL_MANA,
  EFFECT_ADD_MANA,
  EFFECT_CHOOSE_COLOR,
  EFFECT_CHOOSE_CREATURE_TYPE,
  EFFECT_CONTROLLER_ADDS_ADDITIONAL_MANA,
} from './mana';
import { MANA_NOT_GENERIC_EFFECT_RULES } from './mana-not-generic';
import { MARDU_SURGE_EFFECT_RULES } from './mardu-surge';
import { MELD_EFFECT_RULES } from './meld';
import { MOVE_COUNTERS_EFFECT_RULES } from './move-counters';
import { NEXT_SPELL_EFFECT_RULES } from './next-spell';
import { NILS_EFFECT_RULES } from './nils';
import { NIV_EFFECT_RULES } from './niv';
import { NIV_GROUP_2B_B_EFFECT_RULES } from './niv-group-2b-b';
import { NIV_GROUP_3_A_EFFECT_RULES } from './niv-group-3-a';
import { NIV_GROUP_3_C_EFFECT_RULES } from './niv-group-3-c';
import {
  type Clauses,
  DAMAGE_RECIPIENTS,
  GRAVEYARD_OPERANDS,
  operands,
  type Restriction,
  SELF_OR_PERMANENT_OPERANDS,
  single,
  UNDER_CONTROL,
} from './operands';
import { OWN_GRAVEYARD_CAST_EFFECT_RULES } from './own-graveyard-cast';
import { OWNER_LIBRARY_EFFECT_RULES } from './owner-library';
import { PARLEY_EFFECT_RULES } from './parley';
import { EFFECT_PAY } from './pay';
import { EFFECT_PAY_ENERGY_ANY } from './pay-energy-any';
import { PAY_OR_CANT_ATTACK_EFFECT_RULES } from './pay-or-cant-attack';
import { PILES_EFFECT_RULES } from './piles';
import { PLANESWALKER_EFFECT_RULES } from './planeswalker';
import {
  EFFECT_DISCARD,
  EFFECT_DISCARD_HAND,
  EFFECT_DRAW,
  EFFECT_LIFE,
  EFFECT_MANIFEST,
  EFFECT_MILL,
  EFFECT_PLAYER,
  EFFECT_PLAYER_LOCK,
  EFFECT_PLAYER_PROTECTION,
  EFFECT_SHUFFLE,
} from './player';
import { PLAYER_MANA_ABILITY_EFFECT_RULES } from './player-mana-ability';
import { POPULATE_EFFECT_RULES } from './populate';
import { PREPARE_EFFECT_RULES } from './prepare';
import { PREVENT_RULES } from './prevent';
import { PRIMORDIAL_EFFECT_RULES } from './primordial';
import { PRISMARI_G1_EFFECT_RULES } from './prismari-g1';
import { PRISMARI_G2_EFFECT_RULES } from './prismari-g2';
import { PRISMARI_G3_EFFECT_RULES } from './prismari-g3';
import { PRODUCED_TYPE_MANA_EFFECT_RULES } from './produced-type-mana';
import { PUMP_RULES } from './pump';
import { PUMP_TARGETS_EFFECT_RULES } from './pump-targets';
import { PUMP_THOSE_EFFECT_RULES } from './pump-those';
import { PUMP_UNBLOCKABLE_EFFECT_RULES } from './pump-unblockable';
import { PUT_RULES } from './put';
import { PUT_MILLED_EFFECT_RULES } from './put-milled';
import { PUT_THAT_CARD_EFFECT_RULES } from './put-that-card';
import { QUANDRIX_EFFECT_RULES } from './quandrix';
import { QUANDRIX_D1_EFFECT_RULES } from './quandrix-d1';
import { QUANDRIX_E_EFFECT_RULES } from './quandrix-e';
import { QUANDRIX_G_EFFECT_RULES } from './quandrix-g';
import { QUICK_DRAW_EFFECT_RULES, QUICK_DRAW_FIRST_EFFECT_RULES } from './quick-draw';
import { RAMP_LANDS_EFFECT_RULES } from './ramp-lands';
import { RECURSION_EFFECT_RULES } from './recursion';
import { REGENERATE_RULES } from './regenerate';
import { RESTRICT_RULES } from './restrict';
import { RETURN_CONTROL_EFFECT_RULES } from './return-control';
import { REVEAL_CHOSEN_TYPE_EFFECT_RULES } from './reveal-chosen-type';
import { REVEAL_TAKE_EFFECT_RULES } from './reveal-take';
import { REVEAL_THAT_MANY_EFFECT_RULES } from './reveal-that-many';
import { REVEAL_TOP_DUEL_EFFECT_RULES } from './reveal-top-duel';
import { REVEAL_UNTIL_OTHER_EFFECT_RULES } from './reveal-until-other';
import { REVEAL_X_CARDS_EFFECT_RULES } from './reveal-x-cards';
import { RING_EFFECT_RULES } from './ring';
import { SACRIFICE_RULES } from './sacrifice';
import { SEARCH_RULES } from './search';
import { SEARCH_PAIR_RULES } from './search-pair';
import { SEEK_OUT_EFFECT_RULES } from './seek-out';
import { SLIVER_D_EFFECT_RULES } from './sliver-d';
import { SONG_FREYALISE_EFFECT_RULES } from './song-freyalise';
import { SPEND_QUALITIES_EFFECT_RULES } from './spend-qualities';
import { THE_TOKEN_EFFECT_RULES } from './the-token';
import { THRONE_EFFECT_RULES } from './throne';
import { TOKEN_EFFECT_RULES } from './token';
import { TRANSFORM_RULES } from './transform';
import { TROYAN_G4_EFFECT_RULES } from './troyan-g4';
import { UNBOUND_I_EFFECT_RULES } from './unbound-i';
import { UP_TO_THAT_MANY_EFFECT_RULES } from './up-to-that-many';
import { VOTE_EFFECT_RULES } from './vote';
import { VRASKA_EFFECT_RULES } from './vraska';
import { WIN_GAME_EFFECT_RULES } from './win-game';
import { WITHERBLOOM_A_EFFECT_RULES } from './witherbloom-a';
import { WITHERBLOOM_C_EARLY_EFFECT_RULES, WITHERBLOOM_C_EFFECT_RULES } from './witherbloom-c';
import { YOU_MAY_HAVE_EFFECT_RULES } from './you-may-have';

/** What "tap" and "untap" act on: a permanent, `~`, or "it" (stage P15). */
const TAP_OPERANDS = [
  ...SELF_OR_PERMANENT_OPERANDS,
  'noun.it',
  // Stage P31 (D-140): "tap enchanted creature" (the permanent the Aura is attached to).
  'noun.attached-permanent',
  // Stage P36 (D-178): "Then if you control four or more lands, untap that land." (the permanent an earlier instruction named).
  'noun.that-object',
  // D-521 (Hylda deck, group 2): "tap target creature that player controls".
  'noun.target-permanent-of-that-player',
  // D-517 (Hylda deck, group 2): "tap all creatures target player controls".
  'noun.all-permanents-of-target-player',
] as const;

/** `effect.damage`: "~ deals 3 damage to any target" (CR 120.2: damage to an object or a player). */
export const EFFECT_DAMAGE = defineRule<Clauses>({
  id: 'effect.damage',
  family: 'effect',
  leading: ['~'],
  cites: ['CR 120.2 (Damage)', 'CR 115.4 (Targets)'],
  examples: [
    '~ deals 3 damage to any target',
    '~ deals three damage to target creature',
    '~ deals 2 damage to each opponent',
    '~ deals X damage to each creature you don’t control',
    '~ deals 2 damage to each creature and each player',
    '~ deals 2 damage to target creature or planeswalker',
    '~ deals 1 damage to any target for each time ~ was kicked',
    '~ deals 1 damage to each opponent for each time it was kicked',
    '~ deals 1 damage to each opponent for each creature you control',
    '~ deals 2 damage to any target for each time ~ was kicked',
    '~ deals damage equal to the greatest power among creatures you control to any target',
    '~ deals damage equal to the number of creatures you control to each opponent',
    // Stage P35 (D-176, CR 109.4): the controller of an object an earlier instruction named.
    '~ deals 2 damage to that permanent’s controller',
    '~ deals 2 damage to its controller',
  ],
  rejects: [
    '~ deals 2 damage to target creature and planeswalker',
    '~ deals 2 damage to that permanent’s controllers',
    '~ deals 2 damage to that player’s controller',
    '~ deals 2 damage to target creature’s controller',
    '~ deals X damage to any target for each time ~ was kicked',
    '~ deals 1 damage to any target for each time',
    '~ deals damage to target creature equal to its power',
    '~ deals a damage to any target',
  ],
  parse: single(
    'effect.damage',
    // "for each time it was kicked" (stage P17, CR 702.33c) and, since stage P28, every count of "for each" replaces
    // the "1", and a number above one multiplies it (an X, which would multiply two unknowns, is not read).
    satisfy(
      sequence(
        literal('~ deals '),
        DAMAGE_AMOUNT,
        literal(' to '),
        operands(DAMAGE_RECIPIENTS, 'effect.damage'),
        optional(FOR_EACH_TAIL, null),
      ),
      ([, amount, , , each]) => each === null || scaled(amount, each) !== null,
    ),
    ([, amount, , to, each]) => ({
      verb: 'dealDamage',
      args: { amount: each === null ? amount : (scaled(amount, each) ?? amount), to },
    }),
  ),
});

/**
 * `effect.damage-count`: "~ deals damage to target player equal to the number of creatures on the
 * battlefield" (CR 120.2: damage to an object or a player; CR 608.2c: the instruction counts as it
 * runs, D-095). One recipient that is a target or "you": a mass recipient ("each creature") or
 * several targets would count again for each, and the engine's amount is counted once per damage
 * instruction. The amount is a count of objects; "equal to its power" and the other references are
 * `effect.damage`'s neighbours and stay unread here.
 */
export const EFFECT_DAMAGE_COUNT = defineRule<Clauses>({
  id: 'effect.damage-count',
  family: 'effect',
  leading: ['~'],
  cites: ['CR 120.2 (Damage)', 'CR 608.2c (Resolving Spells and Abilities)'],
  examples: [
    '~ deals damage to target player equal to the number of creatures on the battlefield',
    '~ deals damage to any target equal to the number of cards in your hand',
    '~ deals damage to target creature equal to the number of lands you control',
    '~ deals damage to you equal to the number of creatures you control',
    // Stage P52 (D-210): the total mana value of the cards a mill before it milled.
    '~ deals damage to target opponent equal to the total mana value of those cards',
    '~ deals damage to that player equal to the total mana value of those cards',
    // Lorehold Spirit deck, group 2 (issue 86, Fateful Tempest): every opponent, for the total mana value of the cards a mill before it milled (one number, counted once).
    '~ deals damage to each opponent equal to the total mana value of cards milled this way',
    '~ deals damage to each opponent equal to the total mana value of those cards',
  ],
  rejects: [
    '~ deals damage to that creature equal to the total mana value of those cards',
    '~ deals damage to target player equal to the total mana value of the cards',
    '~ deals damage to target player equal to the number of creatures',
    '~ deals damage to each creature equal to the number of lands you control',
    '~ deals damage to each opponent equal to the number of lands you control',
    '~ deals damage to each player equal to the total mana value of those cards',
    '~ deals damage to each creature equal to the total mana value of those cards',
    '~ deals damage to two target creatures equal to the number of lands you control',
    '~ deals damage to target creature equal to its power',
    '~ deals damage to target player',
    '~ deals 2 damage to target player equal to the number of creatures you control',
    '~ deals X damage to target player equal to the number of creatures you control',
    'it deals damage to target player equal to the number of creatures you control',
  ],
  parse: single(
    'effect.damage-count',
    satisfy(
      sequence(
        literal('~ deals damage to '),
        satisfy(
          family<IrNoun>('noun', { only: DAMAGE_RECIPIENTS }),
          (noun) =>
            // Stage P52 (D-210): "that player", the one a sentence before it asked (the binding pass makes it that target).
            (noun.det === 'target' ||
              noun.det === 'you' ||
              // Lorehold group 2: "each opponent" is one number for every opponent, read only with the milled value (a count would be counted again for each, below).
              noun.det === 'eachOpponent' ||
              (noun.det === 'anaphor' && noun.rule === 'noun.that-player')) &&
            noun.count === undefined,
        ),
        literal(' '),
        family<IrArg>('amount', { only: ['amount.number-of', 'amount.milled-value-this-way'] }),
      ),
      ([, to, , amount]) =>
        to.det !== 'eachOpponent' || (amount.kind === 'thisWay' && amount.what === 'milledValue'),
    ),
    ([, to, , amount]) => ({ verb: 'dealDamage', args: { amount, to } }),
  ),
});

/**
 * `effect.damage-it`: "it deals 4 damage", the ellipsis of "If ~ was kicked, it deals 4 damage
 * instead.": the spell deals a different amount to what the sentence before it dealt damage to.
 * It names no recipient, so it means something only as the "instead" of a damage sentence, and
 * the lowering of such a sentence is the only one that reads it (CR 614.1a: "instead" replaces an
 * event). Anywhere else "it" has nothing to mean and the clause is reported as not runnable.
 */
export const EFFECT_DAMAGE_IT = defineRule<Clauses>({
  id: 'effect.damage-it',
  family: 'effect',
  leading: ['it'],
  cites: ['CR 120.2 (Damage)', 'CR 614.1a (Replacement Effects)'],
  examples: ['it deals 4 damage', 'it deals three damage', 'It deals 2 damage'],
  rejects: [
    'it deals damage',
    'it deals X damage',
    'it deals 4 damage to target creature',
    '~ deals 4 damage',
    'it deals 4',
  ],
  parse: single(
    'effect.damage-it',
    sequence(
      literal('it deals '),
      family<IrArg>('amount', { only: ['amount.number'] }),
      literal(' damage'),
    ),
    ([, amount]) => ({ verb: 'dealDamage', args: { amount } }),
  ),
});

/**
 * `effect.damage-by-it`: "it deals 1 damage to you", "it deals 2 damage to any target": the
 * permanent the ability is on deals the damage (CR 120.2, 113.7a: "it" is the source, and the
 * source is what deals it). Only where the binding pass reads "it" as `~` itself (a trigger about
 * `~` that happens while it is on the battlefield) does it lower: damage from a target or from a
 * permanent that is gone needs a source the engine's damage does not name. Tried before
 * `effect.damage-it`, which reads the bare "it deals 4 damage" of an "instead" sentence.
 */
export const EFFECT_DAMAGE_BY_IT = defineRule<Clauses>({
  id: 'effect.damage-by-it',
  family: 'effect',
  leading: ['it'],
  cites: ['CR 120.2 (Damage)', 'CR 113.7a (Abilities)', 'CR 115.4 (Targets)'],
  examples: [
    'it deals 1 damage to you',
    'it deals 2 damage to any target',
    'It deals 1 damage to target opponent',
    'it deals 3 damage to each opponent',
    'it deals 2 damage to target creature or planeswalker',
    'it deals damage equal to its power to any target',
    'it deals X damage to any target',
    'it deals damage equal to the number of Dragons you control to any target',
    // Grave Danger (issue 159, Lotleth Giant): the count after "for each" multiplies the quantity (CR 608.2c).
    'it deals 1 damage to target opponent for each creature card in your graveyard',
    'it deals 2 damage to each opponent for each creature you control',
  ],
  rejects: [
    'it deals X damage to target opponent for each creature you control',
    'it deals 1 damage to target opponent for each',
    'it deals damage equal to its power',
    'it deals 1 damage',
    'it deals damage to you',
    'it deals a damage to you',
    'it deals 1 damage to',
    'its deals 1 damage to you',
    '~ deals 1 damage to you',
  ],
  parse: single(
    'effect.damage-by-it',
    satisfy(
      sequence(
        family<IrNoun>('noun', { only: ['noun.it'] }),
        literal(' deals '),
        DAMAGE_AMOUNT,
        literal(' to '),
        operands(DAMAGE_RECIPIENTS, 'effect.damage-by-it'),
        optional(FOR_EACH_TAIL, null),
      ),
      ([, , amount, , , each]) => each === null || scaled(amount, each) !== null,
    ),
    ([source, , amount, , to, each]) => ({
      verb: 'dealDamage',
      args: { source, amount: each === null ? amount : (scaled(amount, each) ?? amount), to },
    }),
  ),
});

/** `effect.destroy`: "Destroy target creature" (CR 701.8). */
export const EFFECT_DESTROY = defineRule<Clauses>({
  id: 'effect.destroy',
  family: 'effect',
  leading: ['destroy'],
  cites: ['CR 701.8 (Destroy)'],
  examples: [
    'destroy target creature',
    'destroy all nonland permanents',
    'destroy each creature',
    'destroy target artifact, target creature, target enchantment, and target land',
    'destroy two target creatures',
    'destroy ~',
    'destroy up to two target creatures',
    'destroy up to one target artifact or enchantment',
    'destroy target artifact or enchantment that player controls',
    'destroy target permanent you own',
  ],
  rejects: [
    'destroy it',
    'destroy up to two target creature',
    'destroy target card from a graveyard',
  ],
  parse: single(
    'effect.destroy',
    sequence(
      literal('destroy '),
      // "destroy target artifact or enchantment that player controls" (Trygon Predator, CR 701.8, 109.4): the permanents of the player of the trigger.
      operands(
        [...SELF_OR_PERMANENT_OPERANDS, 'noun.target-permanent-of-that-player'],
        'effect.destroy',
      ),
    ),
    ([, objects]) => ({ verb: 'destroy', args: { objects } }),
  ),
});

/**
 * `effect.exile`: "Exile target creature", "Exile target card from a graveyard", "Exile target
 * player's graveyard" (CR 406, 701.13).
 */
export const EFFECT_EXILE = defineRule<Clauses>({
  id: 'effect.exile',
  family: 'effect',
  leading: ['exile'],
  cites: ['CR 406.1 (Exile)', 'CR 701.13 (Exile)'],
  examples: [
    'exile target creature',
    'exile target card from a graveyard',
    "exile target creature card from an opponent's graveyard",
    'exile all creatures you control',
    'exile two target creatures',
    'exile target artifact or enchantment',
    'exile ~',
    "exile target player's graveyard",
    'exile target opponent’s graveyard',
    'exile all graveyards',
    "exile any number of target players' graveyards",
    'exile all cards from all graveyards',
    'exile it',
    'exile that card',
    'exile that card from your graveyard',
    'exile that creature',
    // D-407: the permanent an Aura or Equipment is attached to.
    'exile enchanted creature',
    'exile equipped creature',
    "exile each opponent's graveyard",
    // Stage P33 (D-150, CR 610.3): until the permanent with the ability leaves the battlefield.
    'exile target nonland permanent an opponent controls until ~ leaves the battlefield',
    'exile up to two target artifacts and/or enchantments',
    // Protector of the Wastes (CR 115.1, 601.2c): at most two targets, no two controlled by the same player.
    'exile up to two target artifacts and/or enchantments controlled by different players',
    // D-270 (CR 115.1, 404.1): one slot of targets in two zones.
    'exile up to three other target creatures from the battlefield and/or creature cards from graveyards',
    // Stage P70 (D-231, CR 610.3): until an opponent becomes the monarch (Palace Jailer).
    'exile target creature an opponent controls until an opponent becomes the monarch',
    // Lorehold group 2 (issue 86): a card of your graveyard that is none of the types the words leave out.
    'exile target noncreature, nonland card from your graveyard',
    // Soul Snare (CR 508.1b, 506.3): an attacker of the controller or of a planeswalker the controller controls.
    "exile target creature that's attacking you or a planeswalker you control",
  ],
  rejects: [
    'exile target creature until an opponent becomes the monarch or ~ leaves the battlefield',
    'exile target creature until you become the monarch',
    'exile all creatures until an opponent becomes the monarch',
    'exile target creature until ~ leaves',
    'exile target creature until end of turn',
    'exile target creature card from a graveyard until ~ leaves the battlefield',
    'exile all creatures until ~ leaves the battlefield',
    'exile target tapped artifact or enchantment',
    "exile target player's hand",
    "exile any number of target players' hands",
    'exile them',
    'exile this card from your hand',
    'exile that card from your hand',
    'exile that card from a graveyard',
    'exile target noncreature, nonland card from a graveyard',
    'exile target noncreature, nonland card from your graveyard until ~ leaves the battlefield',
    // D-270: the second half is another kind of target, which the slot of two zones does not say.
    'exile up to three other target creatures from the battlefield and/or creature cards from a graveyard',
    'exile up to three other target creatures from the battlefield and/or creature cards from graveyards until ~ leaves the battlefield',
  ],
  parse: single(
    'effect.exile',
    // Graveyard cards first: "target creature card from a graveyard" starts like a permanent phrase.
    satisfy(
      sequence(
        literal('exile '),
        operands(
          [
            ...GRAVEYARD_OPERANDS,
            // Lorehold group 2 (issue 86): "exile target noncreature, nonland card from your graveyard".
            'noun.target-nonmatching-graveyard-card',
            'noun.player-graveyard',
            // Federation Fleet deck, group F (Stonespeaker Crystal): "exile any number of target players' graveyards".
            'noun.any-number-target-players-graveyards',
            'noun.all-graveyards',
            // D-270: "up to three other target creatures from the battlefield and/or creature cards from graveyards" (the one verb that moves a card out of any zone).
            'noun.target-creatures-battlefield-or-graveyard',
            ...SELF_OR_PERMANENT_OPERANDS,
            // Stage P30 (D-135): "you may exile it" (the card a permanent became when it died, or a target of the text).
            'noun.it',
            // Stage P49 (D-206): "you may exile that card from your graveyard" (the card a trigger is about, CR 701.9a).
            'noun.that-card',
            // Stage P63 (D-216): "If you control three or more artifacts, exile that creature." (the target of the sentence before, CR 608.2c).
            'noun.that-object',
            // D-407 (Danitha deck): "Exile enchanted creature." (the permanent the Aura is attached to, which the engine's `attached` names).
            'noun.attached-permanent',
            // Soul Snare (CR 508.1b, 506.3): "Exile target creature that's attacking you or a planeswalker you control."
            'noun.target-creature-attacking-you',
          ],
          'effect.exile',
        ),
        // The graveyard the card is in is the one it went to: "from your graveyard" after "that card" (CR 400.7).
        optional(literal(' from your graveyard'), null),
        // Stage P33 (D-150, CR 610.3): "... until ~ leaves the battlefield", of permanents that are targets only.
        optional(spanned(UNTIL_SOURCE_LEAVES), null),
        // Stage P70 (D-231, CR 610.3): "... until an opponent becomes the monarch".
        optional(spanned(literal(' until an opponent becomes the monarch')), null),
      ),
      ([, objects, , until, monarch]) =>
        (until === null && monarch === null) ||
        (objects.kind === 'noun' &&
          objects.det === 'target' &&
          objects.filter.zone === 'battlefield' &&
          // D-270: cards of graveyards are not put back by "until": the slot of two zones is exiled for good.
          objects.orCard === undefined &&
          objects.filter.player === undefined),
    ),
    ([, objects, , until, monarch]) => ({
      verb: 'exile',
      args: {
        objects,
        ...(until === null
          ? {}
          : { until: { kind: 'flag', value: true, span: until.span, rule: 'effect.exile' } }),
        ...(monarch === null
          ? {}
          : {
              untilMonarch: { kind: 'flag', value: true, span: monarch.span, rule: 'effect.exile' },
            }),
      },
    }),
  ),
});

const OWNERS_HAND = choice(
  pattern(/ to its owner['’]s hand/i),
  pattern(/ to their owner['’]s hand/i),
  pattern(/ to their owners['’] hands/i),
);

/** A card returned "to your hand" must come from your own graveyard; see `effect.return`. */
const YOUR_GRAVEYARD_ONLY: Restriction = {
  accept: (noun) => noun.filter.controller === 'you',
  // Where the refused words began: the " from ..." that names a graveyard that is not yours.
  locate: (noun, text) => text.indexOf(' from ', noun.span.start),
};

function zone(
  rule: string,
  span: Span,
  zoneName: IrZoneSpec['zone'],
  extra: Partial<IrZoneSpec> = {},
): IrZoneSpec {
  return { kind: 'zoneSpec', zone: zoneName, ...extra, span, rule };
}

/**
 * "return a land you control to its owner's hand": the controller chooses among the permanents that
 * match (CR 608.2d), so the noun is `noun.a-permanent`, as in "sacrifice a land". It must say "you
 * control": without it the choice would be among every player's permanents, and one object, not
 * "another" and not a count (the engine's `choose` selector of a return, CR 400.3).
 */
const RETURN_CHOSEN = map(
  sequence(
    literal('return '),
    satisfy(
      family<IrNoun>('noun', { only: ['noun.a-permanent'] }),
      (noun) => noun.filter.controller === 'you' && !noun.plural && !noun.other,
    ),
    spanned(pattern(/ to its owner['’]s hand/i)),
  ),
  ([, objects, to]): { objects: IrNoun | IrNounList; to: IrZoneSpec } => ({
    objects,
    to: zone('effect.return', to.span, 'hand', { whose: 'owner' }),
  }),
);

/** "return target spell or creature to its owner's hand" (issue 81, Fatehold Charm): the slot of a spell on the stack or a creature on the battlefield. */
const RETURN_SPELL_OR_CREATURE_TO_HAND = map(
  sequence(
    literal('return '),
    operands(['noun.target-spell-or-creature'], 'effect.return'),
    spanned(OWNERS_HAND),
  ),
  ([, objects, to]): { objects: IrNoun | IrNounList; to: IrZoneSpec } => ({
    objects,
    to: zone('effect.return', to.span, 'hand', { whose: 'owner' }),
  }),
);

const RETURN_TO_HAND = map(
  sequence(
    literal('return '),
    // "return target creature that player controls to its owner's hand" (Sigil of Sleep, CR 115.1, 109.4, 400.3): the permanents of the player of the trigger.
    operands([...SELF_OR_PERMANENT_OPERANDS, 'noun.target-permanent-of-that-player'], 'effect.return'),
    spanned(OWNERS_HAND),
  ),
  ([, objects, to]): { objects: IrNoun | IrNounList; to: IrZoneSpec } => ({
    objects,
    to: zone('effect.return', to.span, 'hand', { whose: 'owner' }),
  }),
);

/**
 * "return it to its owner's hand" (stage P35, D-176, CR 700.4, 400.7): "it" is the card a permanent became when it went to its owner's
 * graveyard, "When ~ is put into a graveyard from the battlefield, return it to its owner's hand". The lowering reads it so in a trigger of ~
 * dying or leaving the battlefield, and refuses it anywhere else. Quiet: a line that returns "it" elsewhere ("return it to the battlefield")
 * stops where it always did.
 */
const RETURN_IT_TO_HAND: Parser<{ objects: IrNoun | IrNounList; to: IrZoneSpec }> = quiet(
  map(
    sequence(literal('return '), operands(['noun.it'], 'effect.return'), spanned(OWNERS_HAND)),
    ([, objects, to]): { objects: IrNoun | IrNounList; to: IrZoneSpec } => ({
      objects,
      to: zone('effect.return', to.span, 'hand', { whose: 'owner' }),
    }),
  ),
);

const TO_YOUR_HAND: Parser<IrZoneSpec> = map(spanned(literal(' to your hand')), ({ span }) =>
  zone('effect.return', span, 'hand', { whose: 'you' }),
);

/**
 * " with a +1/+1 counter on it", " with a finality counter on it" after the control (stage P68, D-230, CR 122.6, 122.1h): the card enters the battlefield with
 * the counter on it (a replacement effect, CR 614.1c), so it is there when anything triggers from the entering.
 */
const WITH_A_COUNTER = map(
  sequence(
    literal(' with a '),
    pattern(/[+-]\d+\/[+-]\d+|[a-z]+/i),
    pattern(/ counter on it(?![\p{L}\p{N}])/iu),
  ),
  ([, name]) => ({ count: 1, counter: name[0].toLowerCase() }),
);

/** " to the battlefield", then "tapped" and the control when the text says them, in that order, then the counter it enters with. */
const TO_THE_BATTLEFIELD: Parser<IrZoneSpec> = map(
  spanned(
    sequence(
      literal(' to the battlefield'),
      optional(literal(' tapped'), null),
      optional(UNDER_CONTROL, null),
      optional(WITH_A_COUNTER, null),
    ),
  ),
  ({ value: [, tapped, whose, counters], span }) =>
    zone('effect.return', span, 'battlefield', {
      ...(tapped === null ? {} : { tapped: true }),
      ...(whose === null ? {} : { whose }),
      ...(counters === null ? {} : { counters }),
    }),
);

/** A creature's dies trigger may return the card that creature became to the battlefield. */
const RETURN_IT_TO_BATTLEFIELD: Parser<{ objects: IrNoun | IrNounList; to: IrZoneSpec }> = quiet(
  map(
    sequence(literal('return '), operands(['noun.it'], 'effect.return'), TO_THE_BATTLEFIELD),
    ([, objects, to]): { objects: IrNoun | IrNounList; to: IrZoneSpec } => ({ objects, to }),
  ),
);

/**
 * "return target creature card and all other cards with the same name as that card from your graveyard to your hand" (Echoing Return, CR 201.2, 400.3, 608.2c): the cards of your
 * graveyard with the name of the target card, which the noun says in full (the "from your graveyard" is part of it).
 */
const RETURN_SAME_NAME: Parser<{ objects: IrNoun | IrNounList; to: IrZoneSpec }> = quiet(
  map(
    sequence(
      literal('return '),
      operands(['noun.target-card-and-same-name'], 'effect.return'),
      TO_YOUR_HAND,
    ),
    ([, objects, to]) => ({ objects, to }),
  ),
);

/**
 * "return that nonland permanent card to the battlefield", "return that card to your hand" (stage P33, D-150, CR 608.2c): the card an earlier
 * instruction of the text chose from a graveyard, which the lowering checks it is.
 */
const RETURN_THAT_CARD: Parser<{ objects: IrNoun | IrNounList; to: IrZoneSpec }> = quiet(
  map(
    sequence(
      literal('return '),
      operands(['noun.that-card'], 'effect.return'),
      // Stitch Together (CR 608.2c): "Return that card from your graveyard to the battlefield instead if ...": the card the first sentence returned, said with where it is.
      optional(literal(' from your graveyard'), null),
      choice(TO_THE_BATTLEFIELD, TO_YOUR_HAND),
    ),
    ([, objects, , to]) => ({ objects, to }),
  ),
);

/**
 * "return the chosen cards to the battlefield tapped" (D-362, Victimize, CR 608.2c, 110.2a): the cards an earlier sentence chose as targets from a graveyard, which the
 * lowering checks they are. Only to the battlefield: "the chosen cards" to a hand is another sentence.
 */
const RETURN_THE_CHOSEN_CARDS: Parser<{ objects: IrNoun | IrNounList; to: IrZoneSpec }> = quiet(
  map(
    sequence(
      literal('return '),
      operands(['noun.the-chosen-cards'], 'effect.return'),
      TO_THE_BATTLEFIELD,
    ),
    ([, objects, to]) => ({ objects, to }),
  ),
);

/**
 * "return this card to its owner's hand" (stage P33, D-150, CR 400.7): the card of the source of the ability, wherever it is now (an Aura in
 * its owner's graveyard when "When enchanted creature dies" resolves).
 */
const RETURN_THIS_CARD: Parser<{ objects: IrNoun | IrNounList; to: IrZoneSpec }> = quiet(
  map(
    sequence(
      literal('return '),
      operands(['noun.this-card'], 'effect.return'),
      spanned(OWNERS_HAND),
    ),
    ([, objects, to]) => ({
      objects,
      to: zone('effect.return', to.span, 'hand', { whose: 'owner' }),
    }),
  ),
);

/**
 * Whether the clause ahead returns to the battlefield. The graveyard a card comes from matters only
 * for a return to a hand, so the operand is read with or without that restriction by what follows
 * it; either way a refusal fails where it always did.
 */
const TO_BATTLEFIELD_AHEAD = /^return [^.]*? to the battlefield/i;

/**
 * " attached to that token" after the battlefield (issue 89, Forum Filibuster, CR 303.4f, 400.7j): an Aura or an Equipment card put onto the battlefield attached to the token the
 * sentences before it made, which names it, so nothing is asked. Only the token: another host is another statement.
 */
const ATTACHED_TO_THAT_TOKEN: Parser<IrNoun> = map(
  sequence(literal(' attached to '), family<IrNoun>('noun', { only: ['noun.that-token'] })),
  ([, host]) => host,
);

const RETURN_FROM_GRAVEYARD: Parser<{
  objects: IrNoun | IrNounList;
  to: IrZoneSpec;
  attachTo?: IrNoun;
}> = (ctx, pos) => {
  const toBattlefield = TO_BATTLEFIELD_AHEAD.test(ctx.text.slice(pos));
  const r = sequence(
    literal('return '),
    // D-386: "return X target creature cards from your graveyard to your hand" (as many targets as the X announced) is read here and by no other verb.
    operands(
      [
        ...GRAVEYARD_OPERANDS,
        'noun.x-target-graveyard-cards',
        'noun.up-to-x-target-graveyard-cards',
      ],
      'effect.return',
      toBattlefield ? undefined : YOUR_GRAVEYARD_ONLY,
    ),
    toBattlefield ? TO_THE_BATTLEFIELD : TO_YOUR_HAND,
    optional(ATTACHED_TO_THAT_TOKEN, null),
  )(ctx, pos);
  // Only a card put onto the battlefield is attached as it enters.
  if (r.ok && !toBattlefield && r.value[3] !== null) return fail(ctx, pos);
  return r.ok
    ? {
        ok: true,
        value: {
          objects: r.value[1],
          to: r.value[2],
          ...(r.value[3] === null ? {} : { attachTo: r.value[3] }),
        },
        pos: r.pos,
      }
    : r;
};

/**
 * "return target creature or land card from a graveyard to its owner's hand" (Pulse of Murasa, CR 400.3, 404.1): one target card of any graveyard goes to its owner's
 * hand, wherever it lies. One card only: the plural is "to their owners' hands", read by no rule.
 */
const RETURN_FROM_ANY_GRAVEYARD_TO_OWNERS_HAND: Parser<{
  objects: IrNoun | IrNounList;
  to: IrZoneSpec;
}> = map(
  sequence(
    literal('return '),
    operands(['noun.target-graveyard-card'], 'effect.return', {
      accept: (noun) => !noun.plural && noun.count === undefined && noun.upTo !== true,
      locate: (noun) => noun.span.start,
    }),
    spanned(pattern(/ to its owner['’]s hand/i)),
  ),
  ([, objects, to]) => ({
    objects,
    to: zone('effect.return', to.span, 'hand', { whose: 'owner' }),
  }),
);

/**
 * `effect.return`: "Return target creature to its owner's hand" and "Return target creature card
 * from a graveyard to the battlefield [tapped] [under your control | under its owner's control]".
 * A card put onto the battlefield enters under the control of the player performing the effect
 * unless the text says otherwise (CR 110.2a), so the bare form and "under your control" are the
 * same reading, and the owner's control is the stated exception. A card returned "to your hand"
 * must come from your own graveyard: from someone else's it would go to its owner's hand (CR 400.3),
 * which the AST cannot say, and the refusal points at "from ...".
 */
export const EFFECT_RETURN = defineRule<Clauses>({
  id: 'effect.return',
  family: 'effect',
  leading: ['return'],
  cites: ['CR 400.3 (General)', 'CR 406 (Exile)', 'CR 701.8 (Destroy)', 'CR 110.2a (Permanents)'],
  examples: [
    "return target creature to its owner's hand",
    'return target creature to its owner’s hand',
    "return all creatures to their owners' hands",
    'return target creature card from your graveyard to your hand',
    'return target creature card from your graveyard to the battlefield',
    // D-386 (Hashaton, group 10): as many targets as the X announced for the spell.
    'return X target creature cards from your graveyard to your hand',
    'return all land cards from your graveyard to the battlefield tapped',
    'return target creature card from a graveyard to the battlefield',
    // Pulse of Murasa (CR 400.3): one card of any graveyard, to its owner's hand.
    "return target creature or land card from a graveyard to its owner's hand",
    "return target creature card from an opponent's graveyard to its owner's hand",
    'return target creature card from a graveyard to the battlefield under your control',
    "return target creature card from a graveyard to the battlefield under its owner's control",
    'return target creature card from your graveyard to the battlefield tapped under your control',
    "return target creature card from an opponent's graveyard to the battlefield tapped",
    "return ~ to its owner's hand",
    "return target creature that player controls to its owner's hand",
    // Stage P35 (D-176): "it", the card a permanent became when it went to its owner's graveyard.
    "return it to its owner's hand",
    "return it to the battlefield tapped under its owner's control",
    "return it to the battlefield tapped under its owner's control with a +1/+1 counter on it",
    // Echoing Return (CR 201.2, 608.2c): the target card and every card of your graveyard with its name.
    'return target creature card and all other cards with the same name as that card from your graveyard to your hand',
    // Persist (CR 205.4, 122.6, 614.1c): a nonlegendary card of your graveyard, entering with a -1/-1 counter.
    'return target nonlegendary creature card from your graveyard to the battlefield with a -1/-1 counter on it',
    "return a land you control to its owner's hand",
    'return an artifact you control to its owner’s hand',
    "return a nonland permanent you control to its owner's hand",
    "return a Forest you control to its owner's hand",
    // Stage P33 (D-150): the card an earlier instruction chose, and the card of the source.
    'return that card to the battlefield',
    'return that nonland permanent card to the battlefield',
    'return that card to your hand',
    "return this card to its owner's hand",
    // D-362 (Victimize): the cards an earlier sentence chose as targets.
    'return the chosen cards to the battlefield',
    'return the chosen cards to the battlefield tapped',
    // Issue 89 (Forum Filibuster): put onto the battlefield attached to the token the sentence before made.
    'return up to one target Aura or Equipment card from your graveyard to the battlefield attached to that token',
    'return target Aura card from your graveyard to the battlefield attached to that token',
  ],
  rejects: [
    "return that card to its owner's hand",
    'return that card to the battlefield tapped under your command',
    "return this card to its owner's library",
    "return this card from your graveyard to its owner's hand",
    'return this card to your hand',
    "return a land to its owner's hand",
    "return a creature an opponent controls to its owner's hand",
    "return another creature you control to its owner's hand",
    "return two lands you control to their owners' hands",
    'return a land you control to your hand',
    'return a land you control to the battlefield',
    "return ~ to its owner's hand tapped",
    'return ~ to the battlefield',
    "return it to its owner's hand tapped",
    "return them to their owners' hands",
    "return its to its owner's hand",
    "return target creature card from an opponent's graveyard to your hand",
    'return target creature card from a graveyard to your hand',
    'return target creature card from your graveyard to your hand under your control',
    'return X target creature cards from a graveyard to your hand',
    "return two target creature cards from a graveyard to its owner's hand",
    "return up to one target creature card from a graveyard to its owner's hand",
    "return all creature cards from a graveyard to its owner's hand",
    "return target creature card from a graveyard to its owner's hand tapped",
    'return X target creature cards from your graveyard to your library',
    'return X target creature cards to your hand',
    'return target creature to the battlefield',
    'return target creature card from a graveyard to the battlefield under his control',
    'return target creature card from a graveyard to the battlefield under your control tapped',
    'return target creature card from a graveyard to the battlefield under your command',
    'return target creature card from a graveyard to the battlefield at the beginning of the next end step',
    'return the chosen cards to your hand',
    "return the chosen cards to their owners' hands",
    'return the chosen card to the battlefield',
    'return the chosen cards to the battlefield under their owners control',
    'return target creature card from your graveyard to your hand attached to that token',
    'return target creature card from your graveyard to the battlefield attached to target creature',
    'return target creature card from your graveyard to the battlefield attached to it',
    'return target creature card from your graveyard to the battlefield attached to that creature',
    'return target creature card from your graveyard to the battlefield attached to those tokens',
    'return target creature card from your graveyard to the battlefield attached to',
  ],
  parse: single(
    'effect.return',
    choice<{ objects: IrNoun | IrNounList; to: IrZoneSpec; attachTo?: IrNoun }>(
      RETURN_TO_HAND,
      RETURN_SPELL_OR_CREATURE_TO_HAND,
      RETURN_IT_TO_HAND,
      RETURN_IT_TO_BATTLEFIELD,
      RETURN_CHOSEN,
      RETURN_SAME_NAME,
      RETURN_FROM_GRAVEYARD,
      RETURN_FROM_ANY_GRAVEYARD_TO_OWNERS_HAND,
      RETURN_THAT_CARD,
      RETURN_THE_CHOSEN_CARDS,
      RETURN_THIS_CARD,
    ),
    ({ objects, to, attachTo }) => ({
      verb: 'return',
      args: { objects, to, ...(attachTo === undefined ? {} : { attachTo }) },
    }),
  ),
});

/**
 * `effect.counter`: "Counter target spell", "Counter target noncreature spell", "Counter target
 * instant or sorcery spell" (CR 701.6): the spell is a target of the kind its words describe (CR
 * 115.1). "unless its controller pays" and the clauses after it are other rules' business.
 */
export const EFFECT_COUNTER = defineRule<Clauses>({
  id: 'effect.counter',
  family: 'effect',
  leading: ['counter'],
  cites: ['CR 701.6 (Counter)'],
  examples: [
    'counter target spell',
    'counter target noncreature spell',
    'counter target creature spell',
    'counter target instant or sorcery spell',
    'counter target enchantment, instant, or sorcery spell',
    'counter target blue spell',
    'counter target spell with mana value 1',
    // Stage P50 (D-207): a triggered ability or a spell.
    'counter target triggered ability or colorless spell',
    // Issue 100 (Sublime Epiphany): an activated or a triggered ability.
    'counter target activated or triggered ability',
    // Ahoy Mateys deck, group 10 (Siren Stormtamer): a spell or an ability that targets you or a creature you control.
    'counter target spell or ability that targets you or a creature you control',
    'counter target spell, activated ability, or triggered ability',
  ],
  rejects: [
    'counter target spell unless its controller pays {1}',
    'counter target spell with mana value X or less',
    'counter target creature',
    'counter all spells',
    'counter target spell or ability',
  ],
  parse: single(
    'effect.counter',
    sequence(
      literal('counter '),
      family<IrNoun>('noun', {
        only: [
          'noun.target-spell',
          'noun.target-triggered-ability-or-spell',
          'noun.target-activated-or-triggered-ability',
          // Issue 105 (Disallow).
          'noun.target-spell-activated-or-triggered-ability',
          // Ahoy Mateys deck, group 10 (Siren Stormtamer).
          'noun.target-spell-or-ability-targeting-you',
        ],
      }),
    ),
    ([, objects]) => ({ verb: 'counter', args: { objects } }),
  ),
});

/** Succeeds, reading nothing, when the text from here on matches `re`; fails here otherwise. */
function lookahead(re: RegExp): Parser<null> {
  return (ctx, pos) =>
    re.test(ctx.text.slice(pos)) ? { ok: true, value: null, pos } : fail(ctx, pos);
}

/**
 * `effect.counter-unless`: "Counter target spell unless its controller pays {3}", "Counter target
 * noncreature spell unless its controller pays {2}" (CR 701.6 counter; CR 118.12a: "unless" a player
 * pays a cost, that player may pay it as the effect resolves, and CR 608.2d: the choice is the
 * controller of the spell's, not of the counterspell). The cost is plain mana: the engine has no
 * {X} here, and "pays N life" has no line of the corpus yet. Tried before `effect.counter`, whose
 * phrase is a prefix of this one.
 */
export const EFFECT_COUNTER_UNLESS = defineRule<Clauses>({
  id: 'effect.counter-unless',
  family: 'effect',
  leading: ['counter'],
  cites: ['CR 701.6 (Counter)', 'CR 118.12a (Costs)', 'CR 608.2d (Resolving Spells and Abilities)'],
  examples: [
    'counter target spell unless its controller pays {3}',
    'counter target spell unless its controller pays {1}',
    'counter target noncreature spell unless its controller pays {2}',
    'counter target instant or sorcery spell unless its controller pays {1}',
    'counter target creature spell unless its controller pays {2}{U}',
  ],
  rejects: [
    'counter target spell unless its controller pays {X}',
    'counter target spell unless its controller pays 2 life',
    'counter target spell unless its controller pays',
    'counter target spell unless that player pays {3}',
    'counter target spell unless you pay {3}',
    'counter target spell unless its controller pays {R/W}',
    'counter target spell',
    'counter target creature unless its controller pays {3}',
    'counter target spell unless its controller discards a card',
  ],
  parse: single(
    'effect.counter-unless',
    // A line with no "unless" is `effect.counter`'s: failing here at its first word keeps the
    // diagnostic of "Counter target spell with mana value X or less" where the noun rule stopped.
    sequence(
      lookahead(/^counter [^.]*? unless /i),
      literal('counter '),
      family<IrNoun>('noun', { only: ['noun.target-spell'] }),
      literal(' unless its controller pays '),
      spanned(family<IrCost>('cost', { only: ['cost.mana'] })),
    ),
    ([, , objects, , cost]) => ({
      verb: 'counterUnlessPays',
      args: {
        objects,
        cost: {
          kind: 'costList',
          costs: [cost.value],
          span: cost.span,
          rule: 'effect.counter-unless',
        },
      },
    }),
  ),
});

function tapRule(verb: 'tap' | 'untap'): ReturnType<typeof defineRule<Clauses>> {
  const id = `effect.${verb}`;
  return defineRule<Clauses>({
    id,
    family: 'effect',
    leading: [verb],
    cites: ['CR 701.26 (Tap and Untap)'],
    // "Untap it" (stage P15): the pronoun is a target an earlier sentence chose, or `~` in a trigger
    // about itself; the binding pass decides, and an "it" with nothing to mean is not lowered.
    examples:
      verb === 'tap'
        ? [
            'tap target creature',
            'tap all creatures your opponents control',
            'tap ~',
            'tap it',
            'tap another target creature',
            'tap enchanted creature',
            'tap that creature',
          ]
        : [
            'untap target land',
            'untap all lands you control',
            'untap ~',
            'untap it',
            'untap another target artifact',
            'untap target Forest',
            'untap that land',
          ],
    rejects:
      verb === 'tap'
        ? ['tap target spell', 'untap target land', 'tap them', 'tap that creatures']
        : ['untap target spell', 'untap them', 'untap that lands', 'untap itself'],
    parse: single(id, sequence(literal(`${verb} `), operands(TAP_OPERANDS, id)), ([, objects]) => ({
      verb,
      args: { objects },
    })),
  });
}

export const EFFECT_TAP = tapRule('tap');
export const EFFECT_UNTAP = tapRule('untap');

export const EFFECT_RULES = [
  // Finale of Promise (issue 121): the four sentences of its one instruction start like a plain "you may cast", and are tried first.
  ...QUICK_DRAW_FIRST_EFFECT_RULES,
  // Issue 144 (Grenzo): "until end of turn, you may cast that card and you may spend mana as though it were mana of any color ...", before the plain `effect.may-play`.
  ...F144_FIRST_EFFECT_RULES,
  // Ahoy Mateys deck, group 2 (Hostage Taker, Dire Fleet Daredevil, King Narfi's Betrayal): "you may cast that card ..., and mana of any type can be spent" and "you may exile a card from each graveyard" start like the plain may-play and exile rules, and are tried first.
  ...AHOY_G2_EFFECT_RULES,
  // Ahoy Mateys deck, group 1b (Breeches, Ramirez DePietro): "exile the top card of each of those opponents' libraries", "you may play those cards this turn, and you may spend mana ..." and "you may cast that card for as long as it remains exiled" start like the plain exile, may-play and may-cast rules, and are tried first.
  ...AHOY_G1B_EFFECT_RULES,
  // Ahoy Mateys deck, group 10: "each creature that convoked ~ connives" and the reveal of each player's top card with a token for each nonland card; they start like other rules on "each" and are tried first.
  ...AHOY_G10_EFFECT_RULES,
  // Issue 89 (Animate Dead): the sentences of the Aura that returns the card it enchants start like a plain return, a plain "it ..." and "that creature ...", and are tried first.
  ...AURA_GRAVEYARD_EFFECT_RULES,
  ...PREPARE_EFFECT_RULES,
  ...GRAVEYARD_CHOICE_RULES,
  // D-438, D-439 (Feather, group 3): the copies for each other creature and the exile as a spell resolves start like a plain copy, a plain exile and "that player ...", and are tried first.
  ...FEATHER_G3_EFFECT_RULES,
  // Quandrix Unlimited deck, group I (Unbound Flourishing): "double the value of X" and "copy that spell or ability" start like a plain double and a plain copy, and are tried first.
  ...UNBOUND_I_EFFECT_RULES,
  // Issue 133 (Diffusion Sliver): "counter that spell or ability unless its controller pays {2}" starts like the plain counter rules, and is tried first.
  ...COUNTER_TRIGGER_EFFECT_RULES,
  // Gisa deck, group 4 (issue 41, D-459, D-460): "Exile it at the beginning of the next end step." and "Put each creature card exiled with ~ onto the battlefield ..." start like a plain
  // exile and a plain put, and "It gains haste." like a gain: tried first.
  ...GISA_G4_EFFECT_RULES,
  // Ahoy Mateys deck, group 3: "Exile that token at end of combat.", "Look at defending player's hand. You may put ... tapped and attacking ..." and "Return that creature to its owner's hand at the beginning of the next end step." start like the plain exile, look and return rules, and are tried first.
  ...AHOY_G3_EFFECT_RULES,
  // Ahoy Mateys deck, group 7: "Until end of turn, it gains haste and becomes a Pirate in addition to its other types." and "That creature doesn't untap during its controller's untap step for as long as you control ~." start like the plain lead-gain and doesn't-untap rules, and are tried first.
  ...AHOY_G7_EFFECT_RULES,
  ...AHOY_G8_EFFECT_RULES,
  ...BLACK_GATE_EFFECT_RULES,
  // Prismari deck, group 1 (issue 87, D-638 to D-645): "populate", the sentences about the tokens an instruction just made ("Sacrifice it at the beginning of the next end step.",
  // "Exile them ...", "They gain haste."), "choose any number of target creatures", "choose a token you control" and "~ becomes a copy of ..." start like the plain sacrifice, exile,
  // choose and gain rules, and are tried first.
  ...PRISMARI_G1_EFFECT_RULES,
  // Prismari deck, group 2 (issue 87, D-647 and later): "for each opponent, create ... tokens that attack that opponent ...", "add ... Until end of turn, you don't lose this mana ...",
  // "exile ~ with three time counters on it" and "exile up to one target ... card from your graveyard and copy it. You may cast the copy ..." start like the plain "for each", add and exile
  // rules, and are tried first.
  // Blue Mage's Cane: "exile ... from defending player's graveyard. If you do, copy it. You may cast the copy by paying {3} rather than paying its mana cost."
  ...COPY_CAST_PAYING_EFFECT_RULES,
  ...PRISMARI_G2_EFFECT_RULES,
  ...MARDU_SURGE_EFFECT_RULES,
  // Prismari deck, group 3 (issue 87, D-660 and later): "Exile the top four cards ... in a face-down pile ...", "you may cast a spell from among them without paying its mana cost", "put the rest into
  // your hand", "shuffle your library, then reveal cards ... exile that card ...", "as many times as you choose, you may exile ...", "each player exiles cards ... until they exile a nonland card",
  // "an opponent chooses a nonland card exiled this way" and "whenever a creature you control deals combat damage ... copy the exiled card" start like the plain exile, cast, put, shuffle,
  // each and whenever rules, and are tried first.
  ...PRISMARI_G3_EFFECT_RULES,
  // Hylda deck, group 1 (issue 42, D-512, D-513): "for each opponent, tap up to one target creature that player controls" and "tap up to X target nonland permanents, where X is ...
  // scrying this way" start like a plain tap and like the "for each" rules, and are tried first.
  ...HYLDA_G1_EFFECT_RULES,
  // Silverquill deck (Nils): "for each player, put a +1/+1 counter on up to one target creature that player controls" starts like the plain "for each" rules, and is tried first.
  ...NILS_EFFECT_RULES,
  // D-517, D-519 (Hylda deck, group 2): "Those creatures don't untap during ... next untap step" and "Until your next turn, creatures ... enter tapped".
  ...HYLDA_G2_EFFECT_RULES,
  // Lorehold Spirit deck, group 1 (issue 86): "repeat this process once", "exile one of them from your graveyard", "shuffle any number of target cards from your graveyard into your library" and
  // "each creature deals damage to itself equal to its power" start like a plain exile, a plain shuffle and a plain damage, and are tried first.
  ...JESKAI_FLASHBACK_EFFECT_RULES,
  ...LOREHOLD_G1_EFFECT_RULES,
  // Issue 279 (Rakdos Charm): "each creature deals 1 damage to its controller" starts like the plain "each" rules, and is tried first.
  ...CONTROLLER_DAMAGE_EFFECT_RULES,
  // Issue 279 (Etali, Primal Storm): "exile the top card of each player's library" starts like the plain exile, and is tried first.
  ...EACH_LIBRARY_EFFECT_RULES,
  // Lorehold Spirit deck, group 2 (issue 86): "Choose target card exiled with ~. You may cast that card this turn without paying its mana cost. ..." starts like "choose target ...", tried first.
  ...LOREHOLD_G2_EFFECT_RULES,
  ...FOOD_D_EFFECT_RULES,
  // Urianger Augurelt: "look at the top card of your library. you may exile it face down" and "until end of turn, you may play cards exiled with ~. spells you cast this way cost {2} less to cast".
  ...ARCANUM_EFFECT_RULES,
  // Federation Fleet deck, group D: "you may reveal the top card of your library. Draw a card if it's an artifact card. If you don't draw a card this way, put two +1/+1 counters on ~."
  ...FEDERATION_D_EFFECT_RULES,
  // Galadriel deck, group 1 (issue 43): "reveal the top card of your library. If ...", "look at the top card ... you may put that card onto the battlefield" and "They become 5/5 Elemental
  // creatures ... They're still lands." start like the plain reveal, look and pronoun rules, and are tried first.
  ...GALADRIEL_G1_EFFECT_RULES,
  // Galadriel deck, group 3 (issue 43): "Exchange control of ~ and target nonland permanent", "counter ... unless its controller pays mana equal to ...", "Draw a card and reveal it.
  // Remove ..." and "Its activated abilities can't be activated this turn." start like the plain counter, draw and pronoun rules, and are tried first.
  ...GALADRIEL_G3_EFFECT_RULES,
  // CR 402.1: "it deals damage to each opponent equal to the number of cards in that player's hand", before the plain damage rules it starts like.
  ...DAMAGE_HAND_EFFECT_RULES,
  ...DAMAGE_IT_COUNT_EFFECT_RULES,
  ...CHOOSE_OPPONENT_EFFECT_RULES,
  // Abzan Armor deck, group C (Expel the Interlopers): "Choose a number between 0 and 10."
  ...ABZAN_SPELLS_EFFECT_RULES,
  ...GAIN_KEYWORD_ABILITY_EFFECT_RULES,
  // Quandrix Unlimited deck, group D2: "you gain life and draw cards equal to its power".
  ...GAIN_LIFE_AND_DRAW_EFFECT_RULES,
  // Quandrix Unlimited deck, group D2: "target player draws X cards plus an additional card for each time they've cast a commander from the command zone this game".
  ...DRAW_COMMANDER_CASTS_EFFECT_RULES,
  // Quandrix Unlimited deck, group D2: "reveal the top X cards ... put all land cards from among them onto the battlefield tapped", "reveal cards until you reveal X land cards".
  ...REVEAL_X_CARDS_EFFECT_RULES,
  ...REVEAL_THAT_MANY_EFFECT_RULES,
  ...COPY_SPELL_TWICE_EFFECT_RULES,
  ...DAMAGE_BATCH_EFFECT_RULES,
  // CR 701.46a (Adapt): "Adapt 4".
  ...ADAPT_EFFECT_RULES,
  // Issue 121 (CR 601.2f, 702.40a, 702.85a): "the next instant or sorcery spell you cast this turn costs {X} less / has storm".
  ...NEXT_SPELL_EFFECT_RULES,
  // Leyline Dowser (issue 121): "You may put an instant or sorcery card milled this way into your hand."
  ...PUT_MILLED_EFFECT_RULES,
  // Arcane Bombardment (issue 121): exile at random, copy what the permanent exiled.
  ...QUICK_DRAW_EFFECT_RULES,
  ...OWNER_LIBRARY_EFFECT_RULES,
  ...INCUBATE_EFFECT_RULES,
  ...CAST_MILLED_EFFECT_RULES,
  ...DACK_EFFECT_RULES,
  ...REVEAL_CHOSEN_TYPE_EFFECT_RULES,
  ...PAY_OR_CANT_ATTACK_EFFECT_RULES,
  ...REVEAL_UNTIL_OTHER_EFFECT_RULES,
  ...LAND_CREATURE_KEYWORDS_EFFECT_RULES,
  ...LAND_CREATURE_ABILITY_EFFECT_RULES,
  ...YOU_MAY_HAVE_EFFECT_RULES,
  ...SONG_FREYALISE_EFFECT_RULES,
  // Death Toll deck, group C: "reveal the top four cards ... put all land cards revealed this way into your hand", "look at the top three cards ... the rest into your graveyard".
  ...DEATH_TOLL_C_EFFECT_RULES,
  ...DEATH_TOLL_WINTER_EFFECT_RULES,
  EFFECT_DAMAGE,
  EFFECT_DAMAGE_COUNT,
  ...BITE_RULES,
  // Stage P32 (D-147): fights, doubling, the excess damage of trample, revealing until, casting for free, a token for each, divided damage.
  ...COUNCIL_EFFECT_RULES,
  ...DINOSAUR_EFFECT_RULES,
  // Troyan deck, group 4 (issue 337): "Exile the top eight cards of your library. You may put a land card ..." starts like the plain exile of the top cards, and is tried first.
  ...TROYAN_G4_EFFECT_RULES,
  // Quandrix Unlimited deck, group G: "Distribute X +1/+1 counters among any number of target creatures you control".
  ...QUANDRIX_G_EFFECT_RULES,
  // Lathiel: "distribute up to that many +1/+1 counters among any number of other target creatures" (a division of a triggered ability).
  ...UP_TO_THAT_MANY_EFFECT_RULES,
  // Jeskai free-cast cards (issue 100): "look at the top seven cards ... you may cast ... from among them without paying its mana cost".
  ...JESKAI_CASTFREE_EFFECT_RULES,
  // Stage P34 (D-152): the top cards exiled and played, an extra combat, Discover, revealing the top card, Behold and the rider of mana.
  ...DRAGON_EFFECT_RULES,
  ...DRAGON_LIBRARY_EFFECT_RULES,
  ...KORVOLD_EFFECT_RULES,
  // Baldin, Century Herdmaster: "up to one hundred target creatures each get +0/+X until end of turn".
  ...PUMP_TARGETS_EFFECT_RULES,
  // Valakut Exploration: "you may play that card for as long as it remains exiled", "put them into their owner's graveyard", "~ deals that much damage to each opponent".
  ...EXILED_WITH_EFFECT_RULES,
  // Issue 337 (Finale of Revelation): "you have no maximum hand size for the rest of the game".
  ...FINALE_EFFECT_RULES,
  ...GIDEON_EFFECT_RULES,
  // CR 701.20a, 119.3: 'you and target opponent each reveal the top card of your library. You each lose life ...' starts like the plain player rules, so it is tried first.
  ...REVEAL_TOP_DUEL_EFFECT_RULES,
  ...HEXPROOF_LOSS_EFFECT_RULES,
  ...GOAD_EFFECT_RULES,
  // Issue 25 (the Niv-Mizzet deck): "shuffle ~ and your graveyard into their owner's library".
  ...NIV_EFFECT_RULES,
  // Quandrix deck: "Target player shuffles up to three target cards from their graveyard into their library".
  ...QUANDRIX_EFFECT_RULES,
  // Endurance (Elemental Incarnation cycle): "up to one target player puts all the cards from their graveyard on the bottom of their library in a random order".
  ...BOTTOM_GRAVEYARD_EFFECT_RULES,
  // Hylda deck, group 3 (issue 42): "shuffle ~ and target creature ... into their owners' libraries".
  ...HYLDA_G3_EFFECT_RULES,
  // Hatsune Miku deck (issue 145): "You win the game."
  ...WIN_GAME_EFFECT_RULES,
  ...FLASH_PERMISSION_EFFECT_RULES,
  // Quandrix Unlimited deck: "Until end of turn, any time you could activate a mana ability, you may pay 1 life. If you do, add {C}." (Channel).
  ...PLAYER_MANA_ABILITY_EFFECT_RULES,
  ...SPEND_QUALITIES_EFFECT_RULES,
  ...NIV_GROUP_2B_B_EFFECT_RULES,
  // D-337: "copy it for each time you've cast your commander from the command zone this game".
  ...NIV_GROUP_3_A_EFFECT_RULES,
  ...NIV_GROUP_3_C_EFFECT_RULES,
  // Dance of the Elements deck: "You may play target Elemental card from your graveyard without paying its mana cost".
  ...GRAVECAST_EFFECT_RULES,
  ...GRAVEYARD_CAST_EFFECT_RULES,
  // First Flight deck: "for each opponent, you may cast up to one target instant or sorcery card from that player's graveyard without paying its mana cost".
  ...PRIMORDIAL_EFFECT_RULES,
  // Issue 144 (Goblin Dark-Dwellers, Grenzo): "cast target ... card from your graveyard without paying its mana cost" and "exile the top card of that player's library".
  ...F144_EFFECT_RULES,
  // Scions & Spellcraft deck, group G: "cast target instant or sorcery card from your graveyard", paying its mana cost.
  ...OWN_GRAVEYARD_CAST_EFFECT_RULES,
  ...HASHATON_G7_EFFECT_RULES,
  // D-367: "amass Zombies 1".
  ...HASHATON_GROUP_4_EFFECT_RULES,
  // Issue 160 (D-627): "Populate".
  ...POPULATE_EFFECT_RULES,
  // Lorwyn Eclipsed (CR 701.68a): "blight 1" as an instruction.
  ...BLIGHT_EFFECT_RULES,
  // Aberrant Return: "Each of them enters with an additional -1/-1 counter on it." after a put onto the battlefield.
  ...ENTERS_WITH_ADDITIONAL_EFFECT_RULES,
  // The Reaper, King No More: "put that card onto the battlefield under your control", before the plain put of counters.
  ...PUT_THAT_CARD_EFFECT_RULES,
  // Burning Curiosity: "exile the top three cards instead".
  ...EXILE_TOP_INSTEAD_EFFECT_RULES,
  // Twilight Diviner (Meren deck): "create a token that's a copy of one of them".
  ...COPY_ONE_OF_THEM_EFFECT_RULES,
  // Sliver Swarm deck, group D (issue 133): "Each player chooses a creature type."
  ...SLIVER_D_EFFECT_RULES,
  ...ADDITIONAL_LAND_EFFECT_RULES,
  ...RAMP_LANDS_EFFECT_RULES,
  ...MOVE_COUNTERS_EFFECT_RULES,
  ...COUNTER_CHOICE_RULES,
  ...SEARCH_PAIR_RULES,
  ...ENCHANTED_PLAYER_EFFECT_RULES,
  // Issue 160 (D-628): "Each player gains control of all creatures they own."
  ...RETURN_CONTROL_EFFECT_RULES,
  ...CONTROL_EFFECT_RULES,
  // Stage P44 (D-195): "starting with you, each player votes for profit or security".
  ...VOTE_EFFECT_RULES,
  // Stage P45 (D-197): "The Ring tempts you."
  ...RING_EFFECT_RULES,
  ...PLANESWALKER_EFFECT_RULES,
  EFFECT_DAMAGE_BY_IT,
  EFFECT_DAMAGE_IT,
  // Aetherdrift energy deck (issue 105): "destroy each permanent chosen this way", whose first words are those of `effect.destroy`.
  ...EACH_PLAYER_CHOOSES_RULES,
  EFFECT_DESTROY,
  // Stage P70 (D-278): "exile them, then meld them into X" starts like a plain exile and is tried before it.
  ...MELD_EFFECT_RULES,
  // The flicker sentence starts like a plain exile and must be tried first: the first rule that
  // reads a prefix of the text wins, and no rule backtracks into another.
  ...FLICKER_RULES,
  // Issue 104: "exile a creature card from your graveyard" (a card the player chooses), before the plain exile of a target.
  ...GRAVEYARD_COPY_EFFECT_RULES,
  EFFECT_EXILE,
  // Witherbloom Witchcraft, group C (issue 190): "return it to the battlefield face down under its owner's control. It's a Forest land".
  ...WITHERBLOOM_C_EARLY_EFFECT_RULES,
  EFFECT_RETURN,
  // Before the plain counter: its phrase is a prefix of this one.
  EFFECT_COUNTER_UNLESS,
  EFFECT_COUNTER,
  EFFECT_COPY_SPELL,
  // Stage P38 (D-182): changing the target of a spell or ability with a single target.
  EFFECT_CHANGE_TARGET,
  // Stage P33 (D-150): proliferate, an exile for each opponent, and the sentences about the ability before them.
  ...QUANDRIX_D1_EFFECT_RULES,
  ...ANGEL_EFFECT_RULES,
  ...QUANDRIX_E_EFFECT_RULES,
  ...WITHERBLOOM_A_EFFECT_RULES,
  // Federation Fleet deck, group B: "each player reveals the top card of their library, then draws a card. For each nonland card revealed this way, put a +1/+1 counter on ~."
  ...PARLEY_EFFECT_RULES,
  // Issue 144 (Throne of Eldraine): the two sentences that restrict mana to the chosen color.
  ...THRONE_EFFECT_RULES,
  // CR 106.6 (Jegantha, the Wellspring): "This mana can't be spent to pay generic mana costs."
  ...MANA_NOT_GENERIC_EFFECT_RULES,
  // D-362 (Hashaton, group 8): "Choose target creature card in your graveyard.", before `effect.choose-target` of the Vraska rules, which reads "choose target creature".
  ...HASHATON_G8_EFFECT_RULES,
  // D-385 (Hashaton, group 5): "for each token you control of the chosen type that entered this turn, create a token that's a copy of it", before the "for each" rules of the Vraska rules.
  ...HASHATON_G5_EFFECT_RULES,
  // Stage P50 (D-207): "remove all counters from it".
  ...VRASKA_EFFECT_RULES,
  // Stage P69 (D-256, D-257): the Bruna deck, "Do this only once each turn" and "pay {X}, where X is less than or equal to the amount of life you gained".
  ...BRUNA_EFFECT_RULES,
  // D-270: "return the exiled cards to their owners' hands" (Angel of Serenity).
  ...CROSS_ZONE_EFFECT_RULES,
  // Stage P69 (D-271): rolling a die, "roll a four-sided die".
  ...ARDEN_EFFECT_RULES,
  // Stage P69 (D-276): "It gains \"You can't lose the game and your opponents can't win the game.\"" with no duration.
  ...GRANTED_STATIC_EFFECT_RULES,
  // Stage P69 (D-272): Dawnbreak Reclaimer, "choose a creature card in an opponent's graveyard, then that player chooses ...".
  ...DAWNBREAK_EFFECT_RULES,
  // Stage P68 (D-229): the Hofri Ghostforge deck.
  ...HOFRI_EFFECT_RULES,
  // Issue 258 (D-585): "Target player adds three mana of the chosen color for each artifact sacrificed this way", the sentence after "Choose a color.".
  ...CHOSEN_COLOR_MANA_EFFECT_RULES,
  // CR 105.2, 605.3b (Faeburrow Elder): "for each color among permanents you control, add one mana of that color".
  ...COLORS_AMONG_MANA_EFFECT_RULES,
  // Gisa deck, group 3 (issue 41, D-484): "each opponent chooses a permanent they control of each permanent type and sacrifices the rest".
  ...GISA_G3_EFFECT_RULES,
  // Witherbloom Witchcraft, group C (issue 190): "for each permanent type, return up to one card of that type from your graveyard to the battlefield".
  ...WITHERBLOOM_C_EFFECT_RULES,
  // D-393, D-394 (Hashaton, group 9): the body of Rona, Tolarian Obliterator.
  ...HASHATON_G9_EFFECT_RULES,
  ...DANITHA_G1B_EFFECT_RULES,
  // Death Toll deck, group B: "choose a card at random in your graveyard", "return two creature cards at random from your graveyard to the battlefield".
  ...DEATH_TOLL_B_EFFECT_RULES,
  // Issue 26 (D-411): "you may put a land card from among them into your hand" after a mill.
  ...DANITHA_G2_EFFECT_RULES,
  // Galadriel deck, group 2 (D-542): "put up to two land cards from among them into your hand".
  ...GALADRIEL_G2_EFFECT_RULES,
  ...DANITHA_G4_EFFECT_RULES,
  // Ashling, the Limitless: "The token gains haste until end of turn."
  ...THE_TOKEN_EFFECT_RULES,
  // Food and Fellowship deck, group B (Motivated Pony): "..., untap those creatures and they get an additional +2/+2 until end of turn."
  ...PUMP_THOSE_EFFECT_RULES,
  ...PUMP_UNBLOCKABLE_EFFECT_RULES,
  ...COPY_CHOSEN_TOKEN_EFFECT_RULES,
  // Issue 27 (D-445, D-446): "Monstrosity 5" and the second damage of "~ deals 4 damage to X and 2 damage to Y".
  ...FEATHER_G2_EFFECT_RULES,
  // Issue 41 (D-481): "you may have target player lose life equal to the number of Zombies on the battlefield".
  ...GISA_G5_EFFECT_RULES,
  // Issue 144: "you may have ~ deal 1 damage to target player or planeswalker".
  ...HAVE_DAMAGE_EFFECT_RULES,
  // Feather deck, group 1 (issue 27, D-451, D-457): protection for the turn (before `effect.gain-keyword`, which refuses it) and "Until end of turn, double target creature's power and it gains first strike.".
  ...FEATHER_G1_EFFECT_RULES,
  // D-303: "Reveal the top five cards of your library. An opponent separates those cards into two piles. ..." (three sentences kept together).
  ...PILES_EFFECT_RULES,
  // D-396 (CR 701.20a): "Reveal the top five cards of your library. You may put a creature or enchantment card from among them into your hand. Put the rest into your graveyard."
  ...REVEAL_TAKE_EFFECT_RULES,
  ...LOOK_ELSE_EFFECT_RULES,
  ...LIBRARY_TOP_EFFECT_RULES,
  // Stage P31 (D-140): before `effect.tap`, which reads "tap" and stops at the count.
  ...ARTIFACT_EFFECT_RULES,
  EFFECT_TAP,
  EFFECT_UNTAP,
  EFFECT_ADD_ADDITIONAL_MANA,
  EFFECT_CONTROLLER_ADDS_ADDITIONAL_MANA,
  // Mirari's Wake, Vorinclex: "add one mana of any type that land produced", before `effect.add-mana`.
  ...PRODUCED_TYPE_MANA_EFFECT_RULES,
  EFFECT_ADD_MANA,
  // The sentence before "Add an amount of mana of that color equal to your devotion to that color" (Nykthos, Shrine to Nyx).
  EFFECT_CHOOSE_COLOR,
  EFFECT_CHOOSE_CREATURE_TYPE,
  // Before `effect.player` and `effect.draw`: "you draw a card" is a prefix of the delayed draw (stage P26).
  ...DELAYED_RULES,
  EFFECT_PLAYER,
  EFFECT_DRAW,
  // Before `effect.discard`: "discard their hand" has no number of cards.
  EFFECT_DISCARD_HAND,
  EFFECT_DISCARD,
  EFFECT_LIFE,
  EFFECT_PLAYER_LOCK,
  EFFECT_PLAYER_PROTECTION,
  EFFECT_MANIFEST,
  EFFECT_MILL,
  EFFECT_SHUFFLE,
  ...SACRIFICE_RULES,
  // Federation Fleet deck, group A (Seek out): "one or two target creatures each get ... and gain ...", counters on two optional targets (read quietly: they share words with the
  // older counter and pump rules and must not move where a line they do not read stops).
  ...SEEK_OUT_EFFECT_RULES,
  // Federation Fleet deck, group E (Unification, U.S.S. Stargazer): the owner draws then shuffles the creature in; the delayed exile of a token at end of combat.
  ...FLEET_E_EFFECT_RULES,
  // Extra turns (CR 500.7): "Take an extra turn after this one."
  ...EXTRA_TURN_EFFECT_RULES,
  // Federation Fleet deck, group F: "Until your next turn, creatures can't attack you.", the delayed return of two exiled cards, a commander into the hand, Tuvok's choice of attackers,
  // Troi's free cast (read quietly, as the rules around them).
  ...FEDERATION_F_EFFECT_RULES,
  // Abzan Armor deck, group A: "can attack this turn as though it didn't have defender", "assigns combat damage equal to its toughness rather than its power".
  ...COMBAT_RULE_EFFECT_RULES,
  ...COUNTER_RULES,
  ...TOKEN_EFFECT_RULES,
  ...PUMP_RULES,
  ...GAIN_RULES,
  ...RESTRICT_RULES,
  ...BECOMES_RULES,
  ...GROUP_BASE_PT_RULES,
  ...GROUP_BASE_PT_SOURCE_RULES,
  ...SEARCH_RULES,
  ...PREVENT_RULES,
  ...TRANSFORM_RULES,
  ...ATTACH_RULES,
  ...LIBRARY_RULES,
  ...PUT_RULES,
  ...RECURSION_EFFECT_RULES,
  ...REGENERATE_RULES,
  EFFECT_PAY,
  // Aetherdrift energy deck (issue 105): "pay one or more {E}".
  EFFECT_PAY_ENERGY_ANY,
];
