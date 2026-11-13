/**
 * Sentences of a body: effect clauses joined by "and" or "then" (or none), ending in a period.
 * Whether a join splits two clauses is decided by the effect family: it does only where an effect
 * rule reads the words after it, so "Destroy target artifact and target creature" is one clause
 * with two operands and "Destroy target creature and draw a card" is two.
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
  sequence,
} from './combinators';
import type { IrAmount, IrClause, IrCondition, IrNoun, IrSentence } from './ir/types';
import { LEAD_GAME_STATE_CONDITIONS } from './rules/condition/game-state';
import { CLAUSE_JOIN, connectorOf, listWithJoins } from './rules/effect/operands';
import { spellPhrase, withoutZone } from './rules/noun/phrases';
import { family, spanned } from './rules/registry';
import { makeNoun } from './rules/trigger/subjects';

/**
 * The end of a sentence: its period, or, when the sentence ends with an ability in quotes, the period inside the closing quote (stage P35, D-176):
 * `create a 1/1 black and green Pest creature token with "When this token dies, you gain 1 life."` has no other (a quote inside the quote
 * closes first: `.'"`). Nothing is read; the quote must be the last character, as the segmenter keeps a quote's own period inside the sentence and so cannot end a sentence after one.
 */
const QUOTE_ENDS_SENTENCE: Parser<string> = (ctx, pos) =>
  pos === ctx.text.length && /\.['’]?["”]$/u.test(ctx.text.slice(Math.max(0, pos - 3), pos))
    ? { ok: true, value: '', pos }
    : fail(ctx, pos);

const SENTENCE_END: Parser<string> = choice(literal('.'), QUOTE_ENDS_SENTENCE);

const CLAUSES: Parser<{ items: (readonly IrClause[])[]; joins: string[] }> = listWithJoins(
  family<readonly IrClause[]>('effect'),
  CLAUSE_JOIN,
);

/**
 * The conditions of stage P30 (D-135) that may begin a sentence: "If it's a Zombie card, draw a card." (CR 608.2c: what an
 * object an earlier instruction moved is) and "If the gift was promised, return target creature card ..." (CR 702.174k).
 */
const RECURSION_LEAD_CONDITIONS = [
  'condition.it-matches',
  // D-298: "If its mana value was 3 or less, scry 1."
  'condition.its-mana-value',
  'condition.gift-promised',
  // Stage P37 (D-180): "If you put a Cave onto the battlefield this way, you gain 4 life."
  'condition.put-this-way',
  // Stage P49 (D-206): "Then if this spell was cast from a graveyard, put two +1/+1 counters on that token."
  'condition.cast-from-graveyard',
] as const;

/**
 * The tests of a count of permanents, the greatest of a stat and a commander (stage P32, D-147, CR 608.2c): "If you control a creature with
 * power 4 or greater, add two mana of any one color instead.", "... draw two cards if you control the creature with the greatest power or
 * tied for the greatest power." The lowering reads them as the engine's `controlsAtLeast`, `controlsGreatest` and `controlCommander`.
 */
const CONTROL_CONDITIONS = [
  'condition.control-greatest',
  'condition.control-a',
  'condition.dont-control-a',
  'condition.control-at-least',
  'condition.control-none',
  'condition.control-commander',
  'condition.control-your-commander',
] as const;

/** "If the creature you control has trample, excess damage is dealt to that creature's controller instead." (stage P32). */
const OBJECT_LEAD_CONDITIONS = ['condition.object-has-keyword'] as const;

/** "none of those creatures attacked you" (stage P33, D-150, CR 508.1b): the attackers that triggered an ability about an attack. */
const ATTACKERS_CONDITIONS = ['condition.those-attacked-you'] as const;

/**
 * "an opponent was dealt 7 or more damage this turn" (stage P34, D-152, CR 120.3): a test of the turn, said before or after an instruction
 * ("You may play the exiled card without paying its mana cost if an opponent was dealt 7 or more damage this turn.").
 */
const TURN_CONDITIONS = [
  'condition.player-dealt-damage',
  // Stage P69 (D-252, D-253): the Bruna deck, "if you gained 3 or more life this turn", "... if your life total is greater than your starting life total".
  'condition.life-gained-this-turn',
  'condition.life-above-starting',
] as const;

/**
 * "If you have at least 15 life more than your starting life total, exile ~ and each artifact and creature your opponents control." (D-267, CR 608.2c:
 * the test of the sentence's own instruction, made as it resolves): the life total of the player the ability is controlled by. Read before an instruction only: the
 * trailing form is not read, and a triggered ability's own "if" before its effect is the trigger's (the intervening "if", CR 603.4).
 */
const LIFE_LEAD_CONDITIONS = ['condition.life-total'] as const;

/**
 * "If the result is 1, ..." (D-271, CR 706.2, 706.3a): the result of the roll before it. A sentence may start with it, or end with it after one
 * instruction; the lowering reads it only after a roll of the same text.
 */
const DIE_CONDITIONS = ['condition.die-result'] as const;

/**
 * "If five or more mana was spent to cast that spell, ~ deals 3 damage to each opponent instead." (issue 25, CR 601.2h, 608.2c): the mana spent on the spell a
 * cast trigger is about; the lowering reads it in the body of such a trigger only.
 */
const MANA_SPENT_CONDITIONS = ['condition.mana-spent-or-more'] as const;

const LEAD_CONDITIONS = [
  ...MANA_SPENT_CONDITIONS,
  ...DIE_CONDITIONS,
  // Stage P52 (D-210): "If a creature card was discarded this way, ..." after a discard.
  'condition.discarded-this-way',
  ...LEAD_GAME_STATE_CONDITIONS,
  ...TURN_CONDITIONS,
  ...LIFE_LEAD_CONDITIONS,
  ...RECURSION_LEAD_CONDITIONS,
  ...CONTROL_CONDITIONS,
  ...OBJECT_LEAD_CONDITIONS,
  ...ATTACKERS_CONDITIONS,
];

/**
 * "If ~ was kicked, " (and, in a triggered ability's body, "If you do, " after an offer to pay, stage P21):
 * the condition a sentence may start with, and the comma after it. `quiet`: a sentence that starts with
 * some other "If" (or "If ~ was kicked" and a stop later) reports its stop where it always did, not after
 * the "If".
 */
function leadCondition(ifYouDo: boolean): Parser<IrCondition> {
  return quiet(
    map(
      sequence(
        // Stage P49 (D-206): "Then if ..." says only that the sentence follows the one before it, as every sentence does (CR 608.2c).
        pattern(/(?:then )?if /iu),
        family<IrCondition>('condition', {
          only: ifYouDo
            ? [
                'condition.kicked',
                'condition.if-you-do',
                // Stage P52 (D-210): "If the player doesn't," after "target opponent may have you ...".
                'condition.player-declines',
                ...LEAD_CONDITIONS,
              ]
            : ['condition.kicked', ...LEAD_CONDITIONS],
        }),
        literal(', '),
      ),
      ([, condition]) => condition,
    ),
  );
}

const IF_KICKED = leadCondition(false);

/**
 * ", where X is the number of Zombies you control" (stage P28, CR 107.3c): what the text defines X as, which ends a
 * sentence. The clauses before it say X; the lowering writes the definition into each slot that does.
 */
const WHERE_X: Parser<IrAmount> = quiet(
  map(
    sequence(literal(', '), family<IrAmount>('amount', { only: ['amount.where-x'] })),
    ([, amount]) => amount,
  ),
);
const IF_KICKED_OR_YOU_DO = leadCondition(true);

/**
 * The tests a sentence may end with, " if you control the creature with the greatest power or tied for the greatest power" (stage P32,
 * D-147, CR 608.2c: the instruction is followed only when the condition holds as it comes up): counts of permanents, the greatest of a
 * stat, a commander, and the tests of the game. A trailing "if" is read only after one instruction, so the condition cannot be taken
 * for another instruction's; the lowering is the lead condition's (`conditional`). `quiet`: a sentence that ends in some other " if"
 * stops where it always did.
 */
const TRAILING_CONDITIONS = [
  ...DIE_CONDITIONS,
  ...LEAD_GAME_STATE_CONDITIONS,
  ...TURN_CONDITIONS,
  ...CONTROL_CONDITIONS,
  ...ATTACKERS_CONDITIONS,
] as const;

const TRAILING_IF: Parser<IrCondition> = quiet(
  map(
    sequence(literal(' if '), family<IrCondition>('condition', { only: TRAILING_CONDITIONS })),
    ([, condition]) => condition,
  ),
);

interface SentenceOptions {
  /**
   * "You may ..." is read and every clause of the sentence is optional (CR 603.5). `'discard'` (stage P56, D-214, P63 D-216): only "You may discard ..." and
   * "You may shuffle." are read, the offers of a spell ("You may discard a card. If you do, draw a card.", Ponder's "You may shuffle."); a "may" of a spell the
   * engine does not run stays unread.
   */
  readonly may: boolean | 'discard';
  /**
   * "If ~ was kicked, ..." may start the sentence and " instead" end it (CR 608.2c, 614.1a). Only
   * the bodies whose lowering handles a conditional sentence ask for it, so a condition is never
   * dropped by a lowering that does not know it.
   */
  readonly conditional: boolean;
  /**
   * "... unless that player pays {1}" may end the sentence (stage P18, CR 118.12a): the instruction runs
   * unless a player pays. It follows one clause, and only a triggered ability's body asks for it, where
   * the lowering knows who "that player" is.
   */
  readonly unless?: boolean | 'energy';
  /**
   * "If you do, ..." may start the sentence (stage P21, CR 608.2c): what a payment offered by the sentence
   * before it ("You may pay {4}.") buys. Only a triggered ability's body asks for it, where the offer can be
   * made and the lowering joins the two sentences.
   */
  readonly ifYouDo?: boolean;
  /**
   * "When you do, ..." may start the sentence (stage P30, CR 603.12): the reflexive triggered ability the "you may" sentence
   * before it creates when the player did what it offered. Only a triggered ability's body asks for it.
   */
  readonly reflexive?: boolean;
  /**
   * "At the beginning of your next end step, ..." may start the sentence (stage P34, D-152, CR 603.7): what a delayed triggered ability does.
   * Only the bodies whose lowering wraps the sentence in the engine's `delayedTrigger` ask for it.
   */
  readonly delayed?: boolean;
}

/** "When you next cast an instant or sorcery spell this turn, " (D-336): the spell is the subject of what the sentence does. */
const NEXT_CAST_LEAD: Parser<NonNullable<IrSentence['delayed']>> = map(
  spanned(
    sequence(
      literal('when you next cast '),
      pattern(/an? /iu),
      map(spellPhrase(), withoutZone),
      literal(' this turn, '),
    ),
  ),
  ({ value, span }) => ({
    step: 'nextCast' as const,
    whose: 'you' as const,
    spell: makeNoun('sentence.delayed-cast', span, 'a', value[2]),
  }),
);

/** "At the beginning of your next end step, " and "At the beginning of the next end step, " (stage P34, D-152): the delayed trigger's moment. */
const DELAYED_LEAD: Parser<NonNullable<IrSentence['delayed']>> = quiet(
  choice<NonNullable<IrSentence['delayed']>>(
    map(literal('at the beginning of your next end step, '), () => ({
      step: 'endStep' as const,
      whose: 'you' as const,
    })),
    map(literal('at the beginning of the next end step, '), () => ({
      step: 'endStep' as const,
      whose: 'each' as const,
    })),
    // Stage P41 (D-188): the combat phase the sentence before it added (the lowering folds it into that sentence's effect).
    map(literal('at the beginning of that combat, '), () => ({
      step: 'thatCombat' as const,
      whose: 'you' as const,
    })),
    // D-336 (CR 603.7, 603.7a): "When you next cast an instant or sorcery spell this turn, ": the next spell of that kind its controller casts.
    NEXT_CAST_LEAD,
  ),
);

/**
 * "Each player may ", "Target opponent may have you " (stage P52, D-210, CR 608.2d, 101.4): the players a triggered ability asks whether to do the instructions of the
 * sentence, and, with "have you", that the controller does them. A player noun and "may"; "you may" is the sentence's own prefix.
 */
const PLAYER_MAY: Parser<NonNullable<IrSentence['mayBy']>> = quiet((ctx, pos) => {
  // Looked at first, so that a sentence about a player that does not say "may" stops where it always did.
  const ahead = pattern(
    /(?=(?:each (?:other )?(?:player|opponent)|target (?:player|opponent)) may )/iu,
  )(ctx, pos);
  if (!ahead.ok) return ahead;
  return map(
    sequence(
      family<IrNoun>('noun', { only: ['noun.player'] }),
      literal(' may '),
      optional(literal('have you '), null),
    ),
    ([who, , haveYou]) => ({ who, haveYou: haveYou !== null }),
  )(ctx, pos);
});

/** " unless you pay {E}{E}" (stage P51, D-209, CR 107.14): the payment of energy only, which a spell's sentence reads (the other costs stay a trigger's). */
const UNLESS_ENERGY: Parser<IrCondition> = (ctx, pos) => {
  // Looked at quietly first: a sentence that does not end so stops where it always did.
  const ahead = quiet(pattern(/(?= unless you pay \{E\})/u))(ctx, pos);
  if (!ahead.ok) return ahead;
  return quiet(
    map(
      sequence(literal(' '), family<IrCondition>('condition', { only: ['condition.unless-pays'] })),
      ([, condition]) => condition,
    ),
  )(ctx, pos);
};

/**
 * " unless that player pays {1}": the cost that stops the instruction before it; and, since stage P23, " unless
 * it escaped" (CR 702.138b), the permanent's own history that does. The lowering of a triggered ability decides
 * which of them it can run.
 */
const UNLESS_PAYS: Parser<IrCondition> = map(
  sequence(
    literal(' '),
    family<IrCondition>('condition', {
      only: ['condition.unless-pays', 'condition.unless-escaped', 'condition.unless-return'],
    }),
  ),
  ([, condition]) => condition,
);

/**
 * A sentence parser. With `may`, "You may ..." is read and every clause of the sentence is
 * optional (CR 603.5: the controller chooses as the ability resolves). Only triggered abilities
 * ask for it: the engine has no "may" on spell effects or activated abilities yet, so there the
 * words stay unread. With `conditional`, a leading "If ~ was kicked, " is the sentence's condition
 * and a trailing " instead" says that it replaces the sentence before it.
 */
function sentenceParser(options: SentenceOptions): Parser<IrSentence> {
  const plain = plainSentence(options);
  // "Then discard two cards unless ..." (stage P31, D-140): "then" at the start of a sentence says only that it comes after the one
  // before, which every sentence does (CR 608.2c). A sentence that does not read after it stops where it always did, at "Then".
  return (ctx, pos) => {
    const then = literal('then ')(ctx, pos);
    if (then.ok) {
      const read = quiet(plain)(ctx, then.pos);
      if (read.ok)
        return { ...read, value: { ...read.value, span: { start: pos, end: read.pos } } };
    }
    return plain(ctx, pos);
  };
}

function plainSentence(options: SentenceOptions): Parser<IrSentence> {
  return (ctx, pos) => {
    const start = pos;
    let at = start;
    let condition: IrCondition | undefined;
    let reflexive = false;
    if (options.reflexive === true) {
      const lead = literal('when you do, ')(ctx, start);
      if (lead.ok) {
        reflexive = true;
        at = lead.pos;
      }
    }
    if (options.conditional && !reflexive) {
      const lead = (options.ifYouDo === true ? IF_KICKED_OR_YOU_DO : IF_KICKED)(ctx, start);
      if (lead.ok) {
        condition = lead.value;
        at = lead.pos;
      }
    }
    // "If there are seven or more cards in your graveyard, instead search your library for ..." (stage P36, D-178, CR 608.2c, 614.1a): "instead" after the
    // leading test says the same as it does at the end of the sentence, that it replaces the sentence before it.
    let otherwise = false;
    if (options.conditional && condition === undefined && !reflexive) {
      const word = literal('otherwise, ')(ctx, at);
      if (word.ok) {
        otherwise = true;
        at = word.pos;
      }
    }
    let leadingInstead = false;
    if (condition !== undefined) {
      const word = literal('instead ')(ctx, at);
      if (word.ok) {
        leadingInstead = true;
        at = word.pos;
      }
    }
    let delayed: IrSentence['delayed'];
    if (options.delayed === true && !reflexive) {
      const lead = DELAYED_LEAD(ctx, at);
      if (lead.ok) {
        delayed = lead.value;
        at = lead.pos;
      }
    }
    const may: Parser<'you' | NonNullable<IrSentence['mayBy']> | null> =
      options.may === 'discard' && !reflexive
        ? optional(
            map(
              (c, p) => {
                const ahead = pattern(/(?=you may (?:discard |shuffle\.))/iu)(c, p);
                return ahead.ok ? literal('you may ')(c, p) : ahead;
              },
              () => 'you' as const,
            ),
            null,
          )
        : options.may && !reflexive
          ? optional(
              choice<'you' | NonNullable<IrSentence['mayBy']>>(
                map(literal('you may '), () => 'you' as const),
                PLAYER_MAY,
              ),
              null,
            )
          : () => ({ ok: true as const, value: null, pos: at });
    const prefix = may(ctx, at);
    if (!prefix.ok) return prefix;
    // " instead" belongs to a conditional sentence; without a condition it is left unread, and the
    // period that should follow the clauses is what fails.
    const insteadWord: Parser<boolean> =
      condition === undefined || leadingInstead
        ? (_ctx, p) => ({ ok: true, value: leadingInstead, pos: p })
        : map(optional(literal(' instead'), null), (word) => word !== null);
    const unless: Parser<IrCondition | null> =
      options.unless === true
        ? optional(UNLESS_PAYS, null)
        : options.unless === 'energy'
          ? optional(UNLESS_ENERGY, null)
          : (_ctx, p) => ({ ok: true, value: null, pos: p });
    const trailing: Parser<IrCondition | null> =
      options.conditional && condition === undefined && !reflexive
        ? optional(TRAILING_IF, null)
        : (_ctx, p) => ({ ok: true, value: null, pos: p });
    const r = sequence(
      CLAUSES,
      trailing,
      optional(WHERE_X, null),
      unless,
      insteadWord,
      SENTENCE_END,
    )(ctx, prefix.pos);
    if (!r.ok) return r;
    const [list, trailingIf, where, unlessPays, instead] = r.value;
    const { items, joins } = list;
    // The test after the instruction is the sentence's own only when it is one instruction, and the sentence has no test before it.
    if (trailingIf !== null && (items.length !== 1 || (items[0]?.length ?? 0) !== 1)) {
      return fail(ctx, prefix.pos);
    }
    if (trailingIf !== null) condition = trailingIf;
    // The cost stops one instruction; after several clauses "unless" would say which of them.
    if (unlessPays !== null && (items.length !== 1 || (items[0]?.length ?? 0) !== 1)) {
      return fail(ctx, prefix.pos);
    }
    const optionalClauses = prefix.value === 'you';
    // "Each player may discard a card.", "Target opponent may have you draw three cards." (stage P52, D-210): the question is the sentence's, not each clause's.
    const mayBy = prefix.value === null || prefix.value === 'you' ? undefined : prefix.value;
    const clauses = items.flatMap((group, i) => {
      const join = joins[i];
      const marked = (optionalClauses ? group.map((c) => ({ ...c, optional: true })) : group).map(
        (c) => (unlessPays === null ? c : { ...c, condition: unlessPays }),
      );
      if (join === undefined) return marked;
      // The join after a group connects its last clause to the next group.
      return marked.map((c, j) =>
        j === marked.length - 1 ? { ...c, connector: connectorOf(join) } : c,
      );
    });
    return {
      ok: true,
      value: {
        kind: 'sentence',
        clauses,
        ...(condition === undefined ? {} : { condition }),
        ...(instead ? { instead: true } : {}),
        ...(otherwise ? { otherwise: true as const } : {}),
        ...(where === null ? {} : { where }),
        ...(reflexive ? { reflexive: true as const } : {}),
        ...(delayed === undefined ? {} : { delayed }),
        ...(mayBy === undefined ? {} : { mayBy }),
        span: { start: pos, end: r.pos },
        rule: 'body.sentence',
      },
      pos: r.pos,
    };
  };
}

/** One sentence: clauses joined by "and" or "then", ending in a period. */
export const SENTENCE: Parser<IrSentence> = sentenceParser({ may: false, conditional: false });

/** A sentence of a spell: "If ~ was kicked, ..." and "... instead" are read. */
export const SPELL_SENTENCE: Parser<IrSentence> = sentenceParser({
  // Stage P56 (D-214): "You may discard a card. If you do, draw a card." (Improvised Act).
  may: 'discard',
  ifYouDo: true,
  conditional: true,
  // Stage P51 (D-209): "Then discard a card at random unless you pay {E}{E}." of a spell: the energy cost only, so that "Counter target spell unless
  // that player pays {3}" stays as it was.
  unless: 'energy',
  delayed: true,
});

/**
 * A sentence of an activated ability's body (stage P32, D-147): the leading and trailing tests of a spell's sentence ("If it was a
 * creature card, ...", "... if creatures you control have total power 10 or greater"). The lowering of an activated ability reads
 * them as it reads any body (`lowerSentences`), and refuses them in a mana ability.
 */
export const ACTIVATED_SENTENCE: Parser<IrSentence> = sentenceParser({
  may: false,
  conditional: true,
  delayed: true,
});

/**
 * A sentence of a loyalty ability's body (stage P47, D-202): what the sentence of a triggered ability reads, the choices and follow-ups the
 * planeswalkers' abilities use ("You may sacrifice another permanent. If you do, you gain 1 life and draw a card.", CR 606.2). The other activated abilities
 * keep `ACTIVATED_SENTENCE`.
 */
export const LOYALTY_SENTENCE: Parser<IrSentence> = sentenceParser({
  may: true,
  conditional: true,
  unless: true,
  ifYouDo: true,
  reflexive: true,
  delayed: true,
});

/** A sentence of a triggered ability's body: "You may ..." and "If ~ was kicked, ..." are read. */
export const TRIGGER_SENTENCE: Parser<IrSentence> = sentenceParser({
  may: true,
  conditional: true,
  unless: true,
  ifYouDo: true,
  reflexive: true,
  delayed: true,
});
