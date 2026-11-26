/**
 * Effect rules of the Planeswalker Party deck (issue 132).
 */
import { fail, literal, optional, pattern, satisfy, sequence } from '../../combinators';
import type {
  IrAmount,
  IrBasePt,
  IrClause,
  IrColorSpec,
  IrCounterSpec,
  IrDuration,
  IrNoun,
  IrTypeList,
} from '../../ir/types';
import { KEYWORD_WORDS } from '../keyword/list';
import { spellPhrase } from '../noun/phrases';
import { defineRule, family, quietly, spanned } from '../registry';
import { CREATURE_TYPE_LIST } from './becomes';
import { COPY_LOYALTY_EFFECT_RULES } from './copy-loyalty';
import { GUFF_EFFECT_RULES } from './guff';
import { type Clauses, makeClause, single } from './operands';
import { impliedYou } from './player';
import { EFFECT_LEAD_THEY_BECOME_COLORED_CREATURES_ABILITY } from './they-become-bird';
import { VRONOS_EFFECT_RULES } from './vronos';

const ID = 'effect.damage-exile-if-dies';

/**
 * `effect.damage-exile-if-dies`: "~ deals X damage to target creature or planeswalker. If a permanent dealt damage this way would die this turn, exile it instead." (Chandra, Awakened
 * Inferno; CR 120.2, 614.1a, 614.6, 700.4): the damage of `effect.damage` and the replacement of the sentence after it, which are one instruction (the segmenter keeps the two sentences
 * together). The lowering turns the second sentence into the engine's `exileIfDiesThisTurn` of the target, behind the damage actually dealt. Only one target and the words "a permanent dealt
 * damage this way", "that creature" or "that permanent". Not read: another recipient than a target, "until end of turn", "instead of dying", a later sentence.
 */
export const EFFECT_DAMAGE_EXILE_IF_DIES = defineRule<Clauses>({
  id: ID,
  family: 'effect',
  leading: ['~'],
  cites: [
    'CR 120.2 (Damage)',
    'CR 614.1a (Replacement Effects)',
    'CR 614.6 (Replacement Effects)',
    'CR 700.4 (Dies)',
  ],
  examples: [
    '~ deals 3 damage to target creature. If that creature would die this turn, exile it instead',
    '~ deals 3 damage to target creature or planeswalker. If a permanent dealt damage this way would die this turn, exile it instead',
    '~ deals 2 damage to target creature. If that permanent would die this turn, exile it instead',
  ],
  rejects: [
    '~ deals 3 damage to target creature. If that creature would die this turn, exile it',
    '~ deals 3 damage to target creature. If that creature would die, exile it instead',
    '~ deals 3 damage to each creature. If that creature would die this turn, exile it instead',
    '~ deals 3 damage to target creature. If that creature would die this turn, exile it instead and draw a card',
    '~ deals 3 damage to target creature. If that creature would die this turn, put it on the bottom of its owner’s library instead',
    '~ deals 3 damage to target creature. If that creature would die until end of turn, exile it instead',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      family<Clauses>('effect', { only: ['effect.damage'] }),
      pattern(
        /\. if (?:a permanent dealt damage this way|that (?:creature|permanent)) would die this turn, exile it instead(?![\p{L}\p{N}])/iu,
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const [clauses] = r.value;
    const [first, ...rest] = clauses;
    const to = first?.args.to;
    const items = to?.kind === 'noun' ? [to] : to?.kind === 'nounList' ? to.items : [];
    // One target: the permanent "dealt damage this way" is that target (CR 115.1), so a group ("each creature") is not read.
    if (
      first === undefined ||
      rest.length > 0 ||
      first.verb !== 'dealDamage' ||
      items.length !== 1 ||
      items[0]?.det !== 'target'
    ) {
      return fail(ctx, pos);
    }
    const marked = makeClause(
      ID,
      'dealDamage',
      { ...first.args, exileIfDies: { kind: 'flag', value: true, span: first.span, rule: ID } },
      first.span,
    );
    return { ok: true, value: [{ ...marked, rule: ID }], pos: r.pos };
  },
});

const BECOMES_ID = 'effect.lead-each-becomes-creature';

/**
 * `effect.lead-each-becomes-creature`: "Until end of turn, each planeswalker you control becomes a 4/4 red Dragon creature and gains flying." (Sarkhan the Masterless; CR 613.1d, 613.1e,
 * 613.1f, 613.4b, 611.2a, 205.1a): every planeswalker the controller controls as the effect begins is a creature of that color, creature type and base power and toughness until the
 * end of the turn, and no longer a planeswalker (it keeps its loyalty counters and abilities). The group is fixed once (CR 611.2c). Keywords are given first and the types last, so the
 * group is still the planeswalkers when each part is made. Not read: another group than planeswalkers you control, "still a planeswalker" (`effect.lead-becomes-creature`), no color,
 * another duration, a quoted ability.
 */
export const EFFECT_LEAD_EACH_BECOMES_CREATURE = defineRule<Clauses>({
  id: BECOMES_ID,
  family: 'effect',
  leading: ['until'],
  cites: [
    'CR 611.2a (Continuous Effects)',
    'CR 611.2c (Continuous Effects)',
    'CR 613.1d (Interaction of Continuous Effects)',
    'CR 613.1e (Interaction of Continuous Effects)',
    'CR 613.4b (Interaction of Continuous Effects)',
    'CR 205.1a (Type Line)',
  ],
  examples: [
    'until end of turn, each planeswalker you control becomes a 4/4 red Dragon creature and gains flying',
    'Until end of turn, each planeswalker you control becomes a 4/4 red Dragon creature',
  ],
  rejects: [
    'until end of turn, each planeswalker you control becomes a 4/4 red Dragon creature and gains flying.',
    'until end of turn, each creature you control becomes a 4/4 red Dragon creature and gains flying',
    "until end of turn, each planeswalker you control becomes a 4/4 red Dragon creature that's still a planeswalker",
    'until end of turn, each planeswalker you control becomes a 4/4 Dragon creature and gains flying',
    'until end of turn, each planeswalker you control becomes a red Dragon creature and gains flying',
    'until your next turn, each planeswalker you control becomes a 4/4 red Dragon creature and gains flying',
    'until end of turn, each planeswalker becomes a 4/4 red Dragon creature and gains flying',
    'until end of turn, each planeswalker you control becomes a 4/4 red Dragon creature and gains flying and draws a card',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      family<IrDuration>('duration'),
      literal(', '),
      satisfy(
        family<IrNoun>('noun', { only: ['noun.each-permanent'] }),
        (n) =>
          n.filter.types?.length === 1 &&
          n.filter.types[0] === 'planeswalker' &&
          n.filter.controller === 'you' &&
          !n.other,
      ),
      literal(' becomes a '),
      spanned(pattern(/(\d+)\/(\d+) /)),
      spanned(pattern(/(white|blue|black|red|green)(?![\p{L}\p{N}]) /iu)),
      spanned(CREATURE_TYPE_LIST),
      literal(' creature'),
      optional(spanned(sequence(literal(' and gains '), KEYWORD_WORDS)), null),
    )(ctx, pos);
    if (!r.ok) return r;
    const [duration, , subject, , pt, color, types, , gained] = r.value;
    const basePt: IrBasePt = {
      kind: 'basePt',
      power: Number(pt.value[1]),
      toughness: Number(pt.value[2]),
      span: pt.span,
      rule: BECOMES_ID,
    };
    const typeList: IrTypeList = {
      kind: 'typeList',
      subtypes: types.value,
      cardTypes: ['creature'],
      span: types.span,
      rule: BECOMES_ID,
    };
    const colorSpec: IrColorSpec = {
      kind: 'colorSpec',
      colors: [(color.value[1] ?? '').toLowerCase()],
      span: color.span,
      rule: BECOMES_ID,
    };
    const clauses: IrClause[] = [];
    const names = gained === null ? [] : gained.value[1];
    names.forEach((name) => {
      const keyword = {
        kind: 'keywordName' as const,
        name,
        span: gained?.span ?? pt.span,
        rule: BECOMES_ID,
      };
      clauses.push({
        ...makeClause(BECOMES_ID, 'grantKeyword', { objects: subject, keyword }, keyword.span),
        duration,
        connector: 'and' as const,
      });
    });
    clauses.push({
      ...makeClause(
        BECOMES_ID,
        'becomesCreatureGroup',
        { objects: subject, types: typeList, colors: colorSpec, basePt },
        types.span,
      ),
      duration,
    });
    return { ok: true, value: clauses, pos: r.pos };
  },
});

const EACH_DEALS_ID = 'effect.each-deals-damage-to-that';

/**
 * `effect.each-deals-damage-to-that`: "each Dragon you control deals 1 damage to that creature" (Sarkhan the Masterless; CR 120.3, 608.2c): every permanent of a group the controller
 * controls is a source of one damage of its own to the permanent the trigger is about. The engine's `dealDamageFromEach`. Not read: "deals damage equal to its power" (`effect.damage-it-count`),
 * another recipient than "that creature", a group that is not "each ... you control", the singular.
 */
export const EFFECT_EACH_DEALS_DAMAGE_TO_THAT = defineRule<Clauses>({
  id: EACH_DEALS_ID,
  family: 'effect',
  leading: ['each'],
  cites: ['CR 120.3 (Damage)', 'CR 608.2c (Resolving Spells and Abilities)'],
  examples: [
    'each Dragon you control deals 1 damage to that creature',
    'each creature you control deals 2 damage to that creature',
  ],
  rejects: [
    'each Dragon you control deals damage to that creature',
    'each Dragon deals 1 damage to that creature',
    'each Dragon you control deals 1 damage to target creature',
    'each Dragon you control deals 1 damage to that creature and draws a card',
    'each Dragon you control deal 1 damage to that creature',
    'each Dragon you control deals 1 damage to that player',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      satisfy(
        family<IrNoun>('noun', { only: ['noun.each-permanent'] }),
        (n) => n.filter.controller === 'you' && !n.other,
      ),
      literal(' deals '),
      family<IrAmount>('amount', { only: ['amount.number'] }),
      literal(' damage to '),
      spanned(pattern(/that (?:creature|permanent)(?![\p{L}\p{N}'’])/iu)),
    )(ctx, pos);
    if (!r.ok) return r;
    const [sources, , amount, , victim] = r.value;
    // "that creature" is the creature the trigger is about, not the group named before it (the binding pass would take the nearest noun): the trigger's own subject.
    const to: IrNoun = {
      kind: 'noun',
      det: 'triggerSubject',
      filter: { raw: victim.value[0] },
      upTo: false,
      plural: false,
      other: false,
      span: victim.span,
      rule: EACH_DEALS_ID,
    };
    if (amount.kind !== 'number') return fail(ctx, pos);
    return {
      ok: true,
      value: [
        makeClause(
          EACH_DEALS_ID,
          'dealDamageFromEach',
          { sources, amount, to },
          { start: pos, end: r.pos },
        ),
      ],
      pos: r.pos,
    };
  },
});

const CAST_AMONG_ID = 'effect.lead-may-cast-kind-from-those-free';

/**
 * `effect.lead-may-cast-kind-from-those-free`: "Until end of turn, you may cast noncreature spells from among those cards without paying their mana costs." (Narset, Enlightened Master;
 * CR 601.2, 118.9, 611.2a): the cards an instruction before it exiled may be cast for free until the end of the turn, those of the kind the words name (a spell of a card type is a spell,
 * a land card is none). The engine's `mayPlay` of `moved` with `free`, `castOnly` and the filter of the cards. Not read: a plain "spells" (every card), a number of spells, "this turn" after,
 * another duration, "from your hand", "them" ("from among them" is `effect.cast-from-among`), paying the mana cost.
 */
export const EFFECT_LEAD_MAY_CAST_KIND_FROM_THOSE_FREE = defineRule<Clauses>({
  id: CAST_AMONG_ID,
  family: 'effect',
  leading: ['until'],
  cites: [
    'CR 601.2 (Casting Spells)',
    'CR 118.9 (Costs)',
    'CR 611.2a (Continuous Effects)',
    'CR 608.2g (Resolving Spells and Abilities)',
  ],
  examples: [
    'until end of turn, you may cast noncreature spells from among those cards without paying their mana costs',
    'Until end of turn, you may cast instant or sorcery spells from among those cards without paying their mana costs',
  ],
  rejects: [
    'until end of turn, you may cast spells from among those cards without paying their mana costs',
    'until end of turn, you may cast noncreature spells from among those cards',
    'until end of turn, you may cast noncreature spells from among them without paying their mana costs',
    'until end of turn, you may cast noncreature spells from among those cards without paying their mana costs this turn',
    'until your next turn, you may cast noncreature spells from among those cards without paying their mana costs',
    'until end of turn, you may cast two noncreature spells from among those cards without paying their mana costs',
    'until end of turn, you may cast noncreature spells from your hand without paying their mana costs',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      family<IrDuration>('duration'),
      literal(', you may cast '),
      spellPhrase(true),
      pattern(
        / from among those cards without paying their mana costs(?![\p{L}\p{N}])(?!\s+(?:and|then|this)(?![\p{L}\p{N}]))/iu,
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const [duration, , phrase] = r.value;
    const { stackKind: _kind, zone: _zone, ...rest } = phrase;
    void _kind;
    void _zone;
    // A plain "spells" names every card: another statement.
    if (
      rest.types === undefined &&
      rest.notTypes === undefined &&
      rest.subtypes === undefined &&
      rest.anyOf === undefined
    ) {
      return fail(ctx, pos);
    }
    const span = { start: pos, end: r.pos };
    const spell: IrNoun = {
      kind: 'noun',
      det: 'each',
      filter: rest,
      upTo: false,
      plural: true,
      other: false,
      span,
      rule: CAST_AMONG_ID,
    };
    return {
      ok: true,
      value: [
        { ...makeClause(CAST_AMONG_ID, 'mayCastKindFromMovedFree', { spell }, span), duration },
      ],
      pos: r.pos,
    };
  },
});

const CAST_THAT_ID = 'effect.may-cast-moved-card';

/**
 * `effect.may-cast-moved-card`: "You may cast that card." (the "you may" is the sentence's) (Chandra, Torch of Defiance; CR 608.2g, 601.2): the card an instruction before it exiled is cast now, as the effect resolves, paying
 * its mana cost, or not at all; a card that can't be cast (a land, no mana) is not offered. The engine's `castCard` of `moved`, which a following "If you don't" reads. Not read: "this turn"
 * (`effect.may-play-this-turn`), "without paying its mana cost", "target card", "them", "play".
 */
export const EFFECT_MAY_CAST_MOVED_CARD = defineRule<Clauses>({
  id: CAST_THAT_ID,
  family: 'effect',
  leading: ['cast'],
  cites: ['CR 608.2g (Resolving Spells and Abilities)', 'CR 601.2 (Casting Spells)'],
  examples: ['cast that card', 'Cast that card'],
  rejects: [
    'cast that card this turn',
    'cast that card until the end of your next turn',
    'cast that card without paying its mana cost',
    'cast target card',
    'cast them',
    'play that card',
    'cast that card and draw a card',
    'you cast that card',
  ],
  parse: (ctx, pos) => {
    const r = pattern(
      /cast that card(?![\p{L}\p{N}])(?!\s+(?:this|without|and|then|from|until)(?![\p{L}\p{N}]))/iu,
    )(ctx, pos);
    if (!r.ok) return r;
    const span = { start: pos, end: r.pos };
    return { ok: true, value: [makeClause(CAST_THAT_ID, 'castMovedNow', {}, span)], pos: r.pos };
  },
});

const REMOVE_EACH_ID = 'effect.remove-counter-from-each-chosen';

/**
 * `effect.remove-counter-from-each-chosen`: "Remove a loyalty counter from each of any number of permanents you control." (Chandra, Legacy of Fire; CR 122.1, 608.2d): the controller chooses
 * any number of the permanents they control that have a counter of the kind (none up to all), and one counter comes off each. The engine's `chooseObjects` of the permanents with a counter
 * and `removeCounters` of the ones chosen; the counters really removed are what "that many" of the next sentence reads. Not read: another number of counters, "target", "up to", permanents
 * of another controller.
 */
export const EFFECT_REMOVE_COUNTER_FROM_EACH_CHOSEN = defineRule<Clauses>({
  id: REMOVE_EACH_ID,
  family: 'effect',
  leading: ['remove'],
  cites: [
    'CR 122.1 (Counters)',
    'CR 608.2d (Resolving Spells and Abilities)',
    'CR 306.5b (Planeswalkers)',
  ],
  examples: [
    'remove a loyalty counter from each of any number of permanents you control',
    'remove a +1/+1 counter from each of any number of permanents you control',
  ],
  rejects: [
    'remove two loyalty counters from each of any number of permanents you control',
    'remove a loyalty counter from each of up to two permanents you control',
    'remove a loyalty counter from each of any number of permanents',
    'remove a loyalty counter from each of any number of permanents you control and draw a card',
    'remove a loyalty counter from each of any number of creatures you control',
    'remove a loyalty counter from target permanent you control',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      literal('remove a '),
      spanned(pattern(/[+-]\d+\/[+-]\d+|[a-z]+/i)),
      pattern(/ counter from each of any number of permanents you control(?![\p{L}\p{N}])/iu),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, word] = r.value;
    const counter: IrCounterSpec = {
      kind: 'counterSpec',
      name: word.value[0].toLowerCase(),
      span: word.span,
      rule: REMOVE_EACH_ID,
    };
    return {
      ok: true,
      value: [
        makeClause(
          REMOVE_EACH_ID,
          'removeCounterFromEachChosen',
          { counter },
          { start: pos, end: r.pos },
        ),
      ],
      pos: r.pos,
    };
  },
});

const EXILE_THAT_MANY_ID = 'effect.exile-that-many-top';

/**
 * `effect.exile-that-many-top`: "Exile that many cards from the top of your library." (Chandra, Legacy of Fire; CR 701.13, 608.2c): the number of counters the instruction before it
 * removed, or (Dream Pillager) what the trigger's event says. The engine's `exileTop` with that number. Not read: another number ("the top two cards" is `effect.exile-top`), another library, "face down".
 */
export const EFFECT_EXILE_THAT_MANY_TOP = defineRule<Clauses>({
  id: EXILE_THAT_MANY_ID,
  family: 'effect',
  leading: ['exile'],
  cites: ['CR 701.13 (Exile)', 'CR 608.2c (Resolving Spells and Abilities)'],
  examples: ['exile that many cards from the top of your library'],
  rejects: [
    'exile that many cards from the top of their library',
    'exile that many cards from your library',
    'exile that many cards from the top of your library face down',
    'exile that many cards from the top of your graveyard',
    'exile those cards from the top of your library',
    'exile that card from the top of your library',
  ],
  parse: single(
    EXILE_THAT_MANY_ID,
    sequence(
      // One guard, so a text that is not this exile fails where it starts ("exile your graveyard" is no near miss of this rule).
      pattern(
        /exile (?=that many cards from the top of your library(?![\p{L}\p{N}])(?!\s+face down))/iu,
      ),
      family<IrAmount>('amount', { only: ['amount.that-many'] }),
      literal(' cards from the top of your library'),
      pattern(/(?![\p{L}\p{N}])(?!\s+face down)/u),
    ),
    ([, count]) => ({ verb: 'exileTopThatMany', args: { count } }),
  ),
});

const TEYO_ID = 'effect.choose-direction-attack-nearest';

/**
 * `effect.choose-direction-attack-nearest`: "Choose left or right. Until your next turn, each player may attack only the nearest opponent in the last chosen direction and planeswalkers
 * controlled by that opponent." (Teyo, Geometric Tactician; CR 508.1a, 611.2a, 101.4): the controller chooses a direction as the effect resolves, and until their next turn every player's
 * creatures may attack only the nearest opponent that way, or their planeswalkers. Two sentences that `splitSentences` keeps together. The engine's `chooseOne` of the two directions, each
 * `attackOnlyNearestOpponent`. Not read: another duration, "target opponent", a direction other than left or right, "may attack" without "only".
 */
export const EFFECT_CHOOSE_DIRECTION_ATTACK_NEAREST = defineRule<Clauses>({
  id: TEYO_ID,
  family: 'effect',
  leading: ['choose'],
  cites: [
    'CR 508.1a (Declare Attackers Step)',
    'CR 611.2a (Continuous Effects)',
    'CR 101.4 (Handling Simultaneous Decisions)',
  ],
  examples: [
    'choose left or right. Until your next turn, each player may attack only the nearest opponent in the last chosen direction and planeswalkers controlled by that opponent',
  ],
  rejects: [
    'choose left or right',
    'choose left or right. Until your next turn, each player may attack only the nearest opponent in the last chosen direction',
    'choose left or right. Until end of turn, each player may attack only the nearest opponent in the last chosen direction and planeswalkers controlled by that opponent',
    'choose left or up. Until your next turn, each player may attack only the nearest opponent in the last chosen direction and planeswalkers controlled by that opponent',
    'choose left or right. Until your next turn, each player may attack the nearest opponent in the last chosen direction and planeswalkers controlled by that opponent',
    'choose left or right. Until your next turn, each player may attack only the nearest opponent in the last chosen direction and planeswalkers controlled by that opponent and draw a card',
  ],
  parse: (ctx, pos) => {
    const r = pattern(
      /choose left or right\. until your next turn, each player may attack only the nearest opponent in the last chosen direction and planeswalkers controlled by that opponent(?![\p{L}\p{N}])/iu,
    )(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: [makeClause(TEYO_ID, 'chooseDirectionAttackNearest', {}, { start: pos, end: r.pos })],
      pos: r.pos,
    };
  },
});

const SEMESTER_ID = 'effect.exile-return-next-end-step-with-counters';

/**
 * `effect.exile-return-next-end-step-with-counters`: "Exile any number of target creatures and/or planeswalkers you control. At the beginning of the next end step, return each of them to
 * the battlefield under its owner's control. Each of them enters with an additional +1/+1 counter on it if it's a creature and an additional loyalty counter on it if it's a planeswalker."
 * (Semester's End; CR 701.13, 603.7, 603.7c, 400.7, 122.6, 614.1c): the targets are exiled, and a delayed ability returns the objects exiled, each as a new object, with a counter more for
 * each of the two kinds it is as it enters. Three sentences that `splitSentences` keeps together. The engine's `exile` and a `delayedTrigger` of a `moveToZone` of `moved` with
 * `withCounters` by type. Not read: another group of targets, another step, a different counter, "tapped", the controller's control, one sentence of the three left out.
 */
export const EFFECT_EXILE_RETURN_NEXT_END_STEP_WITH_COUNTERS = defineRule<Clauses>({
  id: SEMESTER_ID,
  family: 'effect',
  leading: ['exile'],
  cites: [
    'CR 701.13 (Exile)',
    'CR 603.7 (Delayed Triggered Abilities)',
    'CR 603.7c (Delayed Triggered Abilities)',
    'CR 400.7 (General)',
    'CR 122.6 (Counters)',
  ],
  examples: [
    "exile any number of target creatures and/or planeswalkers you control. At the beginning of the next end step, return each of them to the battlefield under its owner's control. Each of them enters with an additional +1/+1 counter on it if it's a creature and an additional loyalty counter on it if it's a planeswalker",
  ],
  rejects: [
    "exile any number of target creatures and/or planeswalkers you control. At the beginning of the next end step, return each of them to the battlefield under its owner's control",
    "exile any number of target creatures you control. At the beginning of the next end step, return each of them to the battlefield under its owner's control. Each of them enters with an additional +1/+1 counter on it if it's a creature and an additional loyalty counter on it if it's a planeswalker",
    "exile any number of target creatures and/or planeswalkers you control. At the beginning of your next end step, return each of them to the battlefield under its owner's control. Each of them enters with an additional +1/+1 counter on it if it's a creature and an additional loyalty counter on it if it's a planeswalker",
    "exile any number of target creatures and/or planeswalkers you control. At the beginning of the next end step, return each of them to the battlefield under your control. Each of them enters with an additional +1/+1 counter on it if it's a creature and an additional loyalty counter on it if it's a planeswalker",
    "exile any number of target creatures and/or planeswalkers you control. At the beginning of the next end step, return each of them to the battlefield under its owner's control. Each of them enters with two additional +1/+1 counters on it if it's a creature and an additional loyalty counter on it if it's a planeswalker",
    "exile target creature or planeswalker you control. At the beginning of the next end step, return it to the battlefield under its owner's control. It enters with an additional +1/+1 counter on it if it's a creature and an additional loyalty counter on it if it's a planeswalker",
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      literal('exile '),
      satisfy(family<IrNoun>('noun', { only: ['noun.any-number-targets'] }), (n) => {
        const kinds = (n.filter.anyOf ?? []).flatMap((m) => m.types ?? []);
        return (
          n.filter.controller === 'you' &&
          kinds.length === 2 &&
          kinds.includes('creature') &&
          kinds.includes('planeswalker') &&
          !n.other
        );
      }),
      pattern(
        /\. at the beginning of the next end step, return each of them to the battlefield under its owner['’]s control\. each of them enters with an additional \+1\/\+1 counter on it if it['’]s a creature and an additional loyalty counter on it if it['’]s a planeswalker(?![\p{L}\p{N}])/iu,
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, objects] = r.value;
    return {
      ok: true,
      value: [
        makeClause(
          SEMESTER_ID,
          'exileReturnNextEndStepCounters',
          { objects },
          { start: pos, end: r.pos },
        ),
      ],
      pos: r.pos,
    };
  },
});

const FORGET_ID = 'effect.forget-loyalty-activations';

/**
 * `effect.forget-loyalty-activations`: "For each planeswalker you control, you may activate one of its loyalty abilities once this turn as though none of its loyalty abilities have been
 * activated this turn." (The Chain Veil; CR 606.3): every planeswalker the controller controls as the effect resolves may be activated once more this turn. The engine's
 * `forgetLoyaltyActivations` of those planeswalkers; the activation itself is the player's own, nothing is forced. Not read: another group, "target", another span, a number of times.
 */
export const EFFECT_FORGET_LOYALTY_ACTIVATIONS = defineRule<Clauses>({
  id: FORGET_ID,
  family: 'effect',
  leading: ['for'],
  cites: ['CR 606.3 (Loyalty Abilities)', 'CR 606.2 (Loyalty Abilities)'],
  examples: [
    'for each planeswalker you control, you may activate one of its loyalty abilities once this turn as though none of its loyalty abilities have been activated this turn',
  ],
  rejects: [
    'for each planeswalker you control, you may activate one of its loyalty abilities once this turn as though none of its loyalty abilities have been activated this turn and draw a card',
    'for each planeswalker, you may activate one of its loyalty abilities once this turn as though none of its loyalty abilities have been activated this turn',
    'for each creature you control, you may activate one of its loyalty abilities once this turn as though none of its loyalty abilities have been activated this turn',
    'for each planeswalker you control, you may activate one of its loyalty abilities twice this turn as though none of its loyalty abilities have been activated this turn',
    'for each planeswalker you control, you may activate one of its loyalty abilities once this turn',
  ],
  parse: (ctx, pos) => {
    const r = pattern(
      /for each planeswalker you control, you may activate one of its loyalty abilities once this turn as though none of its loyalty abilities have been activated this turn(?![\p{L}\p{N}])/iu,
    )(ctx, pos);
    if (!r.ok) return r;
    const span = { start: pos, end: r.pos };
    const objects: IrNoun = {
      kind: 'noun',
      det: 'each',
      filter: { types: ['planeswalker'], controller: 'you', raw: 'each planeswalker you control' },
      upTo: false,
      plural: true,
      other: false,
      span,
      rule: FORGET_ID,
    };
    return {
      ok: true,
      value: [makeClause(FORGET_ID, 'forgetLoyaltyActivations', { objects }, span)],
      pos: r.pos,
    };
  },
});

const ADD_ONE_OF_ID = 'effect.add-one-of-noncreature-only';

/**
 * `effect.add-one-of-noncreature-only`: "Add {U}, {R}, or {W}. Spend this mana only to cast a noncreature spell." (Narset of the Ancient Way; CR 106.1b, 106.6, 205.2a): one mana of a
 * color the controller chooses from those listed, as the effect resolves, that can pay only for a spell with no creature type among its card types. Two sentences that
 * `splitSentences` keeps together. The engine's `chooseOne` of the colors, each an `addMana` with `spendOnly` `notTypes` creature. Not read: one color, a different restriction, a number
 * of mana, any color.
 */
export const EFFECT_ADD_ONE_OF_NONCREATURE_ONLY = defineRule<Clauses>({
  id: ADD_ONE_OF_ID,
  family: 'effect',
  leading: ['add'],
  cites: [
    'CR 106.1b (Mana)',
    'CR 106.6 (Mana)',
    'CR 205.2a (Card Types)',
    'CR 608.2d (Resolving Spells and Abilities)',
  ],
  examples: [
    'add {U}, {R}, or {W}. Spend this mana only to cast a noncreature spell',
    'Add {R} or {G}. Spend this mana only to cast a noncreature spell',
  ],
  rejects: [
    'add {U}, {R}, or {W}',
    'add {U}. Spend this mana only to cast a noncreature spell',
    'add {U}, {R}, or {W}. Spend this mana only to cast a creature spell',
    'add {U}{R}. Spend this mana only to cast a noncreature spell',
    'add {U}, {R}, or {W}. Spend this mana only to cast noncreature spells',
    'add {U}, {R}, or {W}. Spend this mana only to cast a noncreature spell and draw a card',
    'add {U}, {R}, and {W}. Spend this mana only to cast a noncreature spell',
  ],
  parse: (ctx, pos) => {
    const r = pattern(
      /add ((?:\{[WUBRG]\}, )+\{[WUBRG]\}, or \{[WUBRG]\}|\{[WUBRG]\} or \{[WUBRG]\})\. spend this mana only to cast a noncreature spell(?![\p{L}\p{N}])/iu,
    )(ctx, pos);
    if (!r.ok) return r;
    const colors = [...(r.value[1] ?? '').matchAll(/\{([WUBRG])\}/gi)].map((m) =>
      (m[1] ?? '').toUpperCase(),
    );
    if (new Set(colors).size !== colors.length) return fail(ctx, pos);
    const span = { start: pos, end: r.pos };
    const list = { kind: 'keywordName' as const, name: colors.join(''), span, rule: ADD_ONE_OF_ID };
    return {
      ok: true,
      value: [makeClause(ADD_ONE_OF_ID, 'addOneOfNoncreatureOnly', { colors: list }, span)],
      pos: r.pos,
    };
  },
});

const DRAW_MAY_DISCARD_ID = 'effect.draw-then-may-discard';

/**
 * `effect.draw-then-may-discard`: "Draw a card, then you may discard a card." (Narset of the Ancient Way; CR 121.1, 701.9, 608.2d): the draw, and a discard the controller may decline
 * (the engine's `draw` and an optional `discard`, so that "When you discard a nonland card this way" after it reads what was discarded). Not read: "discard a card" without "may"
 * (`effect.draw` and `effect.discard` joined by the sentence), a number of cards other than one, "at random", more after it.
 */
export const EFFECT_DRAW_THEN_MAY_DISCARD = defineRule<Clauses>({
  id: DRAW_MAY_DISCARD_ID,
  family: 'effect',
  leading: ['draw'],
  cites: [
    'CR 121.1 (Drawing a Card)',
    'CR 701.9 (Discard)',
    'CR 608.2d (Resolving Spells and Abilities)',
  ],
  examples: ['draw a card, then you may discard a card'],
  rejects: [
    'draw a card, then discard a card',
    'draw two cards, then you may discard a card',
    'draw a card, then you may discard two cards',
    'draw a card, then you may discard a card at random',
    'draw a card, then you may discard a card and draw a card',
    'draw a card, you may discard a card',
  ],
  parse: (ctx, pos) => {
    const r = pattern(
      /draw a card, then you may discard a card(?![\p{L}\p{N}])(?!\s+(?:at|and|unless))/iu,
    )(ctx, pos);
    if (!r.ok) return r;
    const span = { start: pos, end: r.pos };
    const one = (rule: string) => ({ kind: 'number' as const, value: 1, span, rule });
    return {
      ok: true,
      value: [
        {
          ...makeClause(
            DRAW_MAY_DISCARD_ID,
            'draw',
            { player: impliedYou(DRAW_MAY_DISCARD_ID, pos), amount: one(DRAW_MAY_DISCARD_ID) },
            span,
          ),
          connector: 'then' as const,
        },
        makeClause(DRAW_MAY_DISCARD_ID, 'discardMayOne', {}, span),
      ],
      pos: r.pos,
    };
  },
});

const MOVE_ID = 'effect.move-counter-from-self';

/**
 * `effect.move-counter-from-self`: "move a loyalty counter from ~ onto that planeswalker" (Gatewatch Beacon; CR 122.1, 122.6): one counter of a named kind from the permanent with the
 * ability onto the permanent the trigger is about. The engine's `moveCounterFromThis`. Not read: "any number" (`effect.move-counters-onto-others`), a number of counters other than "a",
 * the counters of another permanent, a target, another noun than "that [type]".
 */
export const EFFECT_MOVE_COUNTER_FROM_SELF = defineRule<Clauses>({
  id: MOVE_ID,
  family: 'effect',
  leading: ['move'],
  cites: [
    'CR 122.1 (Counters)',
    'CR 122.6 (Counters)',
    'CR 608.2c (Resolving Spells and Abilities)',
  ],
  examples: [
    'move a loyalty counter from ~ onto that planeswalker',
    'move a +1/+1 counter from ~ onto that creature',
  ],
  rejects: [
    'move a loyalty counter from ~ onto target planeswalker',
    'move two loyalty counters from ~ onto that planeswalker',
    'move a loyalty counter from target planeswalker onto that planeswalker',
    'move any number of loyalty counters from ~ onto that planeswalker',
    'move a loyalty counter from ~ onto that planeswalker and draw a card',
    'move a loyalty counter from ~ onto that',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      literal('move a '),
      spanned(pattern(/[+-]\d+\/[+-]\d+|[a-z]+/i)),
      literal(' counter from ~ onto '),
      family<IrNoun>('noun', { only: ['noun.that-object'] }),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, counterWord, , noun] = r.value;
    const counter: IrCounterSpec = {
      kind: 'counterSpec',
      name: counterWord.value[0].toLowerCase(),
      span: counterWord.span,
      rule: MOVE_ID,
    };
    return {
      ok: true,
      value: [
        makeClause(
          MOVE_ID,
          'moveCounterFromThis',
          { counter, objects: noun },
          { start: pos, end: r.pos },
        ),
      ],
      pos: r.pos,
    };
  },
});

export const PLANESWALKER_PARTY_EFFECT_RULES = [
  quietly(EFFECT_DAMAGE_EXILE_IF_DIES),
  quietly(EFFECT_MOVE_COUNTER_FROM_SELF),
  quietly(EFFECT_DRAW_THEN_MAY_DISCARD),
  quietly(EFFECT_ADD_ONE_OF_NONCREATURE_ONLY),
  quietly(EFFECT_FORGET_LOYALTY_ACTIVATIONS),
  quietly(EFFECT_EXILE_RETURN_NEXT_END_STEP_WITH_COUNTERS),
  quietly(EFFECT_CHOOSE_DIRECTION_ATTACK_NEAREST),
  quietly(EFFECT_REMOVE_COUNTER_FROM_EACH_CHOSEN),
  quietly(EFFECT_EXILE_THAT_MANY_TOP),
  quietly(EFFECT_MAY_CAST_MOVED_CARD),
  quietly(EFFECT_LEAD_MAY_CAST_KIND_FROM_THOSE_FREE),
  quietly(EFFECT_EACH_DEALS_DAMAGE_TO_THAT),
  quietly(EFFECT_LEAD_EACH_BECOMES_CREATURE),
  quietly(EFFECT_LEAD_THEY_BECOME_COLORED_CREATURES_ABILITY),
  ...GUFF_EFFECT_RULES.map(quietly),
  ...VRONOS_EFFECT_RULES.map(quietly),
  ...COPY_LOYALTY_EFFECT_RULES.map(quietly),
];
