/**
 * Condition rules: a test on the game, as a replacement effect applies while a permanent enters
 * (CR 614.12) and as the word "unless" asks for ("~ enters tapped unless you control two or more
 * other lands"). The count of permanents or opponents is what the engine can check (`controlsAtLeast`,
 * `opponentsAtLeast`); a condition about anything else is not read.
 */

import { BASIC_LAND_TYPES } from '@commander-arena/engine';
import {
  choice,
  fail,
  literal,
  map,
  type Parser,
  pattern,
  satisfy,
  separatedBy1,
  sequence,
} from '../../combinators';
import type { IrAmount, IrCondition, IrFilter, IrNoun, Span } from '../../ir/types';
import { quantity } from '../amount/index';
import { permanentPhrase, withoutZone } from '../noun/phrases';
import { defineRule, spanned } from '../registry';
import { CONDITION_ADDITIONAL_COST_PAID } from './additional-cost-paid';
import { ANGEL_CONDITION_RULES } from './angels';
import { ARDEN_CONDITION_RULES } from './arden';
import { ARTIFACT_CONDITION_RULES } from './artifacts';
import { ATTACKING_OPPONENTS_CONDITION_RULES } from './attacking-opponents';
import { BRUNA_CONDITION_RULES } from './bruna';
import { CONDITION_CAST_IN_OWN_MAIN_PHASE } from './cast-phase';
import { CHOOSER_CONDITION_RULES } from './choosers';
import { COUNTER_COUNT_CONDITION_RULES } from './counter-count';
import { COUNTER_TRIGGER_CONDITION_RULES } from './counter-triggers';
import { DANITHA_G1B_CONDITION_RULES } from './danitha-g1b';
import { DANITHA_G2_CONDITION_RULES, DANITHA_G2_LATE_CONDITION_RULES } from './danitha-g2';
import { DANITHA_G3_CONDITION_RULES } from './danitha-g3';
import { DEATH_TOLL_B_CONDITION_RULES } from './death-toll-b';
import { DEATH_TOLL_D_CONDITION_RULES } from './death-toll-d';
import { DINOSAUR_CONDITION_RULES } from './dinosaurs';
import { DRAGON_CONDITION_RULES } from './dragons';
import { EDHREC_CONDITION_RULES } from './edhrec';
import { ENTERED_FROM_GRAVEYARD_CONDITION_RULES } from './entered-from-graveyard';
import { CONDITION_UNLESS_ESCAPED } from './escaped';
import { EXILED_WITH_CONDITION_RULES } from './exiled-with';
import { EXPERIENCE_CONDITION_RULES } from './experience';
import { FEDERATION_D_CONDITION_RULES } from './federation-d';
import { GALADRIEL_G1_CONDITION_RULES } from './galadriel-g1';
import { GAME_STATE_CONDITION_RULES } from './game-state';
import { GISA_G1_CONDITION_RULES } from './gisa-g1';
import { HOFRI_CONDITION_RULES } from './hofri';
import { HYLDA_G1_CONDITION_RULES } from './hylda-g1';
import { HYLDA_G2_CONDITION_RULES } from './hylda-g2';
import { CONDITION_IF_YOU_DO } from './if-you-do';
import { IT_ON_BATTLEFIELD_CONDITION_RULES } from './it-on-battlefield';
import { JESKAI_CASTFREE_CONDITION_RULES } from './jeskai-castfree';
import { CONDITION_KICKED } from './kicked';
import { KORVOLD_CONDITION_RULES } from './korvold';
import { LIBRARY_CONDITION_RULES } from './library';
import { LOREHOLD_G1_CONDITION_RULES } from './lorehold-g1';
import { LOREHOLD_G3_CONDITION_RULES } from './lorehold-g3';
import { MARDU_SURGE_CONDITION_RULES } from './mardu-surge';
import { MELD_CONDITION_RULES } from './meld';
import { NIV_CONDITION_RULES } from './niv';
import { NO_COUNTERS_CONDITION_RULES } from './no-counters';
import { PRISMARI_G2_CONDITION_RULES } from './prismari-g2';
import { PRISMARI_G3_CONDITION_RULES } from './prismari-g3';
import { QUANDRIX_G_CONDITION_RULES } from './quandrix-g';
import { RECURSION_CONDITION_RULES } from './recursion';
import { REVOLT_CONDITION_RULES } from './revolt';
import { RING_TEMPTED_CONDITION_RULES } from './ring-tempted';
import { SELF_STATE_CONDITION_RULES } from './self-state';
import { SPELLS_CAST_CONDITION_RULES } from './spells-cast';
import { CONDITION_THAT_OBJECT_POWER } from './that-object-power';
import { THE_PLAYER_CONDITION_RULES } from './the-player';
import { THEY_ATTACKED_YOU_CONDITION_RULES } from './they-attacked-you';
import { UNBOUND_I_CONDITION_RULES } from './unbound-i';
import { CONDITION_UNLESS_PAYS } from './unless';
import { VRASKA_CONDITION_RULES } from './vraska';
import { CONDITION_X_AT_LEAST } from './x-at-least';

function amountOf(count: { value: number; span: Span }): IrAmount {
  return { kind: 'number', value: count.value, span: count.span };
}

function permanents(
  rule: string,
  span: Span,
  filter: IrFilter,
  other: boolean,
  plural: boolean,
): IrNoun {
  return { kind: 'noun', det: 'a', filter, upTo: false, plural, other, span, rule };
}

function condition(rule: string, span: Span, test: IrCondition['test']): IrCondition {
  return { kind: 'condition', test, span, rule };
}

/** The plural of each basic land type (CR 205.3i): "Plains" is its own plural. */
const LAND_TYPE_PLURALS: Readonly<Record<string, string>> = {
  Plains: 'Plains',
  Island: 'Islands',
  Swamp: 'Swamps',
  Mountain: 'Mountains',
  Forest: 'Forests',
};

/**
 * "Islands", "Forests", "Plains": every permanent with that basic land type (a Breeding Pool is an
 * Island, CR 305.6). Capitalized, as subtypes are written (CR 205.3).
 */
const LAND_TYPE_PLURAL: Parser<IrFilter> = (ctx, pos) => {
  for (const [type, plural] of Object.entries(LAND_TYPE_PLURALS)) {
    const r = pattern(new RegExp(`${plural}(?![\\p{L}\\p{N}])`, 'u'))(ctx, pos);
    if (r.ok) return { ok: true, value: { subtypes: [type], raw: plural }, pos: r.pos };
  }
  return fail(ctx, pos);
};

/** "<N> or more|fewer [other] <plural permanent phrase>": the count and what is counted. */
function counted(
  word: 'more' | 'fewer',
): Parser<{ count: { value: number; span: Span }; other: boolean; filter: IrFilter }> {
  return map(
    sequence(
      spanned(satisfy(quantity, (n) => n >= 1)),
      literal(` or ${word} `),
      choice(
        map(literal('other '), () => true),
        map(literal(''), () => false),
      ),
      choice(map(permanentPhrase(true, 'notBasicLand'), withoutZone), LAND_TYPE_PLURAL),
    ),
    ([count, , other, filter]) => ({ count, other, filter }),
  );
}

/**
 * `condition.control-at-least`: "you control two or more basic lands", "you control two or more
 * other lands" (CR 614.12; "other" is every permanent but this one, CR 109.1).
 */
export const CONDITION_CONTROL_AT_LEAST = defineRule<IrCondition>({
  id: 'condition.control-at-least',
  family: 'condition',
  leading: ['you'],
  cites: ['CR 614.12 (Replacement Effects)', 'CR 205.4a (Supertypes)', 'CR 109.1 (Objects)'],
  examples: [
    'you control two or more basic lands',
    'you control two or more other lands',
    'you control three or more artifacts',
    'you control three or more other Islands',
    'you control two or more Plains',
    'you control two or more Dragons',
  ],
  rejects: [
    'you control a land',
    'you control two lands',
    'you control two or fewer other lands',
    'you control two or more',
    'you control two or more Island',
    'you control two or more islands',
    'an opponent controls two or more lands',
  ],
  parse: (ctx, pos) => {
    const r = sequence(literal('you control '), counted('more'))(ctx, pos);
    if (!r.ok) return r;
    const { count, other, filter } = r.value[1];
    const span = { start: pos, end: r.pos };
    const noun = permanents('condition.control-at-least', span, filter, other, true);
    const test = { kind: 'control' as const, noun, atLeast: amountOf(count) };
    return { ok: true, value: condition('condition.control-at-least', span, test), pos: r.pos };
  },
});

/**
 * `condition.control-a`: "you control a legendary creature", "you control a basic land", "you
 * control an artifact": one permanent that matches, at least one (CR 614.12, 603.4). A phrase that
 * names a controller of its own ("a creature you don't control") or a basic land type (that is
 * `condition.control-land-type`) is not this.
 */
export const CONDITION_CONTROL_A = defineRule<IrCondition>({
  id: 'condition.control-a',
  family: 'condition',
  leading: ['you'],
  cites: ['CR 614.12 (Replacement Effects)', 'CR 603.4 (Handling Triggered Abilities)'],
  examples: [
    'you control a legendary creature',
    'you control a basic land',
    'you control an artifact',
    'you control a creature',
    'you control an artifact or creature',
    'you control a Dragon',
    // Stage P32 (D-147): "another", every permanent but the source (CR 109.1).
    'you control another creature',
    'you control another creature with power 4 or greater',
    'you control another Dinosaur',
  ],
  rejects: [
    'you control a',
    'you control a creature you control',
    "you control a creature you don't control",
    'you control a Forest',
    'you control an Island or a Mountain',
    'you control two creatures',
    'you control another',
    'an opponent controls a creature',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      literal('you control '),
      choice(pattern(/an? /i), pattern(/another /i)),
      satisfy(
        map(permanentPhrase(false, 'notBasicLand'), withoutZone),
        (filter) => filter.controller === undefined,
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const span = { start: pos, end: r.pos };
    const id = 'condition.control-a';
    const other = r.value[1][0].toLowerCase() === 'another ';
    const noun = permanents(id, span, r.value[2], other, false);
    return {
      ok: true,
      value: condition(id, span, { kind: 'control', noun }),
      pos: r.pos,
    };
  },
});

/**
 * `condition.control-at-most`: "you control two or fewer other lands" (the fast lands). Not more
 * than N is not N+1 or more, which is what the engine counts (`not` of `controlsAtLeast`).
 */
export const CONDITION_CONTROL_AT_MOST = defineRule<IrCondition>({
  id: 'condition.control-at-most',
  family: 'condition',
  leading: ['you'],
  cites: ['CR 614.12 (Replacement Effects)', 'CR 109.1 (Objects)'],
  examples: ['you control two or fewer other lands', 'you control one or fewer other lands'],
  rejects: [
    'you control two or more other lands',
    'you control two or fewer',
    'you control two lands or fewer',
  ],
  parse: (ctx, pos) => {
    const r = sequence(literal('you control '), counted('fewer'))(ctx, pos);
    if (!r.ok) return r;
    const { count, other, filter } = r.value[1];
    const span = { start: pos, end: r.pos };
    const id = 'condition.control-at-most';
    const noun = permanents(id, span, filter, other, true);
    const atLeast: IrAmount = { kind: 'number', value: count.value + 1, span: count.span };
    const inner = condition(id, span, { kind: 'control', noun, atLeast });
    return { ok: true, value: condition(id, span, { kind: 'not', term: inner }), pos: r.pos };
  },
});

/**
 * `condition.control-none`: "you control no other creatures", "you control no artifacts": the
 * count of matching permanents is zero (CR 603.4 reads it when an intervening "if" is checked).
 * `not` of "one or more", which is what the engine counts. A plural phrase only, and no controller
 * of its own ("you control no creatures you don't control" is not read).
 */
export const CONDITION_CONTROL_NONE = defineRule<IrCondition>({
  id: 'condition.control-none',
  family: 'condition',
  leading: ['you'],
  cites: ['CR 603.4 (Handling Triggered Abilities)', 'CR 109.1 (Objects)'],
  examples: ['you control no other creatures', 'you control no artifacts', 'you control no lands'],
  rejects: [
    'you control no',
    'you control no creature',
    'you control none',
    'you control no creatures you control',
    'you control no other',
    'you control a creature',
    'you control two or more creatures',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      literal('you control no '),
      choice(
        map(literal('other '), () => true),
        map(literal(''), () => false),
      ),
      satisfy(
        map(permanentPhrase(true, 'notBasicLand'), withoutZone),
        (filter) => filter.controller === undefined,
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, other, filter] = r.value;
    const span = { start: pos, end: r.pos };
    const id = 'condition.control-none';
    const inner = condition(id, span, {
      kind: 'control',
      noun: permanents(id, span, filter, other, true),
    });
    return { ok: true, value: condition(id, span, { kind: 'not', term: inner }), pos: r.pos };
  },
});

const LAND_TYPE = map(
  pattern(new RegExp(`(${Object.keys(BASIC_LAND_TYPES).join('|')})(?![\\p{L}\\p{N}])`, 'u')),
  (m) => m[1] ?? '',
);

/**
 * `condition.control-land-type`: "you control an Island or a Mountain", "you control a Forest": a
 * basic land type is a subtype, so a Breeding Pool counts as an Island (CR 205.3i, 305.6). A list
 * is "or" (at least one of them), written as separate counts of one.
 */
export const CONDITION_CONTROL_LAND_TYPE = defineRule<IrCondition>({
  id: 'condition.control-land-type',
  family: 'condition',
  leading: ['you'],
  cites: ['CR 205.3i (Subtypes)', 'CR 305.6 (Lands)', 'CR 614.12 (Replacement Effects)'],
  examples: [
    'you control an Island or a Mountain',
    'you control a Plains or an Island',
    'you control a Swamp or a Mountain',
    'you control a Forest',
  ],
  rejects: [
    'you control a Dragon',
    'you control an Island and a Mountain',
    'you control a land',
    'you control an Island or',
    'you control two Islands',
  ],
  parse: (ctx, pos) => {
    const item = map(spanned(sequence(pattern(/an? /i), LAND_TYPE)), ({ value, span }) => ({
      type: value[1],
      span,
    }));
    const r = sequence(literal('you control '), separatedBy1(item, literal(' or ')))(ctx, pos);
    if (!r.ok) return r;
    const id = 'condition.control-land-type';
    const span = { start: pos, end: r.pos };
    const terms = r.value[1].map((i) =>
      condition(id, i.span, {
        kind: 'control',
        noun: permanents(id, i.span, { subtypes: [i.type], raw: i.type }, false, false),
      }),
    );
    const [only] = terms;
    const value =
      terms.length === 1 && only !== undefined
        ? { ...only, span }
        : condition(id, span, { kind: 'or', terms });
    return { ok: true, value, pos: r.pos };
  },
});

/**
 * `condition.opponents-at-least`: "you have two or more opponents": true in a multiplayer game
 * (CR 102.1; in a two-player game you have one opponent, so the permanent always enters tapped).
 */
export const CONDITION_OPPONENTS_AT_LEAST = defineRule<IrCondition>({
  id: 'condition.opponents-at-least',
  family: 'condition',
  leading: ['you'],
  cites: ['CR 102.1 (Players)', 'CR 614.12 (Replacement Effects)'],
  examples: ['you have two or more opponents', 'you have three or more opponents'],
  rejects: [
    'you have two opponents',
    'you have two or fewer opponents',
    'you control two or more opponents',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      literal('you have '),
      spanned(satisfy(quantity, (n) => n >= 1)),
      literal(' or more opponents'),
    )(ctx, pos);
    if (!r.ok) return r;
    const span = { start: pos, end: r.pos };
    const test = { kind: 'opponentsAtLeast' as const, atLeast: amountOf(r.value[1]) };
    return {
      ok: true,
      value: condition('condition.opponents-at-least', span, test),
      pos: r.pos,
    };
  },
});

/** `condition.opponent-poison-at-least`: an opponent's poison counters cross a threshold (D-601). */
export const CONDITION_OPPONENT_POISON_AT_LEAST = defineRule<IrCondition>({
  id: 'condition.opponent-poison-at-least',
  family: 'condition',
  leading: ['an'],
  cites: ['CR 122.1 (Counters)', 'CR 704.5c (State-Based Actions)'],
  examples: [
    'an opponent has three or more poison counters',
    'an opponent has four or more poison counters',
  ],
  rejects: [
    'an opponent has poison counters',
    'an opponent has two poison counters',
    'an opponent has three or fewer poison counters',
    'you have three or more poison counters',
    'an opponent controls three or more poison counters',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      literal('an opponent has '),
      spanned(satisfy(quantity, (n) => n >= 1)),
      literal(' or more poison counters'),
    )(ctx, pos);
    if (!r.ok) return r;
    const span = { start: pos, end: r.pos };
    return {
      ok: true,
      value: condition('condition.opponent-poison-at-least', span, {
        kind: 'opponentPoisonAtLeast',
        atLeast: amountOf(r.value[1]),
      }),
      pos: r.pos,
    };
  },
});

/** Morbid: whether any creature died this turn. */
export const CONDITION_CREATURE_DIED_THIS_TURN = defineRule<IrCondition>({
  id: 'condition.creature-died-this-turn',
  family: 'condition',
  leading: ['a'],
  cites: ['CR 700.4 (Dies)', 'CR 608.2c (Instructions in Order)'],
  examples: ['a creature died this turn'],
  rejects: [
    'a creature died last turn',
    'a creature will die this turn',
    'a creature dies this turn',
    'a creature card died this turn',
    'a creature died this turn.',
  ],
  parse: (ctx, pos) => {
    const r = pattern(/a creature died this turn(?![\p{L}\p{N}])/iu)(ctx, pos);
    if (!r.ok) return r;
    const span = { start: pos, end: r.pos };
    const amount: IrAmount = {
      kind: 'diedThisTurn',
      controller: 'any',
      types: ['creature'],
      span,
    };
    return {
      ok: true,
      value: condition('condition.creature-died-this-turn', span, {
        kind: 'amountIs',
        amount,
        compare: { cmp: 'atLeast', value: 1 },
      }),
      pos: r.pos,
    };
  },
});

/**
 * `condition.modified-creature-died`: "a modified creature died under your control this turn" (CR 700.9, 700.4, 603.10a): a creature that was modified (a counter, an Equipment, or an
 * Aura its controller controlled) as it left the battlefield and died under the controller of the ability. The engine's `diedThisTurn` amount with `modified`, at least one.
 */
export const CONDITION_MODIFIED_CREATURE_DIED = defineRule<IrCondition>({
  id: 'condition.modified-creature-died',
  family: 'condition',
  leading: ['a'],
  cites: ['CR 700.9 (Modified)', 'CR 700.4 (Dies)', 'CR 603.10a (Handling Triggered Abilities)'],
  examples: ['a modified creature died under your control this turn'],
  rejects: [
    'a modified creature died this turn',
    'a modified creature died under your control last turn',
    'a modified creature dies under your control this turn',
    'a modified creature died under an opponent’s control this turn',
    'a modified creature card died under your control this turn',
    'a creature died under your control this turn',
    'a modified creature died under your control this turn.',
  ],
  parse: (ctx, pos) => {
    const r = pattern(/a modified creature died under your control this turn(?![\p{L}\p{N}])/iu)(
      ctx,
      pos,
    );
    if (!r.ok) return r;
    const span = { start: pos, end: r.pos };
    const amount: IrAmount = {
      kind: 'diedThisTurn',
      controller: 'you',
      types: ['creature'],
      modified: true,
      span,
    };
    return {
      ok: true,
      value: condition('condition.modified-creature-died', span, {
        kind: 'amountIs',
        amount,
        compare: { cmp: 'atLeast', value: 1 },
      }),
      pos: r.pos,
    };
  },
});

/**
 * `condition.control-commander`: "you control a commander" (stage P13, CR 903.3d: a commander is a
 * permanent on the battlefield that was designated as a commander; a token or a copy is not one
 * (CR 903.3), and a commander in the command zone is not controlled). The engine's
 * `controlCommander` condition, which the free cast "If you control a commander, you may cast this
 * spell without paying its mana cost" reads. "Your commander", "a commander an opponent controls",
 * "two commanders" and "your commander is on the battlefield" are other tests and are not read.
 */
export const CONDITION_CONTROL_COMMANDER = defineRule<IrCondition>({
  id: 'condition.control-commander',
  family: 'condition',
  leading: ['you'],
  cites: ['CR 903.3 (Commander)', 'CR 903.3d (Commander)', 'CR 903.8 (Commander)'],
  examples: ['you control a commander'],
  rejects: [
    'you control commander',
    'you control your commander',
    'you control a commander an opponent controls',
    'you control two commanders',
    'you control a commander or a creature',
    'you control a',
    'an opponent controls a commander',
    'you cast your commander',
  ],
  parse: (ctx, pos) => {
    const r = pattern(/you control a commander(?![\p{L}\p{N}])/iu)(ctx, pos);
    if (!r.ok) return r;
    const span = { start: pos, end: r.pos };
    return {
      ok: true,
      value: condition('condition.control-commander', span, { kind: 'controlCommander' }),
      pos: r.pos,
    };
  },
});

export const CONDITION_RULES = [
  // Quandrix Unlimited deck, group G: two conditions joined by "and", and "you control a prime number of lands", before the single conditions they start with.
  ...QUANDRIX_G_CONDITION_RULES,
  // Stage P33 (D-150): "you control three or more lands with the same name" before the plain count, whose phrase is a prefix of it.
  ...ANGEL_CONDITION_RULES,
  // Ever-Watching Threshold: "they attacked you and/or a planeswalker you control", the intervening "if" of "an opponent attacks".
  ...THEY_ATTACKED_YOU_CONDITION_RULES,
  ...BRUNA_CONDITION_RULES,
  // Stage P70 (D-278): "you both own and control ~ and a creature named X", the condition of the meld ability.
  ...MELD_CONDITION_RULES,
  // Stage P69 (D-271): "the result is 1" after a die roll, "~ is in your graveyard".
  ...ARDEN_CONDITION_RULES,
  // Issue 89 (Animate Dead): "it's on the battlefield", the intervening "if" of an Aura's enters ability.
  ...IT_ON_BATTLEFIELD_CONDITION_RULES,
  // Valakut Exploration: "there are cards exiled with ~", before the plain count whose phrase ("there are") is a prefix of it.
  ...EXILED_WITH_CONDITION_RULES,
  // Issue 26 (the Danitha deck, D-412): "you control a Squirrel or returned a Squirrel card to your hand this way", before the plain count whose phrase is a prefix of it.
  ...DANITHA_G2_CONDITION_RULES,
  CONDITION_CONTROL_AT_LEAST,
  CONDITION_CONTROL_A,
  CONDITION_CONTROL_AT_MOST,
  CONDITION_CONTROL_NONE,
  CONDITION_CONTROL_LAND_TYPE,
  CONDITION_OPPONENT_POISON_AT_LEAST,
  CONDITION_CREATURE_DIED_THIS_TURN,
  CONDITION_MODIFIED_CREATURE_DIED,
  CONDITION_OPPONENTS_AT_LEAST,
  CONDITION_CONTROL_COMMANDER,
  ...GAME_STATE_CONDITION_RULES,
  ...SELF_STATE_CONDITION_RULES,
  ...NO_COUNTERS_CONDITION_RULES,
  ...COUNTER_COUNT_CONDITION_RULES,
  ...RECURSION_CONDITION_RULES,
  // Revolt (CR 207.2c): "a permanent left the battlefield under your control this turn".
  ...REVOLT_CONDITION_RULES,
  // Frodo, Adventurous Hobbit: "~ is your Ring-bearer", "the Ring has tempted you two or more times this game".
  ...RING_TEMPTED_CONDITION_RULES,
  // Stage P31 (D-140): "you control the artifact with the greatest mana value or tied for the greatest mana value".
  ...ARTIFACT_CONDITION_RULES,
  // Stage P32 (D-147): "you don't control another Dinosaur", "the creature you control has trample".
  ...DINOSAUR_CONDITION_RULES,
  // Jeskai free-cast cards (issue 100): "you cast it".
  ...JESKAI_CASTFREE_CONDITION_RULES,
  // Stage P34 (D-152): the most life, the total power of the attackers, the damage and the permanents of the turn.
  ...DRAGON_CONDITION_RULES,
  // Stage P37 (D-180): "you put a Cave onto the battlefield this way".
  ...KORVOLD_CONDITION_RULES,
  // Stage P49 (D-206): "at least four mana was spent to cast it", "a card left your graveyard this turn", "~ was cast from a graveyard".
  ...VRASKA_CONDITION_RULES,
  // Issue 25 (the Niv-Mizzet deck): "five or more mana was spent to cast that spell".
  ...NIV_CONDITION_RULES,
  // Prismari deck, group 2 (issue 87, D-646): "that spell's mana value is 5 or greater".
  ...PRISMARI_G2_CONDITION_RULES,
  // Prismari deck, group 3 (issue 87, D-661): "the total mana value of the cards exiled this way is 13 or less".
  ...PRISMARI_G3_CONDITION_RULES,
  // Death Toll deck, group B (CR 205.2a): "two cards that share all their card types were milled this way".
  ...DEATH_TOLL_B_CONDITION_RULES,
  // Issue 25 (D-318): "you've cast three or more spells this turn".
  ...SPELLS_CAST_CONDITION_RULES,
  // Issue 25 (D-331): "there are no cards in your library", "your library has no cards in it".
  ...LIBRARY_CONDITION_RULES,
  // Stage P52 (D-210): "the player doesn't", "a creature card was discarded this way".
  ...CHOOSER_CONDITION_RULES,
  // Death Toll deck, group D: "a creature is destroyed this way".
  ...DEATH_TOLL_D_CONDITION_RULES,
  // Stage P63 (D-216): "you created a token this turn".
  ...EDHREC_CONDITION_RULES,
  // Stage P68 (D-229): "there are fewer than eight cards in your graveyard".
  ...HOFRI_CONDITION_RULES,
  // Issue 26 (the Danitha deck, D-403): "you don't put it onto the battlefield".
  ...DANITHA_G1B_CONDITION_RULES,
  // Issue 26 (the Danitha deck, D-411): "you don't", after "you don't put it onto the battlefield", whose phrase it is a prefix of.
  ...DANITHA_G2_LATE_CONDITION_RULES,
  // Issue 26 (the Danitha deck, D-427): "enchanted creature is green", "another Aura is attached to enchanted creature", "~ entered this turn".
  ...DANITHA_G3_CONDITION_RULES,
  // Issue 89: "it's attacking one of your opponents".
  ...ATTACKING_OPPONENTS_CONDITION_RULES,
  // Lorwyn Eclipsed (Blight Curse deck): "you control that creature", "its toughness was less than 1", "you put a counter on a creature this turn".
  ...COUNTER_TRIGGER_CONDITION_RULES,
  // Federation Fleet deck, group D: "it has greater power than ~", "you put two or more +1/+1 counters on creatures this way".
  ...FEDERATION_D_CONDITION_RULES,
  // Issue 41 (the Gisa deck, D-475): "a player was dealt combat damage by a Zombie this turn".
  ...GISA_G1_CONDITION_RULES,
  // Issue 42 (the Hylda deck, D-510): "it isn't being declared as an attacker".
  ...HYLDA_G1_CONDITION_RULES,
  ...MARDU_SURGE_CONDITION_RULES,
  // Twilight Diviner (Meren deck): "they entered or were cast from a graveyard".
  ...ENTERED_FROM_GRAVEYARD_CONDITION_RULES,
  // Quandrix Unlimited deck, group I: "if that spell's mana cost or that ability's activation cost contains {X}".
  ...UNBOUND_I_CONDITION_RULES,
  // D-518, D-520 (Hylda deck, group 2): "there are four or more card types among cards in your graveyard", "enchanted creature is untapped".
  ...HYLDA_G2_CONDITION_RULES,
  // Lorehold Spirit deck, group 1 (issue 86): "you search your library this way".
  ...LOREHOLD_G1_CONDITION_RULES,
  // Lorehold Spirit deck, group 3 (issue 86): "a player has one or fewer cards in hand".
  ...LOREHOLD_G3_CONDITION_RULES,
  // Federation Fleet deck, group B: "the player is your opponent and has four or more cards in hand" (the player of the trigger).
  ...THE_PLAYER_CONDITION_RULES,
  // Galadriel deck, group 1 (issue 43): "this is the second time this ability has resolved this turn", "you chose a creature other than ~ as your Ring-bearer".
  ...GALADRIEL_G1_CONDITION_RULES,
  CONDITION_KICKED,
  CONDITION_CAST_IN_OWN_MAIN_PHASE,
  CONDITION_ADDITIONAL_COST_PAID,
  CONDITION_X_AT_LEAST,
  CONDITION_THAT_OBJECT_POWER,
  // Meren of Clan Nel Toth: "that card's mana value is less than or equal to the number of experience counters you have".
  ...EXPERIENCE_CONDITION_RULES,
  CONDITION_UNLESS_PAYS,
  CONDITION_UNLESS_ESCAPED,
  CONDITION_IF_YOU_DO,
];
