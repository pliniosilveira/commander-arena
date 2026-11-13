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
import { ANGEL_CONDITION_RULES } from './angels';
import { ARDEN_CONDITION_RULES } from './arden';
import { ARTIFACT_CONDITION_RULES } from './artifacts';
import { BRUNA_CONDITION_RULES } from './bruna';
import { CHOOSER_CONDITION_RULES } from './choosers';
import { DANITHA_G1B_CONDITION_RULES } from './danitha-g1b';
import { DINOSAUR_CONDITION_RULES } from './dinosaurs';
import { DRAGON_CONDITION_RULES } from './dragons';
import { EDHREC_CONDITION_RULES } from './edhrec';
import { CONDITION_UNLESS_ESCAPED } from './escaped';
import { GAME_STATE_CONDITION_RULES } from './game-state';
import { HOFRI_CONDITION_RULES } from './hofri';
import { CONDITION_IF_YOU_DO } from './if-you-do';
import { CONDITION_KICKED } from './kicked';
import { KORVOLD_CONDITION_RULES } from './korvold';
import { LIBRARY_CONDITION_RULES } from './library';
import { MELD_CONDITION_RULES } from './meld';
import { NIV_CONDITION_RULES } from './niv';
import { RECURSION_CONDITION_RULES } from './recursion';
import { SELF_STATE_CONDITION_RULES } from './self-state';
import { SPELLS_CAST_CONDITION_RULES } from './spells-cast';
import { CONDITION_UNLESS_PAYS } from './unless';
import { VRASKA_CONDITION_RULES } from './vraska';

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
  // Stage P33 (D-150): "you control three or more lands with the same name" before the plain count, whose phrase is a prefix of it.
  ...ANGEL_CONDITION_RULES,
  ...BRUNA_CONDITION_RULES,
  // Stage P70 (D-278): "you both own and control ~ and a creature named X", the condition of the meld ability.
  ...MELD_CONDITION_RULES,
  // Stage P69 (D-271): "the result is 1" after a die roll, "~ is in your graveyard".
  ...ARDEN_CONDITION_RULES,
  CONDITION_CONTROL_AT_LEAST,
  CONDITION_CONTROL_A,
  CONDITION_CONTROL_AT_MOST,
  CONDITION_CONTROL_NONE,
  CONDITION_CONTROL_LAND_TYPE,
  CONDITION_OPPONENTS_AT_LEAST,
  CONDITION_CONTROL_COMMANDER,
  ...GAME_STATE_CONDITION_RULES,
  ...SELF_STATE_CONDITION_RULES,
  ...RECURSION_CONDITION_RULES,
  // Stage P31 (D-140): "you control the artifact with the greatest mana value or tied for the greatest mana value".
  ...ARTIFACT_CONDITION_RULES,
  // Stage P32 (D-147): "you don't control another Dinosaur", "the creature you control has trample".
  ...DINOSAUR_CONDITION_RULES,
  // Stage P34 (D-152): the most life, the total power of the attackers, the damage and the permanents of the turn.
  ...DRAGON_CONDITION_RULES,
  // Stage P37 (D-180): "you put a Cave onto the battlefield this way".
  ...KORVOLD_CONDITION_RULES,
  // Stage P49 (D-206): "at least four mana was spent to cast it", "a card left your graveyard this turn", "~ was cast from a graveyard".
  ...VRASKA_CONDITION_RULES,
  // Issue 25 (the Niv-Mizzet deck): "five or more mana was spent to cast that spell".
  ...NIV_CONDITION_RULES,
  // Issue 25 (D-318): "you've cast three or more spells this turn".
  ...SPELLS_CAST_CONDITION_RULES,
  // Issue 25 (D-331): "there are no cards in your library", "your library has no cards in it".
  ...LIBRARY_CONDITION_RULES,
  // Stage P52 (D-210): "the player doesn't", "a creature card was discarded this way".
  ...CHOOSER_CONDITION_RULES,
  // Stage P63 (D-216): "you created a token this turn".
  ...EDHREC_CONDITION_RULES,
  // Stage P68 (D-229): "there are fewer than eight cards in your graveyard".
  ...HOFRI_CONDITION_RULES,
  // Issue 26 (the Danitha deck, D-403): "you don't put it onto the battlefield".
  ...DANITHA_G1B_CONDITION_RULES,
  CONDITION_KICKED,
  CONDITION_UNLESS_PAYS,
  CONDITION_UNLESS_ESCAPED,
  CONDITION_IF_YOU_DO,
];
