/**
 * SYNTHETIC CARDS. NOT REAL MAGIC CARDS.
 *
 * Every card here is invented for engine tests that need a behavior no simple real card has.
 * Names start with "SYNTHETIC " so they can never be mistaken for, or collide with,
 * real data, and they are kept out of FIXTURE_CARDS. oracleId is null. Their text describes
 * what the AST does; it is not Oracle text. Never show these to a player as real cards.
 */
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';
import { SYNTHETIC_ABILITY_LIST } from './synthetic-abilities';
import { SYNTHETIC_ABILITY_COSTS_LIST } from './synthetic-ability-costs';
import { SYNTHETIC_ADAMANTOISE_LIST } from './synthetic-adamantoise';
import { SYNTHETIC_ALT_COST_LIST } from './synthetic-alt-costs';
import { SYNTHETIC_AMOUNT_LIST } from './synthetic-amounts';
import { SYNTHETIC_ANGELS_SHAPES_LIST } from './synthetic-angels-shapes';
import { SYNTHETIC_ANGELS_STATICS_LIST } from './synthetic-angels-statics';
import { SYNTHETIC_ASCEND_LIST } from './synthetic-ascend';
import { SYNTHETIC_ATTACHMENT_LIST } from './synthetic-attachments';
import { SYNTHETIC_ATTACK_BATCH_LIST } from './synthetic-attack-batch';
import { SYNTHETIC_ATTACK_LIMIT_LIST } from './synthetic-attack-limits';
import { SYNTHETIC_BATCH_LIST } from './synthetic-batch';
import { SYNTHETIC_BIG_DISCOUNT_LIST } from './synthetic-big-discount';
import { SYNTHETIC_BITE_EXCESS_LIST } from './synthetic-bite-excess';
import { SYNTHETIC_BOOK_EXALTED_LIST } from './synthetic-book-exalted';
import { SYNTHETIC_BRUNA_SEARCH_LIST } from './synthetic-bruna-search';
import { SYNTHETIC_CASTING_TARGETS_LIST } from './synthetic-casting-targets';
import { SYNTHETIC_CHOOSE_ONE_LIST } from './synthetic-choose-one';
import { SYNTHETIC_CHOSEN_LIST } from './synthetic-chosen';
import { SYNTHETIC_COMBAT_LIST } from './synthetic-combat';
import { SYNTHETIC_COMMANDER_TRIGGER_LIST } from './synthetic-commander-triggers';
import { SYNTHETIC_COMMANDER_LIST } from './synthetic-commanders';
import { SYNTHETIC_CONTROL_LIST } from './synthetic-control';
import { SYNTHETIC_COPY_LIST } from './synthetic-copies';
import { SYNTHETIC_COST_LIST } from './synthetic-costs';
import { SYNTHETIC_CROSS_ZONE_LIST } from './synthetic-cross-zone';
import { SYNTHETIC_DAMAGE_ORDER_LIST } from './synthetic-damage-order';
import { SYNTHETIC_DANITHA_G1A_LIST } from './synthetic-danitha-g1a';
import { SYNTHETIC_DANITHA_G1B_LIST } from './synthetic-danitha-g1b';
import { SYNTHETIC_DANITHA_G2_LIST } from './synthetic-danitha-g2';
import { SYNTHETIC_DANITHA_G3_LIST } from './synthetic-danitha-g3';
import { SYNTHETIC_DANITHA_G4_LIST } from './synthetic-danitha-g4';
import { SYNTHETIC_DANITHA_G5_LIST } from './synthetic-danitha-g5';
import { SYNTHETIC_DANITHA_G6_LIST } from './synthetic-danitha-g6';
import { SYNTHETIC_DANITHA_G7_LIST } from './synthetic-danitha-g7';
import { SYNTHETIC_DAWNBREAK_LIST } from './synthetic-dawnbreak';
import { SYNTHETIC_DELAYED_RETURN_LIST } from './synthetic-delayed-return';
import { SYNTHETIC_DESTROY_PER_OPPONENT_LIST } from './synthetic-destroy-per-opponent';
import { SYNTHETIC_DEVOTION_MANA_LIST } from './synthetic-devotion-mana';
import { SYNTHETIC_DICE_LIST } from './synthetic-dice';
import { SYNTHETIC_DIES_RETURN_LIST } from './synthetic-dies-return';
import { SYNTHETIC_DIVIDE_LIST } from './synthetic-divide';
import { SYNTHETIC_DOUBLING_LIST } from './synthetic-doubling';
import { SYNTHETIC_DRAGONS_LIST } from './synthetic-dragons';
import { SYNTHETIC_EDHREC_LIST } from './synthetic-edhrec';
import { SYNTHETIC_ENTERS_GROUP_LIST } from './synthetic-enters-group';
import { SYNTHETIC_ESCALATE_LIST } from './synthetic-escalate';
import { SYNTHETIC_FEATHER_G1_LIST } from './synthetic-feather-g1';
import { SYNTHETIC_FEATHER_G2_LIST } from './synthetic-feather-g2';
import { SYNTHETIC_FEATHER_G3_LIST } from './synthetic-feather-g3';
import { SYNTHETIC_FETCH_GRANTS_LIST } from './synthetic-fetch-grants';
import { SYNTHETIC_FIGHT_LIST } from './synthetic-fight';
import { SYNTHETIC_FOLLOWUP_LIST } from './synthetic-followups';
import { SYNTHETIC_FREE_CAST_LIST } from './synthetic-free-cast';
import { SYNTHETIC_GIFT_LIST } from './synthetic-gift';
import { SYNTHETIC_GISA_G2_LIST } from './synthetic-gisa-g2';
import { SYNTHETIC_GRAVEYARD_LIST } from './synthetic-graveyard';
import { SYNTHETIC_GREATEST_LIST } from './synthetic-greatest';
import { SYNTHETIC_HASHATON_G1_LIST } from './synthetic-hashaton-g1';
import { SYNTHETIC_HASHATON_G2_LIST } from './synthetic-hashaton-g2';
import { SYNTHETIC_HASHATON_G3_LIST } from './synthetic-hashaton-g3';
import { SYNTHETIC_HASHATON_G5_LIST } from './synthetic-hashaton-g5';
import { SYNTHETIC_HASHATON_G6_LIST } from './synthetic-hashaton-g6';
import { SYNTHETIC_HASHATON_G7_LIST } from './synthetic-hashaton-g7';
import { SYNTHETIC_HASHATON_G8_LIST } from './synthetic-hashaton-g8';
import { SYNTHETIC_HASHATON_G9_LIST } from './synthetic-hashaton-g9';
import { SYNTHETIC_HASHATON_G10_LIST } from './synthetic-hashaton-g10';
import { SYNTHETIC_HASHATON_GROUP_4_LIST } from './synthetic-hashaton-group-4';
import { SYNTHETIC_HOFRI_LIST } from './synthetic-hofri';
import { SYNTHETIC_KEYWORD_LIST } from './synthetic-keywords';
import { SYNTHETIC_KEYWORD2_LIST } from './synthetic-keywords-2';
import { SYNTHETIC_KICKER_LIST } from './synthetic-kicker';
import { SYNTHETIC_KORVOLD_KEYWORDS_LIST } from './synthetic-korvold-keywords';
import { SYNTHETIC_KORVOLD_SINGLES_LIST } from './synthetic-korvold-singles';
import { SYNTHETIC_KORVOLD_TRIGGERS_LIST } from './synthetic-korvold-triggers';
import { SYNTHETIC_LATER_LIST } from './synthetic-later';
import { SYNTHETIC_LAYER_LIST } from './synthetic-layers';
import { SYNTHETIC_LAYOUT_LIST } from './synthetic-layouts';
import { SYNTHETIC_LIBRARY_LIST } from './synthetic-library';
import { SYNTHETIC_LIBRARY_ARTIFACTS_LIST } from './synthetic-library-artifacts';
import { SYNTHETIC_LIFE_GAIN_LIST } from './synthetic-life-gain';
import { SYNTHETIC_LIVING_LIST } from './synthetic-living';
import { SYNTHETIC_LOSE_GAME_LIST } from './synthetic-lose-game';
import { SYNTHETIC_MANA_LIST } from './synthetic-mana';
import { SYNTHETIC_MANA_INSTEAD_LIST } from './synthetic-mana-instead';
import { SYNTHETIC_MANA_PLUS_LIST } from './synthetic-mana-plus';
import { SYNTHETIC_MANA_RESTRICTED_LIST } from './synthetic-mana-restricted';
import { SYNTHETIC_MANA_SPENT_LIST } from './synthetic-mana-spent';
import { SYNTHETIC_MANA_TRIGGERS_LIST } from './synthetic-mana-triggers';
import { SYNTHETIC_MANIFEST_LIST } from './synthetic-manifest';
import { SYNTHETIC_MASS_LIST } from './synthetic-mass';
import { SYNTHETIC_MELD_LIST } from './synthetic-meld';
import { SYNTHETIC_MIRACLE_LIST } from './synthetic-miracle';
import { SYNTHETIC_MODAL_LIST } from './synthetic-modal';
import { SYNTHETIC_NIV_DRAW_LIST } from './synthetic-niv-draw';
import { SYNTHETIC_NIV_GROUP_2B_B_LIST } from './synthetic-niv-group-2b-b';
import { SYNTHETIC_NIV_GROUP_3_A_LIST } from './synthetic-niv-group-3-a';
import { SYNTHETIC_NIV_GROUP_3_B_LIST } from './synthetic-niv-group-3-b';
import { SYNTHETIC_NIV_GROUP_3_C_LIST } from './synthetic-niv-group-3-c';
import { SYNTHETIC_NIV_PRIMITIVES_LIST } from './synthetic-niv-primitives';
import { SYNTHETIC_PARSER_SHAPES_LIST } from './synthetic-parser-shapes';
import { SYNTHETIC_PILES_LIST } from './synthetic-piles';
import { SYNTHETIC_PLANESWALKER_LIST } from './synthetic-planeswalkers';
import { SYNTHETIC_PLATE_LIST } from './synthetic-plate';
import { SYNTHETIC_PLAY_RULE_LIST } from './synthetic-play-rules';
import { SYNTHETIC_PLAYER_EFFECT_LIST } from './synthetic-player-effects';
import { SYNTHETIC_PLAYER_MORE_LIST } from './synthetic-player-more';
import { SYNTHETIC_POLYMORPH_LIST } from './synthetic-polymorph';
import { SYNTHETIC_PREVENTION_LIST } from './synthetic-prevention';
import { SYNTHETIC_PREVENTION_BY_LIST } from './synthetic-prevention-by';
import { SYNTHETIC_PRIDE_WALKER_LIST } from './synthetic-pride-walker';
import { SYNTHETIC_PT_LIST } from './synthetic-pt';
import { SYNTHETIC_RECURSION_LIST } from './synthetic-recursion';
import { SYNTHETIC_REFERENCE_LIST } from './synthetic-references';
import { SYNTHETIC_REPEATABLE_LIST } from './synthetic-repeatable';
import { SYNTHETIC_RESELECT_LIST } from './synthetic-reselect';
import { SYNTHETIC_RESTRICTION_LIST } from './synthetic-restrictions';
import { SYNTHETIC_REVEAL_LIST } from './synthetic-reveal';
import { SYNTHETIC_RING_LIST } from './synthetic-ring';
import { SYNTHETIC_SAGA_LIST } from './synthetic-sagas';
import { SYNTHETIC_SEARCH_LIST } from './synthetic-search';
import { SYNTHETIC_SNOW_LIST } from './synthetic-snow';
import { SYNTHETIC_SOULBOND_LIST } from './synthetic-soulbond';
import { SYNTHETIC_STATICS_ARTIFACTS_LIST } from './synthetic-statics-artifacts';
import { SYNTHETIC_STUN_LIST } from './synthetic-stun';
import { SYNTHETIC_SUBJECT_LIST } from './synthetic-subjects';
import { SYNTHETIC_TAP_ALT_LIST } from './synthetic-tap-alt';
import { SYNTHETIC_TAP_CHOICE_LIST } from './synthetic-tap-choice';
import { SYNTHETIC_TARGETING_LIST } from './synthetic-targeting';
import { SYNTHETIC_TRIGGER_TARGET_LIST } from './synthetic-trigger-targets';
import { SYNTHETIC_TRIGGER_LIST } from './synthetic-triggers';
import { SYNTHETIC_TRIGGER_MORE_LIST } from './synthetic-triggers-more';
import { SYNTHETIC_TURNLOG_LIST } from './synthetic-turnlog';
import { SYNTHETIC_UNTIL_LEAVES_LIST } from './synthetic-until-leaves';
import { SYNTHETIC_UPKEEP_LIST } from './synthetic-upkeep';
import { SYNTHETIC_VEHICLE_LIST } from './synthetic-vehicles';
import { SYNTHETIC_VOTE_LIST } from './synthetic-vote';
import { SYNTHETIC_VRASKA_LIST } from './synthetic-vraska';
import { SYNTHETIC_WARD_LIST } from './synthetic-ward';
import { SYNTHETIC_X_LIST } from './synthetic-x';

export const SYNTHETIC_PREFIX = 'SYNTHETIC ';

const CREATURE_TARGET = {
  what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
} as const;

const SYNTHETIC_LIST: readonly CardDefinition[] = [
  singleFace({
    name: 'SYNTHETIC Draw Three Gain Five',
    manaCost: ['2', 'U'],
    types: ['sorcery'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: 'Draw three cards, then you gain 5 life.',
    spell: {
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'draw', player: { kind: 'you' }, count: 3 },
          { kind: 'gainLife', player: { kind: 'you' }, amount: 5 },
        ],
      },
    },
  }),
  singleFace({
    name: 'SYNTHETIC Bolt Two',
    manaCost: ['R'],
    types: ['instant'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText: 'Deals 2 damage to each opponent, then you gain 2 life.',
    spell: {
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'dealDamage', amount: 2, to: { kind: 'eachOpponent' } },
          { kind: 'gainLife', player: { kind: 'you' }, amount: 2 },
        ],
      },
    },
  }),
  singleFace({
    name: 'SYNTHETIC Opponent Discards Two',
    manaCost: ['1', 'B'],
    types: ['sorcery'],
    colors: ['B'],
    colorIdentity: ['B'],
    oracleText: 'Target opponent discards two cards.',
    spell: {
      targets: [{ id: 't1', what: { kind: 'player', filter: 'opponent' } }],
      effect: { kind: 'discard', player: { kind: 'target', id: 't1' }, count: 2 },
    },
  }),
  singleFace({
    name: 'SYNTHETIC Wrath',
    manaCost: ['2', 'W', 'W'],
    types: ['sorcery'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText: 'Destroy all creatures.',
    spell: {
      effect: {
        kind: 'destroy',
        objects: { kind: 'each', filter: { zone: 'battlefield', types: ['creature'] } },
      },
    },
  }),
  singleFace({
    name: 'SYNTHETIC X Draw',
    manaCost: ['X', 'U'],
    types: ['instant'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: 'Draw X cards.',
    spell: { x: true, effect: { kind: 'draw', player: { kind: 'you' }, count: { kind: 'x' } } },
  }),
  singleFace({
    name: 'SYNTHETIC Modal Choice',
    manaCost: ['1', 'R'],
    types: ['instant'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText: 'Choose one: deals 3 damage to any target; or you gain 3 life.',
    spell: {
      chooseModes: { min: 1, max: 1 },
      modes: [
        {
          text: 'Deals 3 damage to any target.',
          targets: [{ id: 't1', what: { kind: 'anyTarget' } }],
          effect: { kind: 'dealDamage', amount: 3, to: { kind: 'target', id: 't1' } },
        },
        {
          text: 'You gain 3 life.',
          effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 3 },
        },
      ],
    },
  }),
  singleFace({
    name: 'SYNTHETIC Pinger',
    manaCost: ['1', 'R'],
    types: ['creature'],
    subtypes: ['Construct'],
    colors: ['R'],
    colorIdentity: ['R'],
    power: 1,
    toughness: 1,
    oracleText: '{T}: Deals 1 damage to any target.',
    abilities: [
      {
        kind: 'activated',
        cost: [{ kind: 'tap' }],
        targets: [{ id: 't1', what: { kind: 'anyTarget' } }],
        effect: { kind: 'dealDamage', amount: 1, to: { kind: 'target', id: 't1' } },
      },
    ],
  }),
  singleFace({
    name: 'SYNTHETIC Flying Lifelinker',
    manaCost: ['1', 'W'],
    types: ['creature'],
    subtypes: ['Construct'],
    colors: ['W'],
    colorIdentity: ['W'],
    power: 1,
    toughness: 2,
    oracleText: 'Flying, lifelink',
    abilities: [
      { kind: 'keyword', keyword: { kind: 'flying' } },
      { kind: 'keyword', keyword: { kind: 'lifelink' } },
    ],
  }),
  singleFace({
    name: 'SYNTHETIC Welcome Gain Three',
    manaCost: ['1', 'G'],
    types: ['creature'],
    subtypes: ['Construct'],
    colors: ['G'],
    colorIdentity: ['G'],
    power: 2,
    toughness: 2,
    oracleText: 'When this creature enters, you gain 3 life.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
        effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 3 },
      },
    ],
  }),
  singleFace({
    name: 'SYNTHETIC Tapped Land',
    manaCost: null,
    types: ['land'],
    colors: [],
    colorIdentity: ['G'],
    oracleText: 'This land enters tapped. {T}: Add {G}.',
    abilities: [
      { kind: 'replacement', replacement: { kind: 'entersTapped' } },
      { kind: 'mana', cost: [{ kind: 'tap' }], production: { kind: 'fixed', mana: ['G'] } },
    ],
  }),
  singleFace({
    name: 'SYNTHETIC Shrink',
    manaCost: ['B'],
    types: ['instant'],
    colors: ['B'],
    colorIdentity: ['B'],
    oracleText: 'Target creature gets -2/-2 until end of turn.',
    spell: {
      targets: [{ id: 't1', ...CREATURE_TARGET }],
      effect: {
        kind: 'modifyPt',
        objects: { kind: 'target', id: 't1' },
        power: -2,
        toughness: -2,
        duration: 'untilEndOfTurn',
      },
    },
  }),
];

/** Every SYNTHETIC card of every fixture list, in registration order (a list may appear twice; a name may not belong to two different cards). */
export const SYNTHETIC_ALL_LIST: readonly CardDefinition[] = [
  ...SYNTHETIC_LIST,
  ...SYNTHETIC_RECURSION_LIST,
  ...SYNTHETIC_GIFT_LIST,
  ...SYNTHETIC_GRAVEYARD_LIST,
  ...SYNTHETIC_COMBAT_LIST,
  ...SYNTHETIC_MANA_LIST,
  ...SYNTHETIC_TRIGGER_LIST,
  ...SYNTHETIC_TRIGGER_TARGET_LIST,
  ...SYNTHETIC_ABILITY_LIST,
  ...SYNTHETIC_TARGETING_LIST,
  ...SYNTHETIC_SEARCH_LIST,
  ...SYNTHETIC_ATTACHMENT_LIST,
  ...SYNTHETIC_KICKER_LIST,
  ...SYNTHETIC_LAYER_LIST,
  ...SYNTHETIC_WARD_LIST,
  ...SYNTHETIC_FOLLOWUP_LIST,
  ...SYNTHETIC_VEHICLE_LIST,
  ...SYNTHETIC_PREVENTION_LIST,
  ...SYNTHETIC_DAMAGE_ORDER_LIST,
  ...SYNTHETIC_LAYOUT_LIST,
  ...SYNTHETIC_MANIFEST_LIST,
  ...SYNTHETIC_MELD_LIST,
  ...SYNTHETIC_SAGA_LIST,
  ...SYNTHETIC_LIBRARY_LIST,
  ...SYNTHETIC_REFERENCE_LIST,
  ...SYNTHETIC_RESTRICTION_LIST,
  ...SYNTHETIC_COST_LIST,
  ...SYNTHETIC_CROSS_ZONE_LIST,
  ...SYNTHETIC_MANA_PLUS_LIST,
  ...SYNTHETIC_CHOSEN_LIST,
  ...SYNTHETIC_X_LIST,
  ...SYNTHETIC_KEYWORD_LIST,
  ...SYNTHETIC_KEYWORD2_LIST,
  ...SYNTHETIC_TRIGGER_MORE_LIST,
  ...SYNTHETIC_MODAL_LIST,
  ...SYNTHETIC_REPEATABLE_LIST,
  ...SYNTHETIC_PT_LIST,
  ...SYNTHETIC_ALT_COST_LIST,
  ...SYNTHETIC_AMOUNT_LIST,
  ...SYNTHETIC_ANGELS_SHAPES_LIST,
  ...SYNTHETIC_ANGELS_STATICS_LIST,
  ...SYNTHETIC_LIFE_GAIN_LIST,
  ...SYNTHETIC_LOSE_GAME_LIST,
  ...SYNTHETIC_DICE_LIST,
  ...SYNTHETIC_PLAYER_MORE_LIST,
  ...SYNTHETIC_DEVOTION_MANA_LIST,
  ...SYNTHETIC_DAWNBREAK_LIST,
  ...SYNTHETIC_ATTACK_BATCH_LIST,
  ...SYNTHETIC_ENTERS_GROUP_LIST,
  ...SYNTHETIC_COMMANDER_TRIGGER_LIST,
  ...SYNTHETIC_MANA_RESTRICTED_LIST,
  ...SYNTHETIC_NIV_GROUP_2B_B_LIST,
  ...SYNTHETIC_HASHATON_G1_LIST,
  ...SYNTHETIC_NIV_GROUP_3_A_LIST,
  ...SYNTHETIC_NIV_GROUP_3_B_LIST,
  ...SYNTHETIC_NIV_GROUP_3_C_LIST,
  ...SYNTHETIC_HASHATON_G6_LIST,
  ...SYNTHETIC_HASHATON_G5_LIST,
  ...SYNTHETIC_HASHATON_G7_LIST,
  ...SYNTHETIC_HASHATON_G3_LIST,
  ...SYNTHETIC_HASHATON_G8_LIST,
  ...SYNTHETIC_HASHATON_GROUP_4_LIST,
  ...SYNTHETIC_DANITHA_G4_LIST,
  ...SYNTHETIC_DANITHA_G5_LIST,
  ...SYNTHETIC_DANITHA_G6_LIST,
  ...SYNTHETIC_DANITHA_G7_LIST,
  ...SYNTHETIC_FEATHER_G2_LIST,
  ...SYNTHETIC_HASHATON_G10_LIST,
  ...SYNTHETIC_HASHATON_G9_LIST,
  ...SYNTHETIC_DANITHA_G1A_LIST,
  ...SYNTHETIC_DANITHA_G1B_LIST,
  ...SYNTHETIC_DANITHA_G2_LIST,
  ...SYNTHETIC_DANITHA_G3_LIST,
  ...SYNTHETIC_FEATHER_G3_LIST,
  ...SYNTHETIC_FEATHER_G1_LIST,
  ...SYNTHETIC_GISA_G2_LIST,
  ...SYNTHETIC_UNTIL_LEAVES_LIST,
  ...SYNTHETIC_DESTROY_PER_OPPONENT_LIST,
  ...SYNTHETIC_HOFRI_LIST,
  ...SYNTHETIC_TAP_ALT_LIST,
  ...SYNTHETIC_PLAYER_EFFECT_LIST,
  ...SYNTHETIC_PLAY_RULE_LIST,
  ...SYNTHETIC_UPKEEP_LIST,
  ...SYNTHETIC_ASCEND_LIST,
  ...SYNTHETIC_BOOK_EXALTED_LIST,
  ...SYNTHETIC_LATER_LIST,
  ...SYNTHETIC_MIRACLE_LIST,
  ...SYNTHETIC_DELAYED_RETURN_LIST,
  ...SYNTHETIC_DIES_RETURN_LIST,
  ...SYNTHETIC_SOULBOND_LIST,
  ...SYNTHETIC_COPY_LIST,
  ...SYNTHETIC_NIV_PRIMITIVES_LIST,
  ...SYNTHETIC_NIV_DRAW_LIST,
  ...SYNTHETIC_SUBJECT_LIST,
  ...SYNTHETIC_MASS_LIST,
  ...SYNTHETIC_GREATEST_LIST,
  ...SYNTHETIC_LIVING_LIST,
  ...SYNTHETIC_VRASKA_LIST,
  ...SYNTHETIC_EDHREC_LIST,
  ...SYNTHETIC_PLATE_LIST,
  ...SYNTHETIC_ABILITY_COSTS_LIST,
  ...SYNTHETIC_BATCH_LIST,
  ...SYNTHETIC_RESELECT_LIST,
  ...SYNTHETIC_CHOOSE_ONE_LIST,
  ...SYNTHETIC_TAP_CHOICE_LIST,
  ...SYNTHETIC_TURNLOG_LIST,
  ...SYNTHETIC_FETCH_GRANTS_LIST,
  ...SYNTHETIC_CASTING_TARGETS_LIST,
  ...SYNTHETIC_MANA_SPENT_LIST,
  ...SYNTHETIC_KORVOLD_TRIGGERS_LIST,
  ...SYNTHETIC_KORVOLD_KEYWORDS_LIST,
  ...SYNTHETIC_KORVOLD_SINGLES_LIST,
  ...SYNTHETIC_CONTROL_LIST,
  ...SYNTHETIC_ADAMANTOISE_LIST,
  ...SYNTHETIC_VOTE_LIST,
  ...SYNTHETIC_RING_LIST,
  ...SYNTHETIC_SNOW_LIST,
  ...SYNTHETIC_BRUNA_SEARCH_LIST,
  ...SYNTHETIC_PLANESWALKER_LIST,
  ...SYNTHETIC_PRIDE_WALKER_LIST,
  ...SYNTHETIC_MANA_TRIGGERS_LIST,
  ...SYNTHETIC_LIBRARY_ARTIFACTS_LIST,
  ...SYNTHETIC_STATICS_ARTIFACTS_LIST,
  ...SYNTHETIC_COMMANDER_LIST,
  ...SYNTHETIC_STUN_LIST,
  ...SYNTHETIC_FREE_CAST_LIST,
  ...SYNTHETIC_DIVIDE_LIST,
  ...SYNTHETIC_FIGHT_LIST,
  ...SYNTHETIC_PARSER_SHAPES_LIST,
  ...SYNTHETIC_REVEAL_LIST,
  ...SYNTHETIC_BIG_DISCOUNT_LIST,
  ...SYNTHETIC_ESCALATE_LIST,
  ...SYNTHETIC_BITE_EXCESS_LIST,
  ...SYNTHETIC_PREVENTION_BY_LIST,
  ...SYNTHETIC_DOUBLING_LIST,
  ...SYNTHETIC_POLYMORPH_LIST,
  ...SYNTHETIC_MANA_INSTEAD_LIST,
  ...SYNTHETIC_ATTACK_LIMIT_LIST,
  ...SYNTHETIC_DRAGONS_LIST,
  ...SYNTHETIC_PILES_LIST,
  ...SYNTHETIC_HASHATON_G2_LIST,
];

export const SYNTHETIC_CARDS: Readonly<Record<string, CardDefinition>> = Object.fromEntries(
  SYNTHETIC_ALL_LIST.map((card) => [card.name, card]),
);

/** Looks up a SYNTHETIC card by exact name; throws on an unknown name. */
export function syntheticCard(name: string): CardDefinition {
  const card = Object.hasOwn(SYNTHETIC_CARDS, name) ? SYNTHETIC_CARDS[name] : undefined;
  if (card === undefined) throw new Error(`Unknown synthetic card: ${name}`);
  return card;
}
