/**
 * Effect rules of group 1 of the Galadriel deck (issue 43): reveal the top card and do something when it is of a kind (Track Down, Elven Farsight, Galadriel of Lothlorien), look at
 * the top card and put it onto the battlefield when it is a land or a creature with a mana value up to a number (Nissa, Steward of Elements), and "They become 5/5 Elemental creatures
 * ... They're still lands." (Nissa). The engine runs `revealTop`, `lookAtTop` and the additive `setTypes` (rules/reveal-top.ts, rules/look-take.ts, rules/continuous.ts); only the words are
 * new. A sentence the text splits in two is kept together by the segmenter (`segment.ts`).
 */
import {
  choice,
  fail,
  literal,
  map,
  optional,
  type Parser,
  pattern,
  sequence,
} from '../../combinators';
import type { IrArg, IrBasePt, IrClause, IrDuration, IrFilter, IrNoun } from '../../ir/types';
import { NUMBER_OF_COUNTERS } from '../amount/value';
import { KEYWORD_WORDS } from '../keyword/list';
import { BOUNDARY, CARD_TYPES } from '../noun/phrases';
import { defineRule, family, quietly, spanned } from '../registry';
import { CREATURE_TYPE_LIST } from './becomes';
import { flag } from './dragons';
import { TAKEN_CARD } from './library';
import { type Clauses, makeClause } from './operands';

/**
 * What may follow the end of one of these rules' phrases: nothing that joins another instruction to it ("..., draw a card and gain 1 life", "... then ..."): the instruction the
 * text adds would be done whether or not the card was of the kind, which is not what it says, so the whole line is left unread.
 */
const MORE_AFTER = /^(?:,| and\b| then\b)/iu;

/** ". Otherwise, put that card into your hand": the second place of a card that is not of the kind (the two sentences are kept together by the segmenter). */
const OTHERWISE_INTO_HAND = new RegExp(
  `\\.\\s+otherwise, put that card into your hand${BOUNDARY}`,
  'iu',
);

/** What is done when the card revealed is of the kind: the effects of `effect.reveal-top-then`. */
type Then = 'draw' | 'battlefield' | 'battlefieldTapped' | 'hand';

const THEN: Parser<Then> = choice(
  map(pattern(new RegExp(`draw a card${BOUNDARY}`, 'iu')), (): Then => 'draw'),
  map(
    pattern(new RegExp(`put it onto the battlefield tapped${BOUNDARY}`, 'iu')),
    (): Then => 'battlefieldTapped',
  ),
  map(
    pattern(new RegExp(`put it onto the battlefield${BOUNDARY}`, 'iu')),
    (): Then => 'battlefield',
  ),
  map(pattern(new RegExp(`put it into your hand${BOUNDARY}`, 'iu')), (): Then => 'hand'),
);

/**
 * `effect.reveal-top-then`: "reveal the top card of your library. If it's a creature or land card, draw a card." (Track Down) and "reveal the top card of your library. If a land card
 * is revealed this way, put it onto the battlefield tapped." (Galadriel of Lothlorien, and with "you may" Elven Farsight; CR 701.20a: revealing shows the card to every player, it stays
 * in the library; CR 608.2c: the second sentence is read as the effect comes up). The sentence after the reveal says what is done when the card is of a kind: draw a card, or put it onto the
 * battlefield (tapped or not) or into the hand. The engine's `revealTop` of your own library. "You may" is read where the text puts it (the clause before: `optional`). Not read: more than
 * the top card, another library, a second instruction after the comma, a verb the engine's `revealTop` does not run ("exile it", "gain life equal to its mana value"), "it's" with no card.
 */
export const EFFECT_REVEAL_TOP_THEN = defineRule<Clauses>({
  id: 'effect.reveal-top-then',
  family: 'effect',
  leading: ['reveal', 'you'],
  cites: [
    'CR 701.20a (Reveal)',
    'CR 608.2c (Resolving Spells and Abilities)',
    'CR 401.5 (Library)',
  ],
  examples: [
    "reveal the top card of your library. If it's a creature or land card, draw a card",
    // Issue 310 (Coiling Oracle, CR 608.2c): the card that is not of the kind goes into the hand.
    "reveal the top card of your library. If it's a land card, put it onto the battlefield. Otherwise, put that card into your hand",
    'reveal the top card of your library. If a land card is revealed this way, put it onto the battlefield tapped',
    'reveal the top card of your library. If a creature card is revealed this way, draw a card',
    'reveal the top card of your library. If a land card is revealed this way, put it onto the battlefield',
    'reveal the top card of your library. If an artifact card is revealed this way, put it into your hand',
    'reveal the top card of your library. If it’s a land card, put it onto the battlefield tapped',
    'you may reveal the top card of your library. If a creature card is revealed this way, draw a card',
  ],
  rejects: [
    'reveal the top card of your library',
    'reveal the top two cards of your library. If a land card is revealed this way, draw a card',
    "reveal the top card of target player's library. If it's a land card, draw a card",
    "reveal the top card of your library. If it's a land card, draw two cards",
    "reveal the top card of your library. If it's a land card, exile it",
    "reveal the top card of your library. If it's a land card, draw a card and gain 1 life",
    'reveal the top card of your library. If a land card is revealed this way, put it onto the battlefield tapped and draw a card',
    'reveal the top card of your library. If a land is revealed this way, put it onto the battlefield tapped',
    'reveal the top card of your library. If land card is revealed this way, draw a card',
    'reveal the top card of your library. Draw a card',
    "reveal the top card of their library. If it's a land card, draw a card",
    'reveal the top card of your library. If a land card is revealed, draw a card',
    'you may reveal the top card of your library',
    'you reveal the top card of your library. If a land card is revealed this way, draw a card',
    "reveal the top card of your library. If it's a land card, draw a card. Otherwise, put that card into your hand",
    "reveal the top card of your library. If it's a land card, put it onto the battlefield. Otherwise, put that card into your graveyard",
    "reveal the top card of your library. If it's a land card, put it onto the battlefield. Otherwise, put that card into your hand and draw a card",
    "reveal the top card of your library. If it's a land card, put it into your hand. Otherwise, put that card into your hand",
  ],
  parse: (ctx, pos) => {
    const id = 'effect.reveal-top-then';
    // "Scry 3, then you may reveal ...": the offer of the clause (the "you may" at the start of a whole ability is the ability's own, read before this rule).
    const head = pattern(/(you may )?reveal the top card of your library\. if /iu)(ctx, pos);
    if (!head.ok) return head;
    const offered = head.value[1] !== undefined;
    // "If it's a creature or land card, ..." or "If a land card is revealed this way, ...": the kind of card is the same list of types and subtypes of a card taken from the top.
    const itIs = pattern(/it['’]s /iu)(ctx, head.pos);
    const card = TAKEN_CARD(ctx, itIs.ok ? itIs.pos : head.pos);
    if (!card.ok) return card;
    const middle = itIs.ok
      ? pattern(/, /u)(ctx, card.pos)
      : pattern(/ is revealed this way, /iu)(ctx, card.pos);
    if (!middle.ok) return middle;
    const then = THEN(ctx, middle.pos);
    if (!then.ok) return then;
    // "... put it onto the battlefield. Otherwise, put that card into your hand." (CR 608.2c): the card that is not of the kind goes into the hand. Only after a card put onto the battlefield.
    const otherwise =
      then.value === 'battlefield' || then.value === 'battlefieldTapped'
        ? pattern(OTHERWISE_INTO_HAND)(ctx, then.pos)
        : null;
    const end = otherwise?.ok === true ? otherwise.pos : then.pos;
    if (MORE_AFTER.test(ctx.text.slice(end))) return fail(ctx, pos);
    const span = { start: pos, end };
    const args: Record<string, IrArg> = {
      what: card.value,
      draw: flag(id, then.value === 'draw', span),
      ...(then.value === 'draw' ? {} : { hand: flag(id, then.value === 'hand', span) }),
      ...(then.value === 'battlefieldTapped' ? { tapped: flag(id, true, span) } : {}),
      ...(otherwise?.ok === true ? { otherwise: flag(id, true, span) } : {}),
    };
    const clause = makeClause(id, 'revealTopThen', args, span);
    return {
      ok: true,
      value: [offered ? { ...clause, optional: true } : clause],
      pos: end,
    };
  },
});

const NOT_LAND_TYPE = new RegExp(`(?!land${BOUNDARY})(${CARD_TYPES})${BOUNDARY}`, 'iu');

/**
 * `effect.look-top-put`: "look at the top card of your library. If it's a land card or a creature card with mana value less than or equal to the number of loyalty counters on ~, you may
 * put that card onto the battlefield." (CR 401.2, 701.20a: the card looked at stays on top of the library unless it is put onto the battlefield; CR 202.3: a land card has mana value 0, so
 * the limit is read of the other kind alone; CR 122.1: the loyalty counters of the planeswalker as the ability resolves). The engine's `lookAtTop` of one card with a mana value limit.
 * Only a land card and one other card type, in that order, with the limit "less than or equal to" an amount; the amount is read by the amount rules. Not read: more than one card, another
 * zone, "it's a land card" alone (`effect.look-top-take` reads that), another first kind, "or" with no limit, "into your hand", a card put onto the battlefield tapped.
 */
export const EFFECT_LOOK_TOP_PUT = defineRule<Clauses>({
  id: 'effect.look-top-put',
  family: 'effect',
  leading: ['look'],
  cites: [
    'CR 401.2 (Library)',
    'CR 701.20a (Reveal)',
    'CR 202.3 (Mana Value)',
    'CR 122.1 (Counters)',
  ],
  examples: [
    "look at the top card of your library. If it's a land card or a creature card with mana value less than or equal to the number of loyalty counters on ~, you may put that card onto the battlefield",
    "look at the top card of your library. If it's a land card or an artifact card with mana value less than or equal to the number of loyalty counters on ~, you may put that card onto the battlefield",
    'look at the top card of your library. If it’s a land card or a creature card with mana value less than or equal to the number of +1/+1 counters on ~, you may put that card onto the battlefield',
  ],
  rejects: [
    'look at the top card of your library',
    "look at the top card of your library. If it's a land card or a creature card, you may put that card onto the battlefield",
    "look at the top card of your library. If it's a land card, you may put that card onto the battlefield",
    "look at the top card of your library. If it's a creature card or a land card with mana value less than or equal to the number of loyalty counters on ~, you may put that card onto the battlefield",
    "look at the top card of your library. If it's a land card or a land card with mana value less than or equal to the number of loyalty counters on ~, you may put that card onto the battlefield",
    "look at the top card of your library. If it's a land card or a creature card with mana value less than or equal to the number of loyalty counters on ~, you may put that card into your hand",
    "look at the top card of your library. If it's a land card or a creature card with mana value less than or equal to the number of loyalty counters on ~, you may put that card onto the battlefield tapped",
    "look at the top two cards of your library. If it's a land card or a creature card with mana value less than or equal to the number of loyalty counters on ~, you may put that card onto the battlefield",
    "look at the top card of your library. If it's a land card or a creature card with mana value 3 or less, you may put that card onto the battlefield",
    "look at the top card of target player's library. If it's a land card or a creature card with mana value less than or equal to the number of loyalty counters on ~, you may put that card onto the battlefield",
    "look at the top card of your library. If it's a land card or a creature card with mana value less than or equal to the number of loyalty counters on ~, put that card onto the battlefield",
  ],
  parse: (ctx, pos) => {
    const id = 'effect.look-top-put';
    const head = pattern(/look at the top card of your library\. if it['’]s a land card or an? /iu)(
      ctx,
      pos,
    );
    if (!head.ok) return head;
    const other = pattern(NOT_LAND_TYPE)(ctx, head.pos);
    if (!other.ok) return other;
    const middle = literal(' card with mana value less than or equal to ')(ctx, other.pos);
    if (!middle.ok) return middle;
    const amount = NUMBER_OF_COUNTERS(id)(ctx, middle.pos);
    if (!amount.ok) return amount;
    const tail = pattern(
      new RegExp(`, you may put that card onto the battlefield${BOUNDARY}`, 'iu'),
    )(ctx, amount.pos);
    if (!tail.ok) return tail;
    if (MORE_AFTER.test(ctx.text.slice(tail.pos))) return fail(ctx, pos);
    const span = { start: pos, end: tail.pos };
    const otherType = (other.value[1] ?? '').toLowerCase();
    const filter: IrFilter = {
      anyOf: [
        { types: ['land'], raw: 'land' },
        { types: [otherType], raw: otherType },
      ],
      card: true,
      raw: ctx.text.slice(head.pos - 'a land card or a '.length, other.pos),
    };
    const take: IrNoun = {
      kind: 'noun',
      det: 'a',
      filter,
      upTo: false,
      plural: false,
      other: false,
      span: { start: head.pos, end: other.pos },
      rule: id,
    };
    return {
      ok: true,
      value: [
        makeClause(
          id,
          'lookTake',
          {
            count: { kind: 'number', value: 1, span },
            take,
            toGraveyard: flag(id, false, span),
            ontoBattlefield: flag(id, true, span),
            onTop: flag(id, true, span),
            manaValueAtMost: amount.value,
          },
          span,
        ),
      ],
      pos: tail.pos,
    };
  },
});

/** The plural card types a sentence "They're still lands." may say: the types the permanents keep (CR 205.1b). */
const STILL_TYPES = 'artifacts|creatures|enchantments|lands|planeswalkers';

/**
 * `effect.they-become-creatures`: "They become 5/5 Elemental creatures with flying and haste until end of turn. They're still lands." (CR 205.1b, 613.1d, 613.4b, 611.2a: the permanents the
 * effect before it named, a target slot, are creatures of the types and base power and toughness the text says until the end of the turn, with the keywords it names; the second sentence says
 * they keep the types they had, which is the engine's additive `setTypes`). The engine's `setTypes`, `setPt` and `grantKeyword` over the same targets. Only "they" with "until end of turn" and
 * the second sentence; not read: "it becomes" (`effect.lead-becomes-creature` and `effect.becomes`), a duration of another length, no base power and toughness, no creature type, a second
 * sentence that is not "They're still <plural type>", a color, a keyword the engine cannot grant.
 */
export const EFFECT_THEY_BECOME_CREATURES = defineRule<Clauses>({
  id: 'effect.they-become-creatures',
  family: 'effect',
  leading: ['they'],
  cites: [
    'CR 205.1b (Type Line)',
    'CR 611.2a (Continuous Effects)',
    'CR 613.1d (Interaction of Continuous Effects)',
    'CR 613.4b (Interaction of Continuous Effects)',
  ],
  examples: [
    "they become 5/5 Elemental creatures with flying and haste until end of turn. They're still lands",
    "they become 4/4 Elemental creatures until end of turn. They're still lands",
    "They become 3/3 Elemental creatures with haste until end of turn. They're still lands",
    'they become 5/5 Elemental creatures with flying, trample, and haste until end of turn. They’re still lands',
  ],
  rejects: [
    'they become 5/5 Elemental creatures with flying and haste until end of turn',
    "they become 5/5 Elemental creatures with flying and haste until end of turn. They're lands",
    "they become 5/5 Elemental creatures with flying and haste until your next turn. They're still lands",
    "they become Elemental creatures with flying and haste until end of turn. They're still lands",
    "they become 5/5 creatures with flying and haste until end of turn. They're still lands",
    "they become 5/5 Elemental creatures with flying and haste. They're still lands",
    "it becomes a 5/5 Elemental creature with flying and haste until end of turn. It's still a land",
    "they become 5/5 blue Elemental creatures with flying and haste until end of turn. They're still lands",
    "they become 5/5 Elemental creatures with flying and sparkle until end of turn. They're still lands",
    "they become 5/5 Elemental creatures with flying and haste until end of turn. They're still land",
    "they become 5/5 Elemental creatures with flying and haste until end of turn. They're still lands and gain trample",
    "they become +5/+5 Elemental creatures with flying and haste until end of turn. They're still lands",
  ],
  parse: (ctx, pos) => {
    const id = 'effect.they-become-creatures';
    const r = sequence(
      literal('they become '),
      spanned(pattern(/(\d+)\/(\d+) /u)),
      spanned(CREATURE_TYPE_LIST),
      literal(' creatures'),
      optional(spanned(sequence(literal(' with '), KEYWORD_WORDS)), null),
      literal(' '),
      family<IrDuration>('duration'),
      pattern(new RegExp(`\\. they['’]re still (?:${STILL_TYPES})${BOUNDARY}`, 'iu')),
    )(ctx, pos);
    if (!r.ok) return r;
    if (MORE_AFTER.test(ctx.text.slice(r.pos))) return fail(ctx, pos);
    const [, pt, types, , keywords, , duration] = r.value;
    // The permanents the text names are the ones the sentence before it did (the binding pass reads the plural "they").
    const subject: IrNoun = {
      kind: 'noun',
      det: 'anaphor',
      // "them" is what the binding pass reads: the plural antecedent (the permanents of the target slot before; its own "they" is the pronoun of a player).
      filter: { raw: 'them' },
      upTo: false,
      plural: true,
      other: false,
      span: { start: pos, end: pos + 4 },
      rule: id,
    };
    const basePt: IrBasePt = {
      kind: 'basePt',
      power: Number(pt.value[1]),
      toughness: Number(pt.value[2]),
      span: pt.span,
      rule: id,
    };
    const typeList = {
      kind: 'typeList' as const,
      subtypes: types.value,
      cardTypes: ['creature'],
      additive: true as const,
      span: types.span,
      rule: id,
    };
    const clauses: IrClause[] = [
      {
        ...makeClause(id, 'becomes', { objects: subject, types: typeList, basePt }, types.span),
        duration,
        ...(keywords === null ? {} : { connector: 'and' as const }),
      },
    ];
    if (keywords !== null) {
      const words = keywords.value[1];
      words.forEach((name, i) => {
        const keyword = { kind: 'keywordName' as const, name, span: keywords.span, rule: id };
        const clause = makeClause(id, 'grantKeyword', { objects: subject, keyword }, keywords.span);
        clauses.push({
          ...clause,
          duration,
          ...(i < words.length - 1 ? { connector: 'and' as const } : {}),
        });
      });
    }
    return { ok: true, value: clauses, pos: r.pos };
  },
});

export const GALADRIEL_G1_EFFECT_RULES = [
  EFFECT_REVEAL_TOP_THEN,
  EFFECT_LOOK_TOP_PUT,
  EFFECT_THEY_BECOME_CREATURES,
].map(quietly);
