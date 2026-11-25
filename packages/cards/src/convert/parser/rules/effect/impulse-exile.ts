/**
 * Effect rules of the Grand Larceny deck, group A (Thief of Sanity, Gonti, Canny Acquisitor, Dream-Thief's Bandana, Siphon Insight, Predators' Hour, Cunning Rhetoric, Heartless
 * Conscription): cards taken from another player's library or from the battlefield into exile, which the controller may play for as long as they stay there, paying with mana of any
 * type or any color. The lowerings are in `lower/impulse-exile.ts`.
 */
import {
  choice,
  fail,
  literal,
  map,
  type Parser,
  pattern,
  satisfy,
  sequence,
} from '../../combinators';
import type {
  IrAmount,
  IrArg,
  IrClause,
  IrDuration,
  IrKeywordArg,
  IrNoun,
  Span,
} from '../../ir/types';
import { KEYWORD_WORDS } from '../keyword/list';
import { BOUNDARY } from '../noun/phrases';
import { defineRule, family, quietly, spanned } from '../registry';
import { readQuotedAbility } from '../static/quoted';
import { makeNoun } from '../trigger/subjects';
import { flag } from './dragons';
import { type Clauses, makeClause, single } from './operands';

const NUMBER = family<IrArg>('amount', { only: ['amount.number'] });

/** "that player's library" and "their library" in a trigger about a player: the player the trigger names (`triggerActor`, CR 603.2). */
function thatPlayer(rule: string): Parser<IrNoun> {
  return map(spanned(pattern(/(?:that player['’]s|their) library(?![\p{L}\p{N}])/iu)), ({ span }) =>
    makeNoun(rule, span, 'triggerActor', { raw: 'that player' }),
  );
}

const LOOK_RULE = 'effect.look-exile-face-down-one';

/**
 * `effect.look-exile-face-down-one`: "look at the top card of that player's library, then exile it face down", "look at the top three cards of that player's library, exile one of them
 * face down, then put the rest into their graveyard" (Thief of Sanity), "look at the top two cards of target opponent's library. Exile one of them face down and put the other on the
 * bottom of that library" (Siphon Insight; the two sentences are one instruction, kept together by `splitSentences`) (CR 401.2, 406.3, 701.20, 404.1: the controller looks at the cards,
 * which belong to the owner of the library, exiles one face down and puts the rest where the text says). The engine's `lookAtTop` with `from` and `take.to` `exileFaceDownUnlinked`; the
 * card is what the permission after it names. Not read: your own library, each opponent, "one of them" of a single card, "it" of several, another place for the rest, the card face up,
 * a trailing instruction in the sentence.
 */
export const EFFECT_LOOK_EXILE_FACE_DOWN_ONE = defineRule<Clauses>({
  id: LOOK_RULE,
  family: 'effect',
  leading: ['look'],
  cites: ['CR 401.2 (Library)', 'CR 406.3 (Exile)', 'CR 701.20 (Reveal)', 'CR 404.1 (Graveyard)'],
  examples: [
    "look at the top card of that player's library, then exile it face down",
    'look at the top card of their library, then exile it face down',
    "look at the top three cards of that player's library, exile one of them face down, then put the rest into their graveyard",
    "look at the top two cards of target opponent's library. exile one of them face down and put the other on the bottom of that library",
  ],
  rejects: [
    'look at the top card of your library, then exile it face down',
    "look at the top card of each opponent's library, then exile it face down",
    "look at the top card of that player's library, then exile it",
    "look at the top card of that player's library, exile one of them face down, then put the rest into their graveyard",
    "look at the top three cards of that player's library, then exile it face down",
    "look at the top three cards of that player's library, exile one of them face down, then put the rest into your graveyard",
    "look at the top three cards of that player's library, exile one of them face down, then put the rest on the bottom of that library",
    "look at the top three cards of target opponent's library. exile one of them face down and put the other on the bottom of that library",
    "look at the top two cards of that player's library. exile one of them face down and put the other on the bottom of that library",
    "look at the top card of that player's library, then exile it face down and draw a card",
  ],
  parse: (ctx, pos) => {
    const head = literal('look at the top ')(ctx, pos);
    if (!head.ok) return head;
    const counted = spanned(
      choice<number>(
        map(pattern(new RegExp(`card${BOUNDARY}`, 'iu')), () => 1),
        map(
          sequence(
            satisfy(NUMBER, (a) => a.kind === 'number' && a.value >= 2),
            literal(' cards'),
          ),
          ([n]) => (n.kind === 'number' ? n.value : 0),
        ),
      ),
    )(ctx, head.pos);
    if (!counted.ok) return counted;
    const count = counted.value.value;
    const of = literal(' of ')(ctx, counted.pos);
    if (!of.ok) return of;
    const player = thatPlayer(LOOK_RULE);
    const owner = choice<{ noun: IrNoun; target: boolean }>(
      map(player, (noun) => ({ noun, target: false })),
      map(
        sequence(
          satisfy(
            family<IrNoun>('noun', { only: ['noun.player'] }),
            (n) => n.det === 'target' && n.filter.player === 'opponent',
          ),
          pattern(/['’]s library(?![\p{L}\p{N}])/iu),
        ),
        ([noun]) => ({ noun, target: true }),
      ),
    )(ctx, of.pos);
    if (!owner.ok) return owner;
    // The three wordings of what happens next, each tied to the number of cards and to who owns the library.
    const tail = pattern(
      new RegExp(
        `(, then exile it face down|, exile one of them face down, then put the rest into their graveyard|\\. exile one of them face down and put the other on the bottom of that library)${BOUNDARY}(?!,| and\\b| then\\b)`,
        'iu',
      ),
    )(ctx, owner.pos);
    if (!tail.ok) return tail;
    const said = (tail.value[1] ?? '').toLowerCase();
    const wording = said.startsWith(', then exile it')
      ? 'one'
      : said.startsWith(', exile one')
        ? 'graveyard'
        : 'bottom';
    if (wording === 'one' ? count !== 1 : count < 2) return fail(ctx, pos);
    if (wording === 'graveyard' && owner.value.target) return fail(ctx, pos);
    if (wording === 'bottom' && (count !== 2 || !owner.value.target)) return fail(ctx, pos);
    const span: Span = { start: pos, end: tail.pos };
    const amount: IrAmount = { kind: 'number', value: count, span: counted.value.span };
    const args: Record<string, IrArg> = {
      count: amount,
      from: owner.value.noun,
      ...(wording === 'graveyard' ? { restGraveyard: flag(LOOK_RULE, true, span) } : {}),
    };
    return {
      ok: true,
      value: [makeClause(LOOK_RULE, 'lookExileFaceDownOne', args, span)],
      pos: tail.pos,
    };
  },
});

const FACE_DOWN_RULE = 'effect.exile-top-that-player-face-down';

/**
 * `effect.exile-top-that-player-face-down`: "exile the top card of that player's library face down" (Predators' Hour; CR 701.13, 406.3, 603.2): the controller exiles the top card of the
 * library of the player the trigger names, face down, so that nobody may look at it until an effect allows it. The engine's `exileTop` with `from` and `faceDown`. Not read: another
 * number of cards, target players, the card face up (`effect.exile-top-of-that-player`), a trailing instruction in the sentence.
 */
export const EFFECT_EXILE_TOP_THAT_PLAYER_FACE_DOWN = defineRule<Clauses>({
  id: FACE_DOWN_RULE,
  family: 'effect',
  leading: ['exile'],
  cites: ['CR 701.13 (Exile)', 'CR 406.3 (Exile)', 'CR 603.2 (Handling Triggered Abilities)'],
  examples: [
    "exile the top card of that player's library face down",
    'exile the top card of that player’s library face down',
  ],
  rejects: [
    "exile the top card of that player's library",
    "exile the top two cards of that player's library face down",
    "exile the top card of target player's library face down",
    "exile the top card of that player's graveyard face down",
    "exile the top card of that player's library face down and draw a card",
    "exile the top card of that player's library face up",
  ],
  parse: single(
    FACE_DOWN_RULE,
    sequence(
      literal('exile the top card of '),
      thatPlayer(FACE_DOWN_RULE),
      pattern(new RegExp(` face down${BOUNDARY}(?!,| and\\b| then\\b)`, 'iu')),
    ),
    ([, from, down]) => {
      const span: Span = { start: from.span.start, end: from.span.end + down[0].length };
      return {
        verb: 'exileTop',
        args: {
          count: { kind: 'number', value: 1, span },
          from,
          faceDown: flag(FACE_DOWN_RULE, true, span),
        },
      };
    },
  ),
});

const PLAY_RULE = 'effect.may-play-while-exiled-spend';

const RIDER =
  '(mana of any type can be spent to cast (?:that spell|it)|you may spend mana as though it were mana of any color to cast (?:that spell|it))';
const CARD = '(?:that card|it|the exiled card)';
const REMAINS = 'for as long as (?:it|that card) remains exiled';

/**
 * `effect.may-play-while-exiled-spend`: "you may play that card for as long as it remains exiled, and mana of any type can be spent to cast that spell", "you may look at and play that
 * card for as long as it remains exiled, and you may spend mana as though it were mana of any color to cast that spell", "for as long as it remains exiled, you may play it, and mana of any
 * type can be spent to cast that spell" (Gonti, Canny Acquisitor; Dream-Thief's Bandana; Siphon Insight; Predators' Hour; Cunning Rhetoric; CR 406.3, 601.2, 305.1, 609.4b, 611.2b): the
 * controller may play the card the instruction before it exiled (a land as a land drop, a spell by casting it) for as long as it stays in exile, and pays for the spell with mana of any
 * type or of any color. The engine's `mayPlay` with `whileExiled` and `anyManaType` or `anyManaColor` (`lookAt` when the text says "look at"). The card is the one of the "exile" before it, which
 * the lowering requires. Not read: "cast" (`effect.may-cast-any-type`), those cards, another length, another rider, a trailing instruction.
 */
export const EFFECT_MAY_PLAY_WHILE_EXILED_SPEND = defineRule<Clauses>({
  id: PLAY_RULE,
  family: 'effect',
  leading: ['you', 'play', 'for', 'look'],
  cites: [
    'CR 406.3 (Exile)',
    'CR 601.2 (Casting Spells)',
    'CR 305.1 (Lands)',
    'CR 609.4b (Effects That Modify Cost)',
    'CR 611.2b (Continuous Effects)',
  ],
  examples: [
    'you may play that card for as long as it remains exiled, and mana of any type can be spent to cast that spell',
    'you may play the exiled card for as long as it remains exiled, and you may spend mana as though it were mana of any color to cast that spell',
    'you may look at and play that card for as long as it remains exiled, and you may spend mana as though it were mana of any color to cast that spell',
    'you may play that card for as long as it remains exiled, and you may spend mana as though it were mana of any color to cast it',
    'for as long as it remains exiled, you may play it, and mana of any type can be spent to cast that spell',
    'play that card for as long as it remains exiled, and mana of any type can be spent to cast that spell',
    'for each card exiled this way, you may play that card for as long as it remains exiled, and mana of any type can be spent to cast that spell',
  ],
  rejects: [
    'you may play that card for as long as it remains exiled',
    'you may cast that card for as long as it remains exiled, and mana of any type can be spent to cast that spell',
    'you may play those cards for as long as they remain exiled, and mana of any type can be spent to cast those spells',
    'you may play that card this turn, and mana of any type can be spent to cast that spell',
    'you may play that card for as long as it remains exiled, and mana of any color can be spent to cast that spell',
    'you may play that card for as long as it remains exiled, and mana of any type can be spent to cast that spell and draw a card',
    'you may look at and cast that card for as long as it remains exiled, and mana of any type can be spent to cast that spell',
    'for as long as it remains exiled, you may cast it, and mana of any type can be spent to cast that spell',
    'you may play target card for as long as it remains exiled, and mana of any type can be spent to cast that spell',
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      pattern(
        new RegExp(
          `(?:(?:for each card exiled this way, )?(?:you may )?(look at and )?play ${CARD} ${REMAINS}, and ${RIDER}|${REMAINS}, (?:you may )?play ${CARD}, and ${RIDER})${BOUNDARY}(?!,| and\\b| then\\b)`,
          'iu',
        ),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const { span } = r.value;
    const m = r.value.value;
    const look = m[1] !== undefined;
    const rider = (m[2] ?? m[3] ?? '').toLowerCase();
    const anyType = rider.startsWith('mana of any type');
    const duration: IrDuration = { kind: 'duration', scope: 'whileExiled', span, rule: PLAY_RULE };
    const args: Record<string, IrArg> = {
      ...(anyType
        ? { anyManaType: flag(PLAY_RULE, true, span) }
        : { anyManaColor: flag(PLAY_RULE, true, span) }),
      ...(look ? { lookAt: flag(PLAY_RULE, true, span) } : {}),
    };
    return {
      ok: true,
      value: [{ ...makeClause(PLAY_RULE, 'mayPlay', args, span), duration }],
      pos: r.pos,
    };
  },
});

const GRANT_RULE = 'effect.lead-gain-keywords-and-ability-all';

/**
 * `effect.lead-gain-keywords-and-ability-all`: "Until end of turn, creatures you control gain menace and \"Whenever ~ deals combat damage to a player, ...\"" (Predators' Hour; CR 611.2a,
 * 611.2c, 613.1f): a group of permanents gets keywords and a triggered ability for the turn; which permanents it means is fixed as the effect resolves. The engine's `grantKeyword` of
 * each keyword and `grantAbility`, both of the group. Not read: a target subject, another duration, an activated or a mana ability, a pump with it, no keyword, the ability first.
 */
export const EFFECT_LEAD_GAIN_KEYWORDS_AND_ABILITY_ALL = defineRule<Clauses>({
  id: GRANT_RULE,
  family: 'effect',
  leading: ['until'],
  cites: [
    'CR 611.2a (Continuous Effects)',
    'CR 611.2c (Continuous Effects)',
    'CR 613.1f (Interaction of Continuous Effects)',
  ],
  examples: [
    'Until end of turn, creatures you control gain menace and "Whenever ~ deals combat damage to a player, draw a card."',
    'Until end of turn, creatures you control gain flying and vigilance and "Whenever ~ deals combat damage to a player, draw a card."',
  ],
  rejects: [
    'Until end of turn, creatures you control gain menace',
    'Until end of turn, creatures you control gain "Whenever ~ deals combat damage to a player, draw a card."',
    'Until end of turn, target creature gains menace and "Whenever ~ deals combat damage to a player, draw a card."',
    'Until your next turn, creatures you control gain menace and "Whenever ~ deals combat damage to a player, draw a card."',
    'Until end of turn, creatures you control gain menace and "{T}: Draw a card."',
    'Until end of turn, creatures you control gain "Whenever ~ deals combat damage to a player, draw a card." and menace',
  ],
  parse: (ctx, pos) => {
    const duration = family<IrDuration>('duration')(ctx, pos);
    if (!duration.ok) return duration;
    if (duration.value.scope !== 'untilEndOfTurn') return fail(ctx, pos);
    const comma = literal(', ')(ctx, duration.pos);
    if (!comma.ok) return comma;
    const subject = family<IrNoun>('noun', { only: ['noun.plain-permanents'] })(ctx, comma.pos);
    if (!subject.ok) return subject;
    const gain = literal(' gain ')(ctx, subject.pos);
    if (!gain.ok) return gain;
    const keywords = spanned(KEYWORD_WORDS)(ctx, gain.pos);
    if (!keywords.ok) return keywords;
    const and = literal(' and ')(ctx, keywords.pos);
    if (!and.ok) return and;
    const quoted = readQuotedAbility(ctx, and.pos, { mana: false });
    if (!quoted.ok) return quoted;
    if (quoted.value.ability.kind !== 'triggered') return fail(ctx, and.pos);
    const out: IrClause[] = keywords.value.value.map((name) => {
      const keyword: IrKeywordArg = {
        kind: 'keywordName',
        name,
        span: keywords.value.span,
        rule: GRANT_RULE,
      };
      return {
        ...makeClause(
          GRANT_RULE,
          'grantKeyword',
          { objects: subject.value, keyword },
          keywords.value.span,
        ),
        duration: duration.value,
        connector: 'and' as const,
      };
    });
    out.push({
      ...makeClause(
        GRANT_RULE,
        'grantAbility',
        { objects: subject.value, ability: quoted.value },
        quoted.value.span,
      ),
      duration: duration.value,
    });
    return { ok: true, value: out, pos: quoted.pos };
  },
});

/** Tried first: all of these start like a plain look, exile or may-play rule. */
export const IMPULSE_EXILE_EFFECT_RULES = [
  EFFECT_LOOK_EXILE_FACE_DOWN_ONE,
  EFFECT_EXILE_TOP_THAT_PLAYER_FACE_DOWN,
  EFFECT_MAY_PLAY_WHILE_EXILED_SPEND,
  EFFECT_LEAD_GAIN_KEYWORDS_AND_ABILITY_ALL,
].map(quietly);
