/**
 * The segmenter (D-063, proposal 3.4): one normalized ability line in, its skeleton out. The
 * skeleton says where the slots are (trigger, costs, body sentences, modes) and knows no
 * vocabulary: it looks only at punctuation and a handful of structural words (`When`,
 * `Whenever`, `At`, `Choose`, a colon after a cost, `~ enters`). Each slot's span is then handed
 * to the phrase rules of the right family. A modal text ("Choose one —" and its bullet lines, which
 * `splitAbilities` keeps in one line) is `modal`, or the body of a triggered or activated ability
 * (`modalHeader` and `modes`, no sentences; stage P19). A line it cannot place is `other`: the caller
 * tries the keyword family and, by the kind of face, the static or spell reading. A Saga's chapter
 * line ("I, II — ...", numerals and an em dash) is a triggered ability whose trigger is the numerals.
 *
 * Clause splitting inside a sentence ("A, then B") is left to the effect family: a join is a
 * split only where an effect rule reads the words after it, which cannot mis-split silently
 * (proposal section 8, first risk).
 */
import type { Span } from './ir/types';
import { CHAPTER_PREFIX } from './roman';

export type FaceKind = 'spell' | 'permanent';

export type Head = 'triggered' | 'activated' | 'modal' | 'replacement' | 'other';

export interface AbilitySkeleton {
  readonly text: string;
  readonly head: Head;
  /** What the face is: an instant or sorcery, or a permanent. Decides what `other` means. */
  readonly face: FaceKind;
  /** triggered: the When/Whenever/At word. */
  readonly triggerWord?: Span;
  /** triggered: the trigger condition, up to the first comma outside quotes. */
  readonly trigger?: Span;
  /** triggered: "if ..." right after the trigger (CR 603.4, an intervening if). */
  readonly interveningIf?: Span;
  /**
   * triggered, a Saga's chapter line (CR 714.2): "I — ...", "I, II — ...". The trigger is the
   * numeral list and there is no trigger word; the sentences are what follows the em dash.
   */
  readonly chapter?: true;
  /** activated: each cost, split on commas outside quotes and braces. */
  readonly costs: readonly Span[];
  /** activated: trailing "Activate only ..." sentences. */
  readonly restrictions: readonly Span[];
  /** triggered, activated, other: the sentences of the body, each with its period. */
  readonly sentences: readonly Span[];
  /** modal: the "Choose one —" header and one span per bullet. */
  readonly modalHeader?: Span;
  readonly modes: readonly Span[];
  /** replacement: the whole statement. */
  readonly whole: Span;
  /**
   * "• Khans — At the beginning of your upkeep, ..." (stage P34, D-152, CR 607.2d): the name of the option of an "As ~ enters, choose
   * Khans or Dragons" that this ability belongs to. The skeleton is that of the text after the name; its spans are in the whole line.
   */
  readonly option?: string;
}

const TRIGGER_WORD = /^(?:when|whenever|at)\s/i;
/** "When you next cast an instant or sorcery spell this turn, " (D-336): the lead of a sentence that creates a delayed triggered ability. */
const DELAYED_CAST_LEAD = /^when you next cast an? [^,.]+ spell this turn, /i;
/** A line that starts a modal spell or ability: "Choose one —", "Choose one. If you control ...". */
const MODAL_HEADER = /^choose\b/i;
const REPLACEMENT_ENTERS = /^(?:as )?~ enters\b/i;
/** "If ~ was kicked, it enters with ...": a conditional replacement of the permanent itself. */
const REPLACEMENT_IF_ENTERS = /^if [^,]+, (?:~|it) enters\b/i;
const COST_WORDS = /^(?:sacrifice|discard|pay|remove|exile|tap)\b/i;
/**
 * The loyalty symbol that starts a loyalty ability (CR 606.2, 606.4, 606.5; stage P47, D-202): "+1", "−2" (U+2212, which Oracle text writes; a hyphen-minus and an
 * en dash too), "0", "−X", each with or without the square brackets of the rules text. The colon follows at once.
 */
const LOYALTY_PREFIX = /^\[?(?:[+]\d+|[\u2212\u2013-](?:\d+|X)|0)\]?\s*:/;

function isOpenQuote(c: string): boolean {
  return c === '"' || c === '“';
}

/**
 * Whether the comma at `at` is inside the name of a card that "named" introduces (D-278, CR 201.2): the text since the last " named " has no other comma, and what follows
 * the comma is "the", "of" or a capital letter, as the second part of a legendary name is ("Bruna, the Fading Light", "Mishra, Claimed by Gix"), never the verb of the
 * next clause.
 */
function insideNamedCard(text: string, at: number, start: number): boolean {
  const named = text.lastIndexOf(' named ', at);
  if (named < start) return false;
  if (text.slice(named + 7, at).includes(', ')) return false;
  return /^, (?:the |of |[A-Z])/u.test(text.slice(at, at + 6));
}

/** Offsets of `, ` (comma and space) that are outside quotes and braces. */
function topLevelCommas(text: string, start: number, end: number): number[] {
  const out: number[] = [];
  let quote = false;
  let brace = 0;
  for (let i = start; i < end; i++) {
    const c = text.charAt(i);
    if (isOpenQuote(c) || c === '”') quote = !quote;
    else if (c === '{') brace++;
    else if (c === '}') brace--;
    else if (
      c === ',' &&
      !quote &&
      brace === 0 &&
      text.charAt(i + 1) === ' ' &&
      // Stage P68 (D-230): "a nontoken, non-Angel creature": a comma between two modifiers of a noun, not the end of a trigger condition.
      !(
        text.slice(i - 8, i).toLowerCase() === 'nontoken' && /^, non-/i.test(text.slice(i, i + 6))
      ) &&
      // D-278 (CR 201.2): the name of a card may hold a comma ("a creature named Bruna, the Fading Light"): a comma inside the name after "named" is not the end of the clause.
      !insideNamedCard(text, i, start)
    ) {
      out.push(i);
    }
  }
  return out;
}

function trimmed(text: string, start: number, end: number): Span {
  let s = start;
  let e = end;
  while (s < e && /\s/.test(text.charAt(s))) s++;
  while (e > s && /\s/.test(text.charAt(e - 1))) e--;
  return { start: s, end: e };
}

/**
 * The sentence that only says what the player may do with the copy that the sentence before it makes (CR 707.10c,
 * stage P27): it is read with that sentence (`effect.copy-spell`), never alone.
 */
const NEW_TARGETS_SENTENCE = /^you may choose new targets for the copy\.$/i;
/**
 * "You may choose new targets for the copies." (D-337, CR 707.10c): the same sentence for a clause that makes several copies, "copy it for each time you've cast your
 * commander from the command zone this game"; joined only to a sentence that says it (`effect.copy-spell-for-each`).
 */
const NEW_TARGETS_COPIES_SENTENCE = /^you may choose new targets for the copies\.$/i;
const COPY_FOR_EACH = /(?:^|, )copy (?:it|that spell) for each time [^.]*\.$/i;

/** Whether `text` at `span` is a sentence about the new targets that goes with the sentence `before` it (stage P27, D-337). */
function newTargetsOf(text: string, before: Span | undefined, span: Span): boolean {
  if (before === undefined) return false;
  const said = text.slice(span.start, span.end);
  if (NEW_TARGETS_SENTENCE.test(said)) return true;
  return (
    NEW_TARGETS_COPIES_SENTENCE.test(said) &&
    COPY_FOR_EACH.test(text.slice(before.start, before.end))
  );
}

/**
 * "Look at the top six cards of your library. You may reveal an artifact card from among them and put it into your hand. Put the rest on
 * the bottom of your library in a random order." (stage P31, D-140): three sentences that are one instruction (what is looked at, what
 * may be taken from among them, where the rest go), kept together so `effect.look-take` reads them as one. Only all three in a row.
 */
const LOOK_AT_TOP = /^look at the top [^.]* cards of your library\.$/i;
const TAKE_FROM_AMONG =
  /^you may reveal [^.]* from among them and put (?:it|them) (?:into your hand|onto the battlefield(?: tapped)?)\.$/i;
const PUT_THE_REST = /^put the rest [^.]*\.$/i;
/** "Put any number of nonland permanent cards with total mana value 4 or less from among them onto the battlefield." (stage P68, D-230): the middle sentence of the same instruction. */
const PUT_ANY_TOTAL =
  /^put any number of [^.]* with total mana value \d+ or less from among them onto the battlefield\.$/i;

/**
 * "Look at the top three cards of your library. Put one of them into your hand, put one of them on the bottom of your library, and exile one of them."
 * (stage P63, D-216): two sentences that are one instruction (what is looked at, and where each of the cards goes), kept together for `effect.look-split`.
 */
const SPLIT_THE_TOP =
  /^put \w+ of them into your hand, put \w+ of them on the bottom of your library, and exile \w+ of them\.$/i;

/**
 * "Look at the top five cards of your library. Put two of them into your hand and the rest on the bottom of your library in any order." (Stock Up, D-324, CR 401.4): the second
 * sentence says what is done with the cards the first one looks at, so the two are read as one instruction (`effect.look-take-bottom`).
 */
const PUT_HAND_REST_BOTTOM =
  /^put \w+ of them into your hand and the rest on the bottom of your library in any order\.$/i;

/**
 * "Reveal cards from the top of your library until you reveal a land card. Put that card onto the battlefield tapped and the rest on the
 * bottom of your library in a random order." (stage P32, D-147): two sentences that are one instruction (what is revealed until, and where
 * the card found and the rest go), kept together so `effect.reveal-until` reads them as one. Only both in a row.
 */
const REVEAL_UNTIL =
  /^(?:you may )?reveal cards from the top of your library until you reveal [^.]*\.$/i;
const PUT_THAT_CARD = /^put that card [^.]*\.$/i;

/**
 * "Exile cards from the top of your library until you exile a nonland card. You may cast it without paying its mana cost if that spell's
 * mana value is 8 or less. If you don't, put that card into your hand." (stage P34, D-152): three sentences that are one instruction (what
 * is exiled until, what may be cast and what happens to the card when it is not), kept together so `effect.exile-until-cast` reads them
 * as one. Only all three in a row.
 */
const EXILE_UNTIL_NONLAND =
  /^exile cards from the top of your library until you exile a nonland card\.$/i;
const MAY_CAST_FREE_IF =
  /^you may cast it without paying its mana cost if that spell['’]s mana value is \d+ or less\.$/i;
const ELSE_INTO_HAND = /^if you don['’]t, put that card into your hand\.$/i;

/**
 * "The owner of target permanent shuffles it into their library, then reveals the top card of their library. If it's a permanent card, they
 * put it onto the battlefield." (stage P34, D-152): two sentences that are one instruction, kept together for `effect.shuffle-reveal-top`.
 */
const SHUFFLE_THEN_REVEAL =
  /^the owner of [^.]* shuffles it into their library, then reveals the top card of their library\.$/i;
const IF_ITS_CARD_PUT_ONTO = /^if it['’]s an? [^.,]* card, they put it onto the battlefield\.$/i;

/**
 * "Look at the top card of your library. If it's a creature card of the chosen type, you may reveal it and put it into your hand."
 * (stage P34, D-152): two sentences that are one instruction, kept together for `effect.look-top-take`.
 */
const LOOK_AT_TOP_CARD = /^look at the top card of your library\.$/i;
const IF_ITS_CARD_MAY_TAKE =
  /^if it['’]s an? [^.,]* card(?: of the chosen type)?, you may reveal it and put it into your hand\.$/i;

/**
 * "Each player exiles a card from their graveyard. When one or more nonland cards are exiled this way, put that many +1/+1 counters on target attacking creature."
 * (stage P70, D-231, CR 603.12): the reflexive ability counts what the first sentence exiled, so the two are read as one instruction.
 */
const EACH_PLAYER_EXILES = /^each player exiles a card from their graveyard\.$/i;
const WHEN_NONLAND_EXILED =
  /^when one or more nonland cards are exiled this way, put that many [^.]*\.$/i;

/**
 * "For each player, you choose from among the permanents that player controls an artifact, a creature, an enchantment, and a planeswalker. Then each player sacrifices all other
 * nonland permanents they control." (stage P70, D-231): the sacrifice is of what was not chosen, so the two sentences are read as one instruction.
 */
const FOR_EACH_PLAYER_CHOOSE =
  /^for each player, you choose from among the permanents that player controls [^.]*\.$/i;
const THEN_SACRIFICE_OTHERS =
  /^then each player sacrifices all other nonland permanents they control\.$/i;

/**
 * "An opponent chooses one of the exiled cards. You put that card on the bottom of your library and return the other to the battlefield tapped." (stage P72, D-232): the second
 * sentence says what happens to the card the first one makes the opponent choose, so the two are read as one instruction.
 */
const OPPONENT_CHOOSES_EXILED = /^an opponent chooses one of the exiled cards\.$/i;
const PUT_THAT_CARD_BOTTOM_RETURN_OTHER =
  /^you put that card on the bottom of your library and return the other to the battlefield tapped\.$/i;

/**
 * "Choose a creature card in an opponent's graveyard, then that player chooses a creature card in your graveyard. You may return those cards to the battlefield under their
 * owners' control." (stage P69, D-272): "those cards" are the two chosen, so the two sentences are read as one instruction (the first may follow the comma of a trigger).
 */
const CHOOSE_GRAVEYARD_PAIR =
  /(?:^|, )choose an? [^.,]* card in an opponent['’]s graveyard, then that player chooses an? [^.,]* card in your graveyard\.$/i;
const MAY_RETURN_THOSE_CARDS =
  /^you may return those cards to the battlefield under their owners['’] control\.$/i;

/**
 * "Exile a card from your graveyard at random. You may play the exiled card this turn." (stage P75, D-235): "the exiled card" is the one the first sentence exiled, so the two
 * are read as one instruction.
 */
const EXILE_AT_RANDOM = /(?:^|, then )exile a card from your graveyard at random\.$/i;
const PLAY_THE_EXILED_CARD = /^you may play the exiled card this turn\.$/i;

/**
 * "You may cast target instant or sorcery card from a graveyard, and mana of any type can be spent to cast that spell. If that spell would be put into a graveyard, exile it
 * instead." (D-990 to D-992 and D-994, CR 614.1a): "that spell" is the one cast, so the second sentence is a rider of the first and the two are read as one instruction
 * (`effect.cast-graveyard-card`; the first may follow the comma of a trigger).
 */
const CAST_TARGET_FROM_GRAVEYARD =
  /(?:^|, )you may cast target [^.,]* cards? from a graveyard(?:, and mana of any type can be spent to cast that spell)?\.$/i;
const EXILE_THAT_SPELL_INSTEAD =
  /^if that spell would be put into a graveyard, exile it instead\.$/i;

/**
 * "Reveal the top five cards of your library. An opponent separates those cards into two piles. Put one pile into your hand and the other into your graveyard." (D-303, CR 700.3):
 * three sentences that are one instruction (what is revealed, who separates it and where each pile goes), kept together so `effect.reveal-separate-piles` reads them as one. Only all
 * three in a row.
 */
const REVEAL_THE_TOP = /^reveal the top [^.]* cards of your library\.$/i;
const SEPARATES_INTO_PILES = /^an opponent separates those cards into two piles\.$/i;
const PUT_ONE_PILE = /^put one pile into your hand and the other into your graveyard\.$/i;

function joinLookAtTop(text: string, spans: Span[]): Span[] {
  const out: Span[] = [];
  for (let i = 0; i < spans.length; i++) {
    const [a, b, c] = [spans[i], spans[i + 1], spans[i + 2]];
    const said = (span: Span | undefined, re: RegExp) =>
      span !== undefined && re.test(text.slice(span.start, span.end));
    if (
      a !== undefined &&
      c !== undefined &&
      said(a, REVEAL_THE_TOP) &&
      said(b, SEPARATES_INTO_PILES) &&
      said(c, PUT_ONE_PILE)
    ) {
      out.push({ start: a.start, end: c.end });
      i += 2;
    } else if (
      a !== undefined &&
      c !== undefined &&
      said(a, EXILE_UNTIL_NONLAND) &&
      said(b, MAY_CAST_FREE_IF) &&
      said(c, ELSE_INTO_HAND)
    ) {
      out.push({ start: a.start, end: c.end });
      i += 2;
    } else if (
      a !== undefined &&
      b !== undefined &&
      ((said(a, SHUFFLE_THEN_REVEAL) && said(b, IF_ITS_CARD_PUT_ONTO)) ||
        (said(a, LOOK_AT_TOP_CARD) && said(b, IF_ITS_CARD_MAY_TAKE)) ||
        (said(a, EACH_PLAYER_EXILES) && said(b, WHEN_NONLAND_EXILED)) ||
        (said(a, FOR_EACH_PLAYER_CHOOSE) && said(b, THEN_SACRIFICE_OTHERS)) ||
        (said(a, OPPONENT_CHOOSES_EXILED) && said(b, PUT_THAT_CARD_BOTTOM_RETURN_OTHER)) ||
        (said(a, EXILE_AT_RANDOM) && said(b, PLAY_THE_EXILED_CARD)) ||
        (said(a, LOOK_AT_TOP) && said(b, PUT_HAND_REST_BOTTOM)) ||
        (said(a, CHOOSE_GRAVEYARD_PAIR) && said(b, MAY_RETURN_THOSE_CARDS)) ||
        (said(a, CAST_TARGET_FROM_GRAVEYARD) && said(b, EXILE_THAT_SPELL_INSTEAD)))
    ) {
      out.push({ start: a.start, end: b.end });
      i += 1;
    } else if (
      a !== undefined &&
      c !== undefined &&
      said(a, LOOK_AT_TOP) &&
      (said(b, TAKE_FROM_AMONG) || said(b, PUT_ANY_TOTAL)) &&
      said(c, PUT_THE_REST)
    ) {
      out.push({ start: a.start, end: c.end });
      i += 2;
    } else if (
      a !== undefined &&
      b !== undefined &&
      said(a, LOOK_AT_TOP) &&
      said(b, SPLIT_THE_TOP)
    ) {
      out.push({ start: a.start, end: b.end });
      i += 1;
    } else if (
      a !== undefined &&
      b !== undefined &&
      said(a, REVEAL_UNTIL) &&
      said(b, PUT_THAT_CARD)
    ) {
      out.push({ start: a.start, end: b.end });
      i += 1;
    } else if (a !== undefined) out.push(a);
  }
  return out;
}

/**
 * Sentences of `[start, end)`: split after a period that is followed by white space or the end,
 * outside quotes. A sentence keeps its period (the sentence parser reads it); a last sentence
 * with no period is kept as it is, and then fails where the period should be. "You may choose new
 * targets for the copy." stays with the sentence before it (stage P27).
 */
export function splitSentences(text: string, start: number, end: number): Span[] {
  const out: Span[] = [];
  let quote = false;
  let from = start;
  for (let i = start; i < end; i++) {
    const c = text.charAt(i);
    if (isOpenQuote(c) || c === '”') {
      const closes = quote;
      quote = !quote;
      // A quote that closes right after its own period, with an "Activate only ..." restriction after it, ends the sentence (stage P69, D-276):
      // `It gains "You can't lose the game." Activate only as a sorcery.` The restriction is always a sentence of its own; the period inside the
      // quote is the one of the sentence (the sentence parser reads a quote that ends the text as its end). Any other text after a quote stays in the
      // sentence, as before ("Create a token with "Draw a card." Draw a card." is one).
      if (
        closes &&
        /\.['’]?$/u.test(text.slice(from, i)) &&
        /^\s+(?:activate\b|this ability costs\b)/iu.test(text.slice(i + 1, end))
      ) {
        const span = trimmed(text, from, i + 1);
        if (span.end > span.start) out.push(span);
        from = i + 1;
      }
    } else if (c === '.' && !quote && (i + 1 === end || /\s/.test(text.charAt(i + 1)))) {
      const span = trimmed(text, from, i + 1);
      const before = out[out.length - 1];
      if (before !== undefined && newTargetsOf(text, before, span)) {
        out[out.length - 1] = { start: before.start, end: span.end };
      } else if (span.end > span.start) out.push(span);
      from = i + 1;
    }
  }
  const rest = trimmed(text, from, end);
  const last = out[out.length - 1];
  if (last !== undefined && newTargetsOf(text, last, rest)) {
    out[out.length - 1] = { start: last.start, end: rest.end };
  } else if (rest.end > rest.start) out.push(rest);
  return joinLookAtTop(text, out);
}

/** The colon that ends a cost list: the first one outside quotes and braces. */
function costColon(text: string): number {
  let quote = false;
  let brace = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charAt(i);
    if (isOpenQuote(c) || c === '”') quote = !quote;
    else if (c === '{') brace++;
    else if (c === '}') brace--;
    else if (c === '.' && !quote && brace === 0)
      return -1; // a sentence ended first
    else if (c === ':' && !quote && brace === 0) return i;
  }
  return -1;
}

function costSpans(text: string, end: number): Span[] {
  const spans: Span[] = [];
  let from = 0;
  for (const comma of topLevelCommas(text, 0, end)) {
    spans.push(trimmed(text, from, comma));
    from = comma + 1;
  }
  spans.push(trimmed(text, from, end));
  return spans;
}

/**
 * The lead line and the bullets of a modal text that starts at `from` (stage P19, CR 700.2): a line
 * that starts with "Choose" followed by one or more bullet lines ("• ..."), as `splitAbilities` joins
 * them. The header span is the first line; each mode span is a bullet's text without its "• ". Null
 * when there is no bullet, so "Choose two target creature cards in your graveyard." is not a modal
 * text. A bullet that is empty keeps an empty span, and the mode reading fails on it.
 */
function modalBody(text: string, from: number): { header: Span; modes: Span[] } | null {
  if (!MODAL_HEADER.test(text.slice(from))) return null;
  const lines = text.slice(from).split('\n');
  const [first = '', ...bullets] = lines;
  if (bullets.length === 0 || !bullets.every((line) => line.startsWith('•'))) return null;
  const modes: Span[] = [];
  let at = from + first.length + 1;
  for (const bullet of bullets) {
    const start = at + (/^•\s*/.exec(bullet)?.[0].length ?? 0);
    modes.push(trimmed(text, start, at + bullet.length));
    at += bullet.length + 1;
  }
  return { header: trimmed(text, from, from + first.length), modes };
}

const EMPTY = { costs: [], restrictions: [], sentences: [], modes: [] } as const;

/** "• Khans — ": the bullet of a choice among named options and the name (stage P34, D-152). */
const OPTION_BULLET = /^•\s*(\p{Lu}[^—•\n]*?) — /u;

function shiftSpan(span: Span, by: number): Span {
  return { start: span.start + by, end: span.end + by };
}

/** The skeleton of text that begins `by` characters into the line, with its spans in the whole line. */
function shifted(sk: AbilitySkeleton, text: string, by: number): AbilitySkeleton {
  const optional = <K extends keyof AbilitySkeleton>(key: K) =>
    sk[key] === undefined ? {} : { [key]: shiftSpan(sk[key] as Span, by) };
  return {
    ...sk,
    text,
    whole: shiftSpan(sk.whole, by),
    costs: sk.costs.map((s) => shiftSpan(s, by)),
    restrictions: sk.restrictions.map((s) => shiftSpan(s, by)),
    sentences: sk.sentences.map((s) => shiftSpan(s, by)),
    modes: sk.modes.map((s) => shiftSpan(s, by)),
    ...optional('triggerWord'),
    ...optional('trigger'),
    ...optional('interveningIf'),
    ...optional('modalHeader'),
  };
}

/**
 * An activated ability's skeleton, the costs before the colon at `colon` and the effect after it (CR 602.1): modal, or sentences with
 * the "Activate only ..." restrictions that follow the effect.
 */
function activatedSkeleton(
  text: string,
  colon: number,
  base: Omit<AbilitySkeleton, 'head'>,
): AbilitySkeleton {
  // "{2}, {T}: Choose one —" and its bullets (stage P19, CR 700.2a): the body is the modes.
  const modes = modalBody(text, trimmed(text, colon + 1, text.length).start);
  if (modes !== null) {
    return {
      ...base,
      head: 'activated',
      costs: costSpans(text, colon),
      modalHeader: modes.header,
      modes: modes.modes,
    };
  }
  const all = splitSentences(text, colon + 1, text.length);
  // "Activate only ..." (CR 602.5) and "This ability costs {4} less to activate if ..." (stage P30, CR 601.2f) follow the effect.
  const firstRestriction = all.findIndex((s) =>
    /^(?:activate\b|this ability costs\b)/i.test(text.slice(s.start)),
  );
  const body = firstRestriction === -1 ? all : all.slice(0, firstRestriction);
  const restrictions = firstRestriction === -1 ? [] : all.slice(firstRestriction);
  return {
    ...base,
    head: 'activated',
    costs: costSpans(text, colon),
    restrictions,
    sentences: body,
  };
}

/** Splits one normalized ability line into its skeleton. `face` is what kind of card it is on. */
export function segment(text: string, face: FaceKind): AbilitySkeleton {
  const bullet = OPTION_BULLET.exec(text);
  if (bullet !== null) {
    const by = bullet[0].length;
    return {
      ...shifted(segment(text.slice(by), face), text, by),
      option: bullet[1] ?? '',
    };
  }
  const whole = { start: 0, end: text.length };
  const base = { text, face, whole, ...EMPTY };

  const chapter = CHAPTER_PREFIX.exec(text);
  if (chapter !== null) {
    // CR 714.2: a chapter symbol is a keyword ability that represents a triggered ability. The
    // numerals are the trigger; the body is read like the body of any triggered ability.
    const numerals = chapter[1] ?? '';
    return {
      ...base,
      head: 'triggered',
      trigger: { start: 0, end: numerals.length },
      chapter: true,
      sentences: splitSentences(text, chapter[0].length, text.length),
    };
  }

  // "When you next cast an instant or sorcery spell this turn, copy that spell." (D-336, CR 603.7): a spell's sentence that creates a delayed triggered ability,
  // not a triggered ability of a permanent; it is read as the sentences of the body (`sentence.delayed`).
  if (TRIGGER_WORD.test(text) && !DELAYED_CAST_LEAD.test(text)) {
    const word = /^\S+/.exec(text) ?? [''];
    const wordSpan = { start: 0, end: word[0].length };
    const bodyFrom = word[0].length + 1;
    const commas = topLevelCommas(text, bodyFrom, text.length);
    const comma = commas[0];
    if (comma === undefined) {
      // "When ~ dies" with nothing after it: the trigger is everything, the body is missing.
      return {
        ...base,
        head: 'triggered',
        triggerWord: wordSpan,
        trigger: trimmed(text, bodyFrom, text.length),
      };
    }
    const trigger = trimmed(text, bodyFrom, comma);
    let bodyStart = comma + 2;
    let interveningIf: Span | undefined;
    if (/^if\s/i.test(text.slice(bodyStart))) {
      const next = topLevelCommas(text, bodyStart, text.length)[0];
      if (next !== undefined) {
        interveningIf = trimmed(text, bodyStart, next);
        bodyStart = next + 2;
      }
    }
    // "When ~ enters, choose one —" and its bullets (stage P19, CR 700.2b): the body is the modes.
    const modal = modalBody(text, bodyStart);
    return {
      ...base,
      head: 'triggered',
      triggerWord: wordSpan,
      trigger,
      ...(interveningIf === undefined ? {} : { interveningIf }),
      ...(modal === null
        ? { sentences: splitSentences(text, bodyStart, text.length) }
        : { modalHeader: modal.header, modes: modal.modes }),
    };
  }

  // CR 606.2 (stage P47, D-202): a loyalty ability, read before the replacement test below ("... would be put into your graveyard, exile it instead").
  const loyalty = LOYALTY_PREFIX.exec(text);
  if (loyalty !== null) return activatedSkeleton(text, loyalty[0].length - 1, base);

  const modal = modalBody(text, 0);
  if (modal !== null) {
    return { ...base, head: 'modal', modalHeader: modal.header, modes: modal.modes };
  }

  if (
    REPLACEMENT_ENTERS.test(text) ||
    REPLACEMENT_IF_ENTERS.test(text) ||
    (/ would /.test(text) && / instead\b/.test(text))
  ) {
    return { ...base, head: 'replacement' };
  }

  const colon = costColon(text);
  if (colon > 0) {
    const costText = text.slice(0, colon);
    if (costText.includes('{') || COST_WORDS.test(costText)) {
      return activatedSkeleton(text, colon, base);
    }
  }

  return { ...base, head: 'other', sentences: splitSentences(text, 0, text.length) };
}
