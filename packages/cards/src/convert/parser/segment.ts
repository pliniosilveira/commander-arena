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
import { COUNTER_BLITZ_C_JOINS } from './segment-counter-blitz-c';
import { COUNTER_BLITZ_E_SEARCH_JOIN } from './segment-counter-blitz-e';
import { CHOOSE_TARGET_CREATURE, WHEN_THAT_CREATURE_DIES_RETURN } from './segment-counter-group-a';

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
  /** activated, "Boast — {cost}: ..." (CR 702.142a): the keyword adds "Activate only if this creature attacked this turn and only once each turn". */
  readonly boast?: true;
  /** activated: trailing "Activate only ..." sentences. */
  readonly restrictions: readonly Span[];
  /** triggered, activated, other: the sentences of the body, each with its period. */
  readonly sentences: readonly Span[];
  /** modal: the "Choose one —" header and one span per bullet. */
  readonly modalHeader?: Span;
  readonly modes: readonly Span[];
  /**
   * triggered: "..., you may pay {1}. When you do, choose one —" and its bullets (D-511, CR 603.12, 700.2b): the `sentences` are those before "When you do," and these
   * are the header of the reflexive ability's modal text and one span per bullet.
   */
  readonly reflexiveModalHeader?: Span;
  readonly reflexiveModes?: readonly Span[];
  /** replacement: the whole statement. */
  readonly whole: Span;
  /**
   * "• Khans — At the beginning of your upkeep, ..." (stage P34, D-152, CR 607.2d): the name of the option of an "As ~ enters, choose
   * Khans or Dragons" that this ability belongs to. The skeleton is that of the text after the name; its spans are in the whole line.
   */
  readonly option?: string;
}

const TRIGGER_WORD = /^(?:when|whenever|at)\s/i;
/**
 * "You may exert ~ as it attacks. When you do, ..." (CR 701.43d, 607.2h, 603.12; Glorybringer): the optional cost of attacking and the ability linked to it, in one
 * paragraph. It is read as a triggered ability whose trigger is the first sentence (`trigger.exerted`) and whose body follows "When you do,".
 */
const EXERT_LEAD =
  /^(?:if (?:~|this creature) hasn['’]t been exerted this turn, )?you may exert (?:~|this creature|it) as it attacks\. when you do, /i;
/** "When you next cast an instant or sorcery spell this turn, " (D-336) and "When you cast your next instant or sorcery spell this turn, " (Twinferno): the lead of a sentence that creates a delayed triggered ability. */
const DELAYED_CAST_LEAD = /^when you (?:next cast an? |cast your next )[^,.]+ spell this turn, /i;
/** "Whenever one or more creatures you control deal combat damage to one or more players this turn, " (Forth Eorlingas!, CR 603.7): the lead of a spell's sentence that creates a delayed triggered ability for the turn. */
const DELAYED_COMBAT_BATCH_LEAD =
  /^whenever one or more creatures you control deal combat damage to one or more players this turn, /i;
/** A line that starts a modal spell or ability: "Choose one —", "Choose one. If you control ...". */
/** "Tiered" (D-433, CR 702.183a) is the lead line of a modal text whose modes have costs, as "Choose one —" is of the others. */
const MODAL_HEADER =
  /^(?:choose\b|tiered(?:\n|$)|spree(?:\n|$)|you may choose two\. each mode must target a different player\.(?:\n|$))/i;
const REPLACEMENT_ENTERS = /^(?:as )?~ enters\b/i;
/** "You may have ~ enter as a copy of any creature on the battlefield, except ..." (issue 104, CR 614.12): the replacement effect of a permanent that enters as a copy, said without "As". */
const REPLACEMENT_ENTER_AS_COPY = /^you may have ~ enter as a copy of\b/i;
/** "~ escapes with two +1/+1 counters on it." (D-482, CR 702.138c): the replacement effect of a permanent that escaped. */
const REPLACEMENT_ESCAPES = /^~ escapes with\b/i;
/** "Umbra armor" (CR 702.89a, D-417): the keyword line of an Aura, which is a replacement effect of the permanent it enchants. */
const REPLACEMENT_UMBRA_ARMOR = /^umbra armor$/i;
/** "If ~ was kicked, it enters with ...": a conditional replacement of the permanent itself. */
const REPLACEMENT_IF_ENTERS = /^if [^,]+, (?:~|it) enters\b/i;
const COST_WORDS = /^(?:sacrifice|discard|pay|remove|exile|tap|reveal this card from your hand)\b/i;
/** "Put a -1/-1 counter on ~: Untap ~." (Devoted Druid, CR 118.3, 122.1): counters put on the permanent are a cost with no symbol before it. */
const COST_PUT_COUNTERS_WORDS = /^put (?:an? |\w+ )[^:,]* counters? on ~$/i;
/**
 * The loyalty symbol that starts a loyalty ability (CR 606.2, 606.4, 606.5; stage P47, D-202): "+1", "−2" (U+2212, which Oracle text writes; a hyphen-minus and an
 * en dash too), "0", "−X", each with or without the square brackets of the rules text. The colon follows at once.
 */
const LOYALTY_PREFIX = /^\[?(?:[+]\d+|[\u2212\u2013-](?:\d+|X)|0)\]?\s*:/;
/**
 * "{2}, Sacrifice ~: You may cast target instant or sorcery card from your graveyard this turn. If that spell would be put into your graveyard, exile it instead." (D-359,
 * Vohar, Vodalian Desecrator): an activated ability, or a spell, whose permission carries the rider, read before the replacement test below, which "would ... instead" would take.
 */
const ACTIVATED_MAY_CAST_RIDER =
  /^(?:[^:.]+: )?you may cast target [^.,]* cards? from your graveyard (?:this turn|until end of turn)\. if that spell would be put into your graveyard, exile it instead\./i;

/**
 * "{1}{R}{W}, {T}, Sacrifice a Spirit: Choose target card exiled with ~. You may cast that card this turn without paying its mana cost. If that spell would be put into a graveyard, put it on
 * the bottom of its owner's library instead." (Lorehold group 2, issue 86, Quintorius, Loremaster): an activated ability whose last sentence is the rider of the permission the second gives,
 * read before the replacement test below, which "would ... instead" would take.
 */
const ACTIVATED_CAST_EXILED_RIDER =
  /^[^:.]+: choose target card exiled with ~\. you may cast that card this turn without paying its mana cost\. if that spell would be put into a graveyard, put it on the bottom of its owner['’]s library instead\./i;

/**
 * "{2}{B}{B}, {T}: Return target creature card from your graveyard to the battlefield. It gains haste. Exile it at the beginning of the next end step. If it would leave the battlefield,
 * exile it instead of putting it anywhere else. Activate only as a sorcery." (Gisa deck, group 4, D-459, Whip of Erebos): an activated ability whose last sentence says a replacement
 * effect of the permanent its first sentence put onto the battlefield; read before the replacement test below, which "would ... instead" would take.
 */
const LEAVE_EXILE_RIDER =
  /\. if (?:it|that creature) would leave the battlefield, exile it instead of putting it anywhere else\./i;

/**
 * "Put target creature card from a graveyard onto the battlefield under your control with a corpse counter on it. You take the initiative. If that creature would leave the
 * battlefield, exile it instead of putting it anywhere else." (From the Catacombs, CR 614.1a): a spell whose first sentence puts a card onto the battlefield and whose last says a
 * replacement effect of the permanent it put there, read before the replacement test below, which "would ... instead" would take.
 */
const SPELL_LEAVE_EXILE_RIDER =
  /^put [^.:]+ onto the battlefield[^.:]*\. (?:[^.:]+\. )*if (?:it|that creature) would leave the battlefield, exile it instead of putting it anywhere else\.$/i;

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

const EVENT_WORD =
  '(?:enters(?: the battlefield)?|dies|attacks|blocks|becomes (?:tapped|untapped|blocked|the target of a spell))';

/**
 * Whether the comma at `at` separates two events of a trigger's list ("attacks, blocks, or becomes the target of a spell"): an event ends right before it and an event (after an
 * optional "or") follows it. The next comma, the one that ends the list, is followed by the effect. A trigger of one event or of "A or B" has no such comma.
 */
function insideEventList(text: string, at: number): boolean {
  return (
    new RegExp(`${EVENT_WORD}$`, 'iu').test(text.slice(Math.max(0, at - 40), at)) &&
    new RegExp(`^, (?:or )?${EVENT_WORD}(?![\\p{L}\\p{N}])`, 'iu').test(text.slice(at, at + 60))
  );
}

/** The words that end a clause of a trigger that lists whole clauses ("another creature dies, or a creature card leaves your graveyard"; CR 603.2c). */
const GRAVEYARD_EVENT_END =
  '(?:dies|leaves your graveyard|is put into a graveyard from anywhere other than the battlefield)';

/**
 * Whether the comma at `at` separates two clauses of a trigger of graveyard events ("Whenever another creature dies, or a creature card leaves your graveyard, ..."): a clause ends
 * right before it and another clause that ends with one of those events follows it. The comma that ends the list is followed by the effect.
 */
function insideGraveyardEventList(text: string, at: number): boolean {
  return (
    new RegExp(`${GRAVEYARD_EVENT_END}$`, 'iu').test(text.slice(Math.max(0, at - 90), at)) &&
    new RegExp(
      `^, (?:or )?(?:an?|another) [^,]{0,60}? ${GRAVEYARD_EVENT_END}(?![\\p{L}\\p{N}])`,
      'iu',
    ).test(text.slice(at, at + 160))
  );
}

/**
 * Whether the comma at `at` separates two types of a list of spells in the trigger ("Whenever you cast an Aura, Equipment, or Vehicle spell, draw a card"; D-644): the words before it are
 * the start of the list after "cast" or "casts", and the words after it end the list with "spell". The comma after "spell" is the one that ends the trigger.
 */
function insideSpellTypeList(text: string, at: number): boolean {
  return (
    /(?:cast|casts) an? [A-Za-z-]+(?:, [A-Za-z-]+)*$/u.test(text.slice(Math.max(0, at - 70), at)) &&
    /^, (?:[A-Za-z-]+, )*(?:or )?[A-Za-z-]+ spells?(?![\p{L}\p{N}])/u.test(text.slice(at, at + 80))
  );
}

const ABILITY_KIND = '(?:artifact|creature|land|enchantment|planeswalker)';

/**
 * Whether the comma at `at` belongs to the trigger condition "an opponent activates an ability of an artifact, creature, or land on the battlefield, if it isn't a mana ability" (Harsh Mentor, CR 602.2,
 * 603.4): a comma between the kinds of permanent, or the one before the intervening "if it isn't a mana ability". The comma after "mana ability" is the one that ends the trigger.
 */
function insideActivationKindList(text: string, at: number): boolean {
  const before = text.slice(Math.max(0, at - 110), at);
  const after = text.slice(at, at + 90);
  const head = new RegExp(
    `activates? an ability of an? ${ABILITY_KIND}(?:, ${ABILITY_KIND})*$`,
    'iu',
  );
  const tail = new RegExp(
    `^, (?:${ABILITY_KIND}, )*(?:or )?${ABILITY_KIND} on the battlefield, if it`,
    'iu',
  );
  const ifClause = /activates? an ability of an? [a-z, ]+ on the battlefield$/iu;
  return (
    (head.test(before) && tail.test(after)) ||
    (ifClause.test(before) && /^, if it (?:isn['’]t|is not) a mana ability,/iu.test(after))
  );
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
      // D-448 (CR 603.2c): "Whenever ~ attacks, blocks, or becomes the target of a spell, ...": a comma between the events of a list is not the end of the trigger condition.
      !insideEventList(text, i) &&
      !insideGraveyardEventList(text, i) &&
      // D-644: "Whenever you cast an Aura, Equipment, or Vehicle spell, ...": a comma between the types of a list of spells is not the end of the trigger condition.
      !insideSpellTypeList(text, i) &&
      // Harsh Mentor (CR 602.2, 603.4): "an ability of an artifact, creature, or land on the battlefield, if it isn't a mana ability, ...": the commas of the condition are not its end.
      !insideActivationKindList(text, i) &&
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
/** "Copy target instant or sorcery spell an opponent controls twice." (issue 81, Venser, Fervent Forger): its permission to choose new targets for the copies is the next sentence. */
const COPY_TWICE = /(?:^|, )copy target [^.]* an opponent controls twice\.$/i;

/**
 * "Copy that spell for each other creature you control that the spell could target. Each copy targets a different one of those creatures." (Feather group 3, D-438, CR 707.10e): the
 * second sentence only says where the copies of the first aim, so the two are read as one (`effect.copy-spell-each`). Joined only to a sentence that says it, for "you" and for "that player".
 */
const COPY_EACH_SENTENCE = /^each copy targets a different one of those creatures\.$/i;
const COPY_FOR_EACH_OTHER =
  /(?:^|, )(?:copy that spell|that player copies that spell) for each other creature (?:you|they) control that the spell could target\.$/i;
/**
 * "Exile that card instead of putting it into your graveyard as it resolves. If you do, return it to your hand at the beginning of the next end step." (Feather group 3, D-439, CR 614.1a,
 * 603.7): "if you do" is about the exile of the sentence before it, so the two are read as one (`effect.exile-on-resolve`).
 */
const RETURN_EXILED_SENTENCE =
  /^if you do, return it to your hand at the beginning of the next end step\.$/i;
const EXILE_ON_RESOLVE =
  /(?:^|, )exile that card instead of putting it into your graveyard as it resolves\.$/i;

/**
 * "Copy that spell if it targets a permanent or player, and you may choose new targets for the copy. If you don't copy a spell this way, draw a card." (Shiko and Narset, Unified, CR 608.2c): the
 * second sentence is the "otherwise" of the condition of the first, so the two are read as one (`effect.copy-spell`).
 */
const NOT_COPIED_SENTENCE = /^if you don['’]t copy a spell this way, draw a card\.$/i;
const COPY_IF_TARGETS =
  /(?:^|, )copy that spell if it targets a permanent or player(?:,? and you may choose new targets for the copy)?\.$/i;

/**
 * "..., create a 1/1 red Soldier creature token with haste, then copy that spell. The copy targets that token." (Frontline Heroism, issue 144, CR 707.10e): the second sentence only says what
 * the copy of the first targets, so the two are read as one (`effect.copy-spell`). Joined only to a sentence that ends in the copy of the spell of the trigger.
 */
const COPY_TARGETS_TOKEN_SENTENCE = /^the copy targets that token\.$/i;
/** "Round up each time." (Saw in Half, CR 107.1a): the rounding of the halves the copy exception before it says, so it stays with that sentence. */
const ROUND_UP_SENTENCE = /^round up each time\.$/i;
const HALF_COPY_END = /their toughness is half that creature['’]s toughness\.$/i;
const COPY_THAT_SPELL_END = /(?:^|, )(?:then )?copy (?:that spell|it)\.$/i;

/**
 * "You may cast it this turn, and mana of any type can be spent to cast that spell. If that spell would be put into a graveyard, exile it instead." (Dire Fleet Daredevil, CR 614.1a): the second
 * sentence is a rider of the permission the first gives, so the two are read as one (`effect.may-cast-any-type`).
 */
const EXILE_INSTEAD_SENTENCE = /^if that spell would be put into a graveyard, exile it instead\.$/i;
const MAY_CAST_ANY_TYPE_END =
  /(?:^|, )(?:you may )?cast (?:it|that card) this turn, and mana of any type can be spent to cast that spell\.$/i;

/** Whether `text` at `span` is a sentence about the new targets that goes with the sentence `before` it (stage P27, D-337). */
function newTargetsOf(text: string, before: Span | undefined, span: Span): boolean {
  if (before === undefined) return false;
  const said = text.slice(span.start, span.end);
  const beforeText = text.slice(before.start, before.end);
  if (EXILE_INSTEAD_SENTENCE.test(said)) return MAY_CAST_ANY_TYPE_END.test(beforeText);
  if (COPY_EACH_SENTENCE.test(said)) return COPY_FOR_EACH_OTHER.test(beforeText);
  if (RETURN_EXILED_SENTENCE.test(said)) return EXILE_ON_RESOLVE.test(beforeText);
  if (NOT_COPIED_SENTENCE.test(said)) return COPY_IF_TARGETS.test(beforeText);
  if (COPY_TARGETS_TOKEN_SENTENCE.test(said)) return COPY_THAT_SPELL_END.test(beforeText);
  if (ROUND_UP_SENTENCE.test(said)) return HALF_COPY_END.test(beforeText);
  if (NEW_TARGETS_SENTENCE.test(said)) return true;
  return (
    NEW_TARGETS_COPIES_SENTENCE.test(said) &&
    (COPY_FOR_EACH.test(text.slice(before.start, before.end)) ||
      COPY_TWICE.test(text.slice(before.start, before.end)))
  );
}

/**
 * "Look at the top six cards of your library. You may reveal an artifact card from among them and put it into your hand. Put the rest on
 * the bottom of your library in a random order." (stage P31, D-140): three sentences that are one instruction (what is looked at, what
 * may be taken from among them, where the rest go), kept together so `effect.look-take` reads them as one. Only all three in a row.
 */
const LOOK_AT_TOP = /^look at the top [^.]* cards of your library\.$/i;
const TAKE_FROM_AMONG =
  /^you may reveal [^.]* from among them and put (?:it|that card|them|those cards) (?:into your hand|onto the battlefield(?: tapped)?)\.$/i;
const PUT_THE_REST = /^put the rest [^.]*\.$/i;
/**
 * "Each player chooses a number of lands they control equal to the number of lands controlled by the player who controls the fewest, then sacrifices the rest. Players discard cards and
 * sacrifice creatures the same way." (Magus of the Balance, CR 101.4, 608.2d, 701.9, 701.21a): two sentences that are one instruction (`effect.balance`).
 */
const EACH_PLAYER_CHOOSES_FEWEST_LANDS =
  /(?:^|: |, )each player chooses a number of lands they control equal to the number of lands controlled by the player who controls the fewest, then sacrifices the rest\.$/i;
const DISCARD_AND_SACRIFICE_SAME_WAY =
  /^players discard cards and sacrifice creatures the same way\.$/i;
/**
 * "Look at the top four cards of target opponent's library, exile one of them face down, then put the rest on the bottom of that library in a random order. You may cast that card for
 * as long as it remains exiled, and mana of any type can be spent to cast that spell." (Gonti, Lord of Luxury, CR 401.2, 406.3, 609.4b): two sentences that are one instruction
 * (`effect.look-exile-cast-any-type`).
 */
const LOOK_EXILE_ONE_FACE_DOWN =
  /(?:^|, )look at the top [^.]* cards of [^.]* library, exile one of them face down, then put the rest [^.]*\.$/i;
const MAY_CAST_THAT_CARD_ANY_TYPE =
  /^you may cast that card for as long as it remains exiled, and mana of any type can be spent to cast that spell\.$/i;
/**
 * "For each player, choose up to one target creature card in that player's graveyard. Put those cards onto the battlefield under your control." (issue 102, Afterlife from the Loam,
 * CR 115.1, 608.2c): the second sentence says what is done with the cards the first one targets, so the two are one instruction (`effect.put-one-per-graveyard`).
 */
const CHOOSE_PER_PLAYER_GRAVEYARD =
  /^for each player, choose up to one target creature card in that player['’]s graveyard\.$/i;
/**
 * "Choose an exiled card an opponent owns with a void counter on it. You may play it this turn without paying its mana cost." (issue 102, Dauthi Voidwalker, CR 608.2d, 601.2, 122.1):
 * the second sentence is what is done with the card the first one chooses, so the two are one instruction (`effect.play-chosen-void-card`).
 */
const CHOOSE_EXILED_VOID_CARD =
  /(?:^|: )choose an exiled card an opponent owns with a void counter on it\.$/i;
const MAY_PLAY_IT_FREE = /^you may play it this turn without paying its mana cost\.$/i;
/**
 * "Starting with the next opponent in turn order, each opponent chooses a creature card in your graveyard that hasn't been chosen. Return each card chosen this way to the battlefield
 * under your control." (Rejoin the Fight, CR 101.4, 608.2d): the second sentence says what is done with the cards the first one has the opponents choose, so the two are one instruction
 * (`effect.opponents-choose-graveyard-card`).
 */
const OPPONENTS_CHOOSE_GRAVEYARD_CARD =
  /^(?:then )?starting with the next opponent in turn order, each opponent chooses an? [a-z]+ card in your graveyard that hasn['’]t been chosen\.$/i;
const RETURN_EACH_CARD_CHOSEN =
  /^return each card chosen this way to the battlefield under your control\.$/i;
const PUT_THOSE_CARDS_ONTO = /^put those cards onto the battlefield under your control\.$/i;
/** "You may reveal any number of cards of the chosen type from among them and put the revealed cards into your hand." (For the Ancestors): the middle sentence of the same instruction. */
const TAKE_ANY_OF_CHOSEN_TYPE =
  /^you may reveal any number of cards of the chosen type from among them and put the revealed cards into your hand\.$/i;
/** "You may cast an instant or sorcery spell with mana value less than or equal to ~'s power from among them without paying its mana cost." (Velomachus Lorehold, CR 608.2g): the middle sentence of the same instruction (`effect.look-cast-free`). */
const COUNTER_TARGET_SPELL = /^counter target [^.]*\.$/i;
/** "If that spell is countered this way, exile it instead of putting it into its owner's graveyard, then you may cast it without paying its mana cost." (Transcendent Dragon, CR 701.6a, 614.1a, 608.2g): what the counter before it does to the spell (`effect.counter-exile-cast`). */
const EXILE_COUNTERED_THEN_CAST =
  /^if that spell is countered this way, exile it instead of putting it into its owner['’]s graveyard, then you may cast it without paying its mana cost\.$/i;
const CAST_FROM_AMONG_FREE = /^you may cast [^.]* from among them without paying its mana cost\.$/i;
/**
 * "Look at the top six cards of your library. You may put an Aura or Equipment card from among them onto the battlefield. If an Equipment is put onto the battlefield this way, you
 * may attach it to a creature you control. Put the rest of those cards on the bottom of your library in a random order." (D-658, Armored Skyhunter): four sentences that are one
 * instruction, kept together for `effect.look-put-attach`.
 */
const PUT_FROM_AMONG_ONTO =
  /^you may put [^.]* from among them onto the battlefield(?: tapped)?\.$/i;
const IF_EQUIPMENT_ATTACH =
  /^if an equipment is put onto the battlefield this way, you may attach it to a creature you control\.$/i;
const PUT_REST_OF_THOSE = /^put the rest of those cards [^.]*\.$/i;
/** "Put any number of nonland permanent cards with total mana value 4 or less from among them onto the battlefield." (stage P68, D-230): the middle sentence of the same instruction. */
const PUT_ANY_TOTAL =
  /^put any number of [^.]* with total mana value \d+ or less from among them onto the battlefield\.$/i;

/**
 * "Reveal the top five cards of your library. Put a land card from among them onto the battlefield and the rest into your graveyard." (Cavalier of Thorns, CR 701.20a, 608.2c): the
 * second sentence says what is done with the cards the first one reveals, so the two are read as one instruction (`effect.reveal-put-one-battlefield`).
 */
const PUT_ONE_AMONG_REST_GRAVEYARD =
  /^put an? [^.]* card from among them onto the battlefield and the rest into your graveyard\.$/i;
/**
 * "Whenever a creature you control enters, you may look at the top X cards of your library, where X is that creature's power. If you do, put one of those cards on top of your
 * library and the rest on the bottom of your library in any order." (Cream of the Crop, CR 401.2, 401.4): the second sentence says what the first one's look leads to, so the two
 * are read as one instruction (`effect.look-top-x-one-on-top`; the first may follow the comma of a trigger).
 */
const LOOK_TOP_X_WHERE =
  /(?:^|, )(?:you may )?look at the top X cards of your library, where X is [^.]*\.$/i;
const IF_YOU_DO_ONE_ON_TOP_REST_BOTTOM =
  /^if you do, put one of those cards on top of your library and the rest on the bottom of your library in any order\.$/i;
/**
 * "Look at the top card of your library. If it's a land card, you may put it onto the battlefield tapped. If you don't put the card onto the battlefield, put it into your hand." (Risen
 * Reef, CR 608.2c): three sentences that are one instruction (the first may follow the comma of a trigger), kept together for `effect.look-top-land-else-hand`.
 */
const IF_ITS_CARD_MAY_PUT_TAPPED =
  /^if it['’]s an? [^.,]* card, you may put it onto the battlefield tapped\.$/i;
const IF_NOT_ONTO_BATTLEFIELD_HAND =
  /^if you don['’]t put the card onto the battlefield, put it into your hand\.$/i;

/**
 * "Choose an opponent at random that ~ didn't attack during your last combat. ~ attacks that player this combat if able. If you can't choose an opponent this way, tap ~." (Territorial
 * Hellkite, CR 508.1d): three sentences that are one instruction (the first may follow the comma of a trigger), kept together for `effect.attack-random-opponent`.
 */
const CHOOSE_OPPONENT_AT_RANDOM =
  /(?:^|, )choose an opponent at random that ~ didn['’]t attack during your last combat\.$/i;
const ATTACKS_THAT_PLAYER_THIS_COMBAT = /^~ attacks that player this combat if able\.$/i;
/**
 * "Each player rolls a d20. If one or more opponents had the highest result, ~ can't attack those players or planeswalkers they control this combat." (Chaos Dragon, CR 706.2, 508.1a):
 * the roll and what its result does, one instruction (`effect.each-player-rolls-bar-highest`); the roll may follow the comma of a trigger.
 */
const EACH_PLAYER_ROLLS_D = /(?:^|, )each player rolls a d\d+\.$/i;
const IF_OPPONENTS_HIGHEST_CANT_ATTACK =
  /^if one or more opponents had the highest result, ~ can['’]t attack those players or planeswalkers they control this combat\.$/i;
const CANT_CHOOSE_TAP_IT = /^if you can['’]t choose an opponent this way, tap ~\.$/i;
/**
 * "Mill a card and choose an opponent at random. ~ attacks that player this combat if able." (Ursine Monstrosity, CR 508.1d): the choice may follow a comma, "and" or nothing, and
 * the second sentence says whom the creature must attack, so the two are kept together for `effect.attack-random-opponent-any`.
 */
const CHOOSE_ANY_OPPONENT_AT_RANDOM = /(?:^|, |\band )choose an opponent at random\.$/i;

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
const PUT_HAND_REST_TOP =
  /^put one of them into your hand and the rest on top of your library in any order\.$/i;
const PUT_HAND_OTHER_BOTTOM =
  /^put one of them into your hand and the other on the bottom of your library\.$/i;

/**
 * "Add {R} for each card in target opponent's hand. Until end of turn, you don't lose this mana as steps and phases end." (Prismari deck group 2, D-650, CR 500.5): the second sentence
 * says what happens to the mana the first adds, so the two are read as one instruction (`effect.add-mana-stays`).
 */
const ADD_MANA_SENTENCE = /^add [^.]*\.$/i;
const MANA_STAYS_SENTENCE =
  /^until end of turn, you don['’]t lose this mana as steps and phases end\.$/i;

/**
 * "Until end of turn, any time you could activate a mana ability, you may pay 1 life. If you do, add {C}." (Channel, CR 605.1a, 118.3): the second sentence is what the mana ability
 * the first gives does, so the two are read as one instruction (`effect.player-mana-ability`).
 */
const PLAYER_MANA_ABILITY_SENTENCE =
  /^until end of turn, any time you could activate a mana ability, you may pay [^.]*\.$/i;
const IF_YOU_DO_ADD_SENTENCE = /^if you do, add [^.]*\.$/i;

/**
 * "Then choose odd or even. Return each creature with power of the chosen quality to its owner's hand." (Zimone's Hypothesis, CR 608.2d): the choice and the instruction that reads it are one
 * instruction, kept together for `effect.choose-parity-return`.
 */
const CHOOSE_ODD_OR_EVEN = /^(?:then )?choose odd or even\.$/i;
const RETURN_CHOSEN_PARITY =
  /^return each creature with power of the chosen quality to its owner['’]s hand\.$/i;

/**
 * "Prevent all combat damage that would be dealt to you this turn. For each 1 damage prevented this way, create a 2/1 white and black Inkling creature token with flying." (CR 615.5):
 * the second sentence is the additional effect of the prevention the first makes, so the two are read as one instruction (`effect.prevent-all-create-tokens`).
 */
const PREVENT_ALL_SENTENCE = /^prevent all [^.]*\.$/i;
const FOR_EACH_PREVENTED_SENTENCE = /^for each 1 damage prevented this way, create [^.]*\.$/i;

/**
 * "Exile up to one target instant or sorcery card from your graveyard and copy it. You may cast the copy without paying its mana cost." (Prismari deck group 2, D-654, CR 707.12): the
 * second sentence is what is done with the copy the first makes, so the two are read as one instruction (`effect.exile-copy-cast`).
 */
const EXILE_AND_COPY_IT = /^exile [^.]* and copy it\.$/i;
/**
 * "Exile target instant or sorcery card from a graveyard. Copy that card three times. You may cast the copies without paying their mana costs." (Mnemonic Deluge, CR 707.12): the three
 * sentences are one instruction (`effect.exile-copy-card-times`).
 */
const EXILE_CARD_FROM_A_GRAVEYARD = /^exile target [^.]* card from a graveyard\.$/i;
const COPY_THAT_CARD_TIMES = /^copy that card (?:twice|[a-z0-9]+ times)\.$/i;
const MAY_CAST_THE_COPIES = /^you may cast the copies without paying their mana costs\.$/i;
/**
 * "Each opponent may create X 1/1 red Elemental creature tokens with haste. For each opponent who does, create X 1/1 red Elemental creature tokens with haste." (Tempt with Vengeance, issue 101,
 * CR 101.4, 111.2): the second sentence counts the opponents the first offered the tokens to who took them, so the two are read as one instruction
 * (`effect.opponents-may-create-tokens`).
 */
const EACH_OPPONENT_MAY_CREATE = /^each opponent may create [^.]*\.$/i;
/**
 * "Its controller may pay 1 life. If they do, they draw a card." (Gix, Yawgmoth Praetor, issue 101, CR 118.3, 608.2c): the offer to another player than the controller of the ability and what
 * the payment buys, one instruction (`effect.its-controller-may-pay-draw`).
 */
const ITS_CONTROLLER_MAY_PAY = /^its controller may pay [^.]*\.$/i;
const IF_THEY_DO_THEY_DRAW = /^if they do, they draw [^.]*\.$/i;
const FOR_EACH_OPPONENT_WHO_DOES_CREATE = /^for each opponent who does, create [^.]*\.$/i;
const MAY_CAST_THE_COPY = /^you may cast the copy without paying its mana cost\.$/i;
/**
 * "Exile up to one target instant or sorcery card from defending player's graveyard. If you do, copy it. You may cast the copy by paying {3} rather than paying its mana cost." (Blue Mage's
 * Cane, CR 707.12, 118.9): the second and third sentences are what is done with the copy of the card the first exiles, read as one instruction (`effect.exile-copy-cast-paying`).
 */
const EXILE_CARD_THEN_COPY = /^exile [^.]* graveyard\.$/i;
const IF_YOU_DO_COPY_IT = /^if you do, copy it\.$/i;
const MAY_CAST_THE_COPY_PAYING =
  /^you may cast the copy by paying (?:\{[^}]+\})+ rather than paying its mana cost\.$/i;
/**
 * "Exile target card that's an instant or sorcery from your graveyard. For each card exiled this way, copy it, and you may cast the copy without paying its mana cost." (Mizzix's Mastery,
 * issue 121, CR 707.12): the second sentence is what is done with the copy of each card the first exiles, read as one instruction (`effect.exile-copy-cast`).
 */
/**
 * "Then copy each card exiled with ~. You may cast any number of the copies without paying their mana costs." (Arcane Bombardment, issue 121, CR 707.12): the second sentence is what is
 * done with the copies the first makes, read as one instruction (`effect.copy-linked-exiled-and-cast`).
 */
const COPY_EACH_EXILED_WITH = /^(?:then )?copy each card exiled with ~\.$/i;
/**
 * "When you pay this cost one or more times, put that many +1/+1 counters on this creature, then exile up to that many target instant and/or sorcery cards ... and copy them. You may cast any number
 * of the copies without paying their mana costs." (Bloodthirsty Adversary, issue 121, CR 603.12, 707.12): the last sentence is what is done with the copies, part of the reflexive ability.
 */
const PAY_REFLEXIVE_AND_COPY_THEM =
  /^when you pay this cost one or more times, [^.]* and copy them\.$/i;
/**
 * "You may cast up to one target instant card and/or up to one target sorcery card from your graveyard each with mana value X or less without paying their mana costs. If a spell cast this way would
 * be put into your graveyard, exile it instead. If X is 10 or more, copy each of those spells twice. You may choose new targets for the copies." (Finale of Promise, issue 121): the four sentences
 * of one instruction, kept together for `effect.cast-instant-and-sorcery-from-graveyard-x`.
 */
const FINALE_CAST =
  /^you may cast up to one target instant card and\/or up to one target sorcery card from your graveyard each with mana value x or less without paying their mana costs\.$/i;
const FINALE_EXILE_INSTEAD =
  /^if a spell cast this way would be put into your graveyard, exile it instead\.$/i;
const FINALE_COPY_TWICE = /^if x is 10 or more, copy each of those spells twice\.$/i;
const FINALE_NEW_TARGETS = /^you may choose new targets for the copies\.$/i;
const MAY_CAST_ANY_COPIES =
  /^you may cast any number of the copies without paying their mana costs\.$/i;
const EXILE_CARD_SENTENCE = /^exile [^.]* from your graveyard\.$/i;
const FOR_EACH_EXILED_COPY_IT =
  /^for each card exiled this way, copy it, and you may cast the copy without paying its mana cost\.$/i;

/**
 * "Reveal cards from the top of your library until you reveal a land card. Put that card onto the battlefield tapped and the rest on the
 * bottom of your library in a random order." (stage P32, D-147): two sentences that are one instruction (what is revealed until, and where
 * the card found and the rest go), kept together so `effect.reveal-until` reads them as one. Only both in a row.
 */
const REVEAL_UNTIL =
  /^(?:then if this is the (?:first|second|third|fourth) time this ability has resolved this turn, |if you do, )?(?:you may )?reveal cards from the top of your library until you reveal [^.]*\.$/i;
const PUT_THAT_CARD =
  /^put (?:that card|those [\p{L}]+ cards|all [\p{L}]+ cards revealed this way) [^.]*\.$/iu;
/**
 * "Exile all creatures you control, then reveal cards from the top of your library until you reveal that many creature cards. Put all creature cards revealed this way onto the
 * battlefield, then shuffle the rest of the revealed cards into your library." (Mass Polymorph): two sentences that are one instruction, kept together for
 * `effect.reveal-until-that-many`.
 */
const EXILE_THEN_REVEAL_THAT_MANY =
  /^exile all [^.]*, then reveal cards from the top of your library until you reveal that many creature cards\.$/i;
const PUT_ALL_REVEALED_SHUFFLE_REST =
  /^put all creature cards revealed this way onto the battlefield, then shuffle the rest of the revealed cards into your library\.$/i;
/**
 * "Reveal cards from the top of your library until you reveal an Aura card. You may put that card onto the battlefield. If you don't, put it into your hand. Put the rest on the
 * bottom of your library in a random order." (D-659, Songbirds' Blessing): four sentences that are one instruction, kept together for `effect.reveal-until-may-put`.
 */
const MAY_PUT_THAT_CARD_ONTO = /^you may put that card onto the battlefield\.$/i;
/**
 * "Reveal cards from the top of your library until you reveal X creature cards of the chosen type, where X is the number of creatures you control of that type. Put those cards onto
 * the battlefield, then shuffle the rest of the revealed cards into your library." (Kindred Summons): two sentences that are one instruction, kept together for
 * `effect.reveal-until-chosen-type`.
 */
const REVEAL_UNTIL_CHOSEN_TYPE_FIRST =
  /^reveal cards from the top of your library until you reveal X creature cards of the chosen type, where X is [^.]*\.$/i;
const PUT_THOSE_CARDS_SHUFFLE_REST =
  /^put those cards onto the battlefield, then shuffle the rest of the revealed cards into your library\.$/i;
const IF_YOU_DONT_HAND = /^if you don['’]t, put it into your hand\.$/i;

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
 * "Look at the top card of your library. You may exile it face down." (Urianger Augurelt, CR 701.20, 406.3): the second sentence says what is done with the card the first one looked at, so
 * the two are one instruction, kept together for `effect.look-top-may-exile-face-down`.
 */
const YOU_MAY_EXILE_IT_FACE_DOWN = /^you may exile it face down\.$/i;
/**
 * "Until end of turn, you may play cards exiled with ~. Spells you cast this way cost {2} less to cast." (Urianger Augurelt, CR 601.2f): "this way" is the permission the first sentence gives,
 * so the two are one instruction, kept together for `effect.may-play-exiled-with-self-less`.
 */
const UNTIL_EOT_PLAY_CARDS_EXILED_WITH = /^until end of turn, you may play cards exiled with ~\.$/i;
const SPELLS_CAST_THIS_WAY_COST_LESS = /^spells you cast this way cost \{\d+\} less to cast\.$/i;
/** "If you don't put the card into your hand, put it on the bottom of your library." (Vivien's Grizzly, issue 345): the third sentence of the instruction of `LOOK_AT_TOP_CARD`. */
const ELSE_BOTTOM_OF_LIBRARY =
  /^if you don['’]t put the card into your hand, put it on the bottom of your library\.$/i;

/**
 * "Each player exiles a card from their graveyard. When one or more nonland cards are exiled this way, put that many +1/+1 counters on target attacking creature."
 * (stage P70, D-231, CR 603.12): the reflexive ability counts what the first sentence exiled, so the two are read as one instruction.
 */
const EACH_PLAYER_EXILES = /^each player exiles a card from their graveyard\.$/i;
const WHEN_NONLAND_EXILED =
  /^when one or more nonland cards are exiled this way, put that many [^.]*\.$/i;

/**
 * "Each player reveals the top card of their library. For each nonland card revealed this way, you create a Map token." (Storm Fleet Negotiator, CR 701.20a, 608.2c): the second sentence
 * counts the cards the first one revealed, so the two are read as one instruction.
 */
const EACH_PLAYER_REVEALS_TOP = /^each player reveals the top card of their library\.$/i;
const FOR_EACH_NONLAND_REVEALED_TOKEN =
  /^for each nonland card revealed this way, you create [^.]*\.$/i;

/**
 * "For each player, you choose from among the permanents that player controls an artifact, a creature, an enchantment, and a planeswalker. Then each player sacrifices all other
 * nonland permanents they control." (stage P70, D-231): the sacrifice is of what was not chosen, so the two sentences are read as one instruction.
 */
const FOR_EACH_PLAYER_CHOOSE =
  /^for each player, you choose from among the permanents that player controls [^.]*\.$/i;
const THEN_SACRIFICE_OTHERS =
  /^then each player sacrifices all other nonland permanents they control\.$/i;

/**
 * "Each player puts a vow counter on a creature they control and sacrifices the rest. Each of those creatures can't attack you or planeswalkers you control for as long as it has a vow
 * counter on it." (Promise of Loyalty, issue 89, CR 122.1, 508.1a, 611.2b): "those creatures" are the ones that got the counter, so the two sentences are read as one instruction.
 */
const EACH_PLAYER_VOW_KEEP =
  /^each player puts an? [a-z]+ counter on a creature they control and sacrifices the rest\.$/i;
const THOSE_CREATURES_CANT_ATTACK_YOU =
  /^each of those creatures can['’]t attack you or planeswalkers you control for as long as it has an? [a-z]+ counter on it\.$/i;

/**
 * "At the beginning of combat on each opponent's turn, they may pay {2}. If they don't, creatures they control can't attack Jaces you control this turn." (Jace, Multiverse Architect,
 * issue 81, CR 118.12a, 508.1a): the second sentence says what happens when the player does not pay the first one asks, so the two are read as one instruction.
 */
const THEY_MAY_PAY = /(?:^|, )they may pay (?:\{[^}]+\})+\.$/i;
/**
 * "At the beginning of combat on each opponent's turn, if you're the monarch, that opponent may pay {X}, where X is the number of cards in their hand. If they don't, they can't attack you
 * this combat." (Champions of Minas Tirith, CR 118.12a, 508.1a): the same pair of sentences, read as one instruction (`effect.pay-hand-or-cant-attack-you`).
 */
const THAT_OPPONENT_MAY_PAY_HAND =
  /(?:^|, )that opponent may pay \{X\}, where X is the number of cards in their hand\.$/i;
const IF_THEY_DONT_CANT_ATTACK_YOU_COMBAT =
  /^if they don['’]t, they can['’]t attack you this combat\.$/i;
const IF_THEY_DONT_CANT_ATTACK =
  /^if they don['’]t, creatures they control can['’]t attack [\p{L}]+ you control this turn\.$/iu;

/**
 * "When ~ enters, reveal cards from the top of your library until you reveal X creature cards, where X is the number of opponents you have. Put those creature cards onto the battlefield,
 * then shuffle." and "For each of those permanents, choose a different opponent. Each opponent gains control of the permanent for which they were chosen." (Dack Fayden, issue 81): each
 * pair is one instruction, kept together for `effect.reveal-until-opponents` and `effect.assign-control-to-opponents`.
 */
const REVEAL_UNTIL_OPPONENTS_FIRST =
  /(?:^|, )reveal cards from the top of your library until you reveal X creature cards, where X is the number of opponents you have\.$/i;
const PUT_THOSE_CREATURES_SHUFFLE =
  /^put those creature cards onto the battlefield, then shuffle\.$/i;
const FOR_EACH_PERMANENT_DIFFERENT_OPPONENT =
  /^for each of those permanents, choose a different opponent\.$/i;
const EACH_OPPONENT_GAINS_CONTROL =
  /^each opponent gains control of the permanent for which they were chosen\.$/i;

/**
 * "For each opponent, choose an artifact or land that player controls. Destroy the chosen permanents." (Ultimate Magic: Meteor, CR 608.2d): the destruction is of the permanents the
 * first sentence has the controller choose, so the two are read as one instruction (the first may follow the comma of a condition).
 */
const FOR_EACH_OPPONENT_CHOOSE =
  /(?:^|, )for each opponent, choose an? [^.,]* that player controls\.$/i;
const DESTROY_THE_CHOSEN_PERMANENTS = /^destroy the chosen permanents\.$/i;

/**
 * "Exile the top card of your library. You may play that card until you exile another card with ~." (Furious Rise, CR 607.2a): the permission is of the card the permanent exiled
 * with this ability and ends as it exiles another, so the two sentences are read as one instruction (the first may follow the comma of a condition).
 */
const EXILE_TOP_CARD_SENTENCE = /(?:^|, )exile the top card of your library\.$/i;
const PLAY_UNTIL_EXILE_ANOTHER = /^you may play that card until you exile another card with ~\.$/i;

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
 * "Exile the top four cards of your library in a face-down pile, then exile the top four cards of your library in a face-up pile. An opponent chooses one of those piles. Put that pile into
 * your graveyard. Look at the cards in the other pile." (Prismari deck group 3, D-663, CR 700.3, 406.3): four sentences that are one instruction, kept together for `effect.exile-two-piles`.
 */
const EXILE_TWO_PILES_FIRST =
  /^exile the top [^.]* cards of your library in a face-down pile, then exile the top [^.]* cards of your library in a face-up pile\.$/i;
const OPPONENT_CHOOSES_ONE_PILE = /^an opponent chooses one of those piles\.$/i;
const PUT_THAT_PILE_GRAVEYARD = /^put that pile into your graveyard\.$/i;
const LOOK_AT_OTHER_PILE = /^look at the cards in the other pile\.$/i;
/**
 * "Shuffle your library, then reveal cards from the top of it until you reveal a nonland card. Exile that card and put the rest on the bottom of your library in a random order."
 * (Creative Technique, D-664, CR 701.24, 701.20, 701.13): the second sentence says what is done with the card the first one reveals, so the two are read as one instruction
 * (`effect.shuffle-reveal-until-exile`).
 */
const SHUFFLE_THEN_REVEAL_UNTIL =
  /^shuffle your library, then reveal cards from the top of it until you reveal a [^.]*\.$/i;
const EXILE_THAT_CARD_REST_BOTTOM =
  /^exile that card and put the rest on the bottom of your library in a random order\.$/i;
/**
 * "Whenever a creature you control deals combat damage to a player this turn, copy the exiled card. You may cast the copy without paying its mana cost." (Surge to Victory, D-662,
 * CR 603.7, 707.12): the second sentence is what is done with the copy of the first, so the two are read as one delayed ability (`effect.delayed-combat-damage-copy-exiled`).
 */
const WHENEVER_COPY_EXILED_CARD = /^whenever a [^.]*, copy the exiled card\.$/i;
/**
 * "Exile a card from your graveyard at random. You may play the exiled card this turn." (stage P75, D-235): "the exiled card" is the one the first sentence exiled, so the two
 * are read as one instruction.
 */
const EXILE_AT_RANDOM = /(?:^|, then )exile a card from your graveyard at random\.$/i;
const PLAY_THE_EXILED_CARD = /^you may play the exiled card this turn\.$/i;

/**
 * "You may cast target instant or sorcery card from a graveyard, and mana of any type can be spent to cast that spell. If that spell would be put into a graveyard, exile it
 * instead." (D-350 to D-352 and D-354, CR 614.1a): "that spell" is the one cast, so the second sentence is a rider of the first and the two are read as one instruction
 * (`effect.cast-graveyard-card`; the first may follow the comma of a trigger).
 */
const CAST_TARGET_FROM_GRAVEYARD =
  /(?:^|, )you may cast target [^.,]* cards? from a graveyard(?:, and mana of any type can be spent to cast that spell| without paying its mana cost)?\.$/i;
const EXILE_THAT_SPELL_INSTEAD =
  /^if that spell would be put into a graveyard, exile it instead\.$/i;

/**
 * "For each opponent, you may cast up to one target instant or sorcery card from that player's graveyard without paying its mana cost. If a spell cast this way would be put into a
 * graveyard, exile it instead." (First Flight deck, CR 614.1a): "a spell cast this way" is each spell the first sentence cast, so the second sentence is a rider of the first and the
 * two are read as one instruction (`effect.cast-per-opponent-graveyard-free`; the first may follow the comma of a trigger).
 */
const CAST_PER_OPPONENT_FREE =
  /(?:^|, )for each opponent, you may cast up to one target [^.,]* cards? from that player['’]s graveyard without paying its mana cost\.$/i;
const EXILE_A_SPELL_CAST_THIS_WAY_INSTEAD =
  /^if a spell cast this way would be put into a graveyard, exile it instead\.$/i;

/**
 * "You may cast target instant or sorcery card from your graveyard this turn. If that spell would be put into your graveyard, exile it instead." (D-359, CR 614.1a, Vohar,
 * Vodalian Desecrator): the same rider on the permission to cast a card of your own graveyard (`effect.may-cast`), so the two sentences are one instruction.
 */
const MAY_CAST_FROM_YOUR_GRAVEYARD =
  /(?:^|, )you may cast target [^.,]* cards? from your graveyard (?:this turn|until end of turn)\.$/i;
const EXILE_THAT_SPELL_INSTEAD_YOUR =
  /^if that spell would be put into your graveyard, exile it instead\.$/i;
/**
 * "When this creature enters, you may cast target instant or sorcery card with mana value 3 or less from your graveyard without paying its mana cost. If that spell would be put into your
 * graveyard, exile it instead." (issue 144, Goblin Dark-Dwellers, CR 118.9, 614.1a): the second sentence is a rider of the cast the first one allows (`effect.cast-own-graveyard-card-free`).
 */
const CAST_SPELL_FROM_YOUR_GRAVEYARD_FREE =
  /(?:^|, )you may cast an instant or sorcery spell from your graveyard with mana value [1-9] or less without paying its mana cost\.$/i;
/**
 * "Whenever one or more opponents lose life, you may cast target instant or sorcery card from your graveyard. If that spell would be put into your graveyard, exile it instead." (Scions &
 * Spellcraft deck, group G, CR 601.2, 614.1a): the rider of a cast that pays the mana cost (`effect.cast-own-graveyard-card`), so the two sentences are one instruction.
 */
const CAST_FROM_YOUR_GRAVEYARD_PAID =
  /(?:^|, )you may cast target [^.,]* cards? from your graveyard\.$/i;
const CAST_FROM_YOUR_GRAVEYARD_FREE =
  /(?:^|, )you may cast target [^.,]* cards? [^.,]*from your graveyard without paying its mana cost\.$/i;

/**
 * "You may cast target creature card in a graveyard this turn. When you cast it this turn, ~ gains all activated abilities of that card until end of turn." (issue 159, CR 603.7,
 * Havengul Lich): the rider is a delayed ability of the permission (`effect.may-cast-any-graveyard`), so the two sentences are one instruction.
 */
const MAY_CAST_IN_A_GRAVEYARD =
  /(?:^|, )you may cast target [^.,]* cards? in a graveyard (?:this turn|until end of turn)\.$/i;
const WHEN_CAST_IT_GAINS_ABILITIES =
  /^when you cast it this turn, ~ gains all activated abilities of that card until end of turn\.$/i;

/**
 * "Each Horror you control gains all activated abilities of target artifact an opponent controls until end of turn. You may spend blue mana as though it were mana of any color to
 * activate those abilities." (Grell Philosopher, CR 609.4b, 602.2b): the second sentence says how the abilities the first gives are paid for, so the two are one instruction
 * (`effect.gain-abilities-of-target`).
 */
const GAINS_ABILITIES_OF_TARGET =
  /(?:^|, )each [^.,]* gains all activated abilities of target [^.,]* until end of turn\.$/i;
const SPEND_BLUE_AS_ANY_COLOR =
  /^you may spend blue mana as though it were mana of any color to activate those abilities\.$/i;

/**
 * "Choose target card exiled with ~. You may cast that card this turn without paying its mana cost. If that spell would be put into a graveyard, put it on the bottom of its owner's library
 * instead." (Lorehold group 2, issue 86, CR 607.2a, 601.2, 118.9, 614.1a): "that card" is the target of the first sentence and "that spell" the one cast with the permission of the second, so
 * the three sentences (or the first two, with no rider) are one instruction (`effect.cast-exiled-with-self`).
 */
const CHOOSE_EXILED_WITH = /(?:^|: )choose target card exiled with ~\.$/i;
const MAY_CAST_THAT_FREE = /^you may cast that card this turn without paying its mana cost\.$/i;
const BOTTOM_RIDER =
  /^if that spell would be put into a graveyard, put it on the bottom of its owner['’]s library instead\.$/i;

/**
 * "That player exiles cards from the top of their library until they exile an instant or sorcery card. You may cast that card without paying its mana cost. Then that player puts the exiled
 * cards that weren't cast this way on the bottom of their library in a random order." (Grima, Saruman's Footman, CR 701.13, 608.2g, 401.4): the cast and the bottom are of the cards the
 * first sentence exiles, so the three are one instruction (`effect.that-player-exiles-until-cast`; the first may follow the comma of a trigger).
 */
const THAT_PLAYER_EXILES_UNTIL =
  /(?:^|, )that player exiles cards from the top of their library until they exile an? [^.,]*\.$/i;
const THEN_THAT_PLAYER_BOTTOM_RANDOM =
  /^then that player puts the exiled cards that weren['’]t cast this way on the bottom of their library in a random order\.$/i;

/**
 * "Each instant and sorcery card in your graveyard gains flashback until end of turn. The flashback cost is equal to its mana cost." (CR 702.34a, 118.9): the second sentence says what the
 * flashback the first gives costs, so the two are one instruction (`effect.gain-flashback-from-mana-cost`).
 */
const GAINS_FLASHBACK =
  /^each [^.,]* cards? in your graveyard gains flashback until end of turn\.$/i;
const FLASHBACK_COST_IS_MANA_COST = /^the flashback cost is equal to its mana cost\.$/i;

/**
 * "Reveal the top five cards of your library. An opponent separates those cards into two piles. Put one pile into your hand and the other into your graveyard." (D-303, CR 700.3):
 * three sentences that are one instruction (what is revealed, who separates it and where each pile goes), kept together so `effect.reveal-separate-piles` reads them as one. Only all
 * three in a row.
 */
const REVEAL_THE_TOP = /^reveal the top [^.]* cards of your library\.$/i;
const SEPARATES_INTO_PILES = /^an opponent separates those cards into two piles\.$/i;
/**
 * "Reveal the top X cards of your library. Put all land cards from among them onto the battlefield tapped and the rest on the bottom of your library in a random order." (Quandrix
 * Unlimited deck, group D2, Animist's Awakening, CR 701.20): the second sentence says what is done with the cards the first one reveals, so the two are one instruction
 * (`effect.reveal-put-all`).
 */
const PUT_ALL_FROM_AMONG =
  /^put all [^.]* cards from among them onto the battlefield tapped and the rest on the bottom of your library in a random order\.$/i;
/**
 * "Reveal the top four cards of your library. Put all land cards revealed this way into your hand and the rest into your graveyard." (Death Toll deck, group C, Mulch, CR 701.20a): the
 * second sentence says what is done with the cards the first one reveals, so the two are one instruction (`effect.reveal-put-all-hand`).
 */
const PUT_ALL_REVEALED_HAND =
  /^put all [^.]* cards revealed this way into your hand and the rest into your graveyard\.$/i;
/**
 * "Look at the top three cards of your library. Put one of them into your hand and the rest into your graveyard." (Professor Onyx, CR 401.2): one instruction in two sentences
 * (`effect.look-take-one-graveyard`).
 */
const PUT_HAND_REST_GRAVEYARD =
  /^put one of them into your hand and the rest into your graveyard\.$/i;
const PUT_ONE_PILE = /^put one pile into your hand and the other into your graveyard\.$/i;
/**
 * "Reveal the top X cards of your library. You may put any number of permanent cards with mana value X or less from among them onto the battlefield. Then put all cards revealed this
 * way that weren't put onto the battlefield into your graveyard." (Genesis Wave, CR 701.20a): three sentences that are one instruction, kept together for
 * `effect.reveal-any-permanents-x`. Only all three in a row.
 */
const MAY_PUT_ANY_PERMANENTS_X =
  /^you may put any number of permanent cards with mana value X or less from among them onto the battlefield\.$/i;
const THEN_PUT_REST_GRAVEYARD =
  /^then put all cards revealed this way that weren['’]t put onto the battlefield into your graveyard\.$/i;
/**
 * "Each opponent reveals the top card of their library. If any of those cards shares a card type with that spell, copy that spell, you may choose new targets for the copy, and each
 * opponent draws a card. Otherwise, you draw a card." (Gandalf, Westward Voyager, CR 701.20a, 608.2c): three sentences that are one instruction (the first may follow the comma of a
 * trigger), kept together for `effect.opponents-reveal-share-type`. Only all three in a row.
 */
const EACH_OPPONENT_REVEALS_TOP = /(?:^|, )each opponent reveals the top card of their library\.$/i;
const IF_ANY_SHARES_TYPE_COPY =
  /^if any of those cards shares a card type with that spell, copy that spell, you may choose new targets for the copy, and each opponent draws a card\.$/i;
const OTHERWISE_YOU_DRAW = /^otherwise, you draw a card\.$/i;
/**
 * "Reveal the top five cards of your library. You may put a creature or enchantment card from among them into your hand. Put the rest into your graveyard." (D-396, CR 701.20a):
 * the second sentence of the same instruction after `REVEAL_THE_TOP` (the cards are revealed, so "reveal" is not said again), kept together with the rest for `effect.reveal-take`.
 */
const PUT_FROM_AMONG_REVEALED =
  /^you may put [^.]* from among them (?:into your hand|onto the battlefield tapped)\.$/i;
/**
 * "When you cast this spell, reveal the top X cards of your library. You may put a nonland permanent card with mana value X or less from among them onto the battlefield. Then shuffle
 * the rest into your library." (Genesis Hydra, CR 701.20, 701.24): three sentences that are one instruction (what is revealed, the card that may be put onto the battlefield and
 * where the rest go), kept together for `effect.reveal-put-shuffle`. The first may follow the comma of a trigger.
 */
const REVEAL_TOP_LEAD = /(?:^|, )reveal the top [^.]* cards of your library\.$/i;
const THEN_SHUFFLE_THE_REST = /^then shuffle the rest into your library\.$/i;
/**
 * "Choose creature or land. Reveal the top four cards of your library. Put all cards of the chosen type revealed this way into your hand and the rest into your graveyard." (Winding Way,
 * CR 608.2d, 701.20a): three sentences that are one instruction, kept together for `effect.choose-reveal-put-all-hand`.
 */
const CHOOSE_CREATURE_OR_LAND = /^choose creature or land\.$/i;
const PUT_ALL_CHOSEN_TYPE_HAND =
  /^put all cards of the chosen type revealed this way into your hand and the rest into your graveyard\.$/i;
/**
 * "You and target opponent each reveal the top card of your library. You each lose life equal to the mana value of the card revealed by the other player. You each put the card you
 * revealed into your hand." (CR 701.20a, 119.3): three sentences that are one instruction, kept together for `effect.reveal-top-duel`.
 */
const EACH_REVEAL_TOP = /^you and [^.]* each reveal the top card of your library\.$/i;
const EACH_LOSE_LIFE_OTHER =
  /^you each lose life equal to the mana value of the card revealed by the other player\.$/i;
const EACH_PUT_REVEALED_INTO_HAND = /^you each put the card you revealed into your hand\.$/i;
/**
 * "Scry 3, then reveal the top card of your library. If it's a creature or land card, draw a card." and "Whenever you scry, you may reveal the top card of your library. If a land card
 * is revealed this way, put it onto the battlefield tapped." (Galadriel deck, group 1, CR 701.20): the second sentence says what the card revealed by the first one does, so the two
 * are read as one instruction (`effect.reveal-top-then`; the first may follow the comma of a trigger or of "scry N, then").
 */
const REVEAL_TOP_CARD = /(?:^|, )(?:then )?(?:you may )?reveal the top card of your library\.$/i;
const IF_REVEALED_CARD =
  /^if (?:it['’]s an? [^.,]* card|an? [^.,]* card is revealed this way), [^.]*\.$/i;
/**
 * "Reveal the top card of your library. If it's a creature card, create a 1/1 green Saproling creature token. If it's a land card, put that card onto the battlefield under your control.
 * If it's a noncreature, nonland card, you gain 2 life." (Witherbloom Witchcraft, issue 190, CR 701.20a, 608.2c): one reveal and several "if" sentences about the card it shows, kept
 * together for `effect.reveal-top-branches`. A list of types may hold a comma, which `IF_REVEALED_CARD` does not allow.
 */
const IF_REVEALED_BRANCH = /^if it['’]s an? [^.]*? card, [^.]*\.$/i;
/**
 * "Each player reveals the top card of their library, then draws a card. For each nonland card revealed this way, put a +1/+1 counter on ~." (Federation Fleet deck, Ambassador K'Ehleyr, CR
 * 701.20a, 608.2c): the second sentence counts the cards the first one revealed, so the two are one instruction, kept together for `effect.each-player-reveals-then-draws`.
 */
const EACH_PLAYER_REVEALS_THEN_DRAWS_SENTENCE =
  /(?:^|, )each player reveals the top card of their library, then draws a card\.$/i;
const FOR_EACH_REVEALED_THIS_WAY = /^for each [^.]*? card revealed this way, [^.]*\.$/i;
/** "Otherwise, put that card into your hand." (Coiling Oracle, issue 310, CR 608.2c): the third sentence of the instruction of `REVEAL_TOP_CARD`, the card that is not of the kind goes into the hand. */
const OTHERWISE_PUT_INTO_HAND = /^otherwise, put that card into your hand\.$/i;
/**
 * "Reveal the top card of your library. You may cast it without paying its mana cost if it's a spell with lesser mana value. If you don't cast it, put it into your hand."
 * (CR 701.20a, 608.2g): three sentences that are one instruction (what is revealed, what may be cast and what happens to the card when it is not), kept together so
 * `effect.reveal-top-cast` reads them as one. Only all three in a row (the first may follow the comma of a trigger).
 */
const MAY_CAST_IF_LESSER =
  /^you may cast it without paying its mana cost if it['’]s a spell with lesser mana value\.$/i;
const ELSE_CAST_INTO_HAND = /^if you don['’]t cast it, put it into your hand\.$/i;
/**
 * "Surveil 2, then you may reveal the top card of your library. Draw a card if it's an artifact card. If you don't draw a card this way, put two +1/+1 counters on ~." (Federation Fleet deck,
 * group D, B'Elanna Torres, Scrapper; CR 701.20a, 608.2c): three sentences that are one instruction (what is revealed, what is drawn when the card is of a kind, and what happens when nothing
 * was drawn), kept together for `effect.reveal-top-draw-else-counters`. Only all three in a row (the first may follow the comma of "Surveil 2, then").
 */
const DRAW_IF_REVEALED = /^draw a card if it['’]s an? [^.,]* card\.$/i;
const ELSE_PUT_COUNTERS = /^if you don['’]t draw a card this way, put [^.]* counters? on ~\.$/i;
/**
 * "Exile the top eight cards of your library. You may put a land card from among them onto the battlefield. Until end of turn, for each nonland card type, you may cast a spell of
 * that type from among the exiled cards without paying its mana cost." (CR 701.13, 608.2d, 611.2a): three sentences that are one instruction ("them" and "the exiled cards" are the
 * cards the first one exiles), kept together so `effect.exile-top-put-cast-each-type` reads them as one. Only all three in a row.
 */
const EXILE_TOP_CARDS = /^exile the top [^.]* cards of your library\.$/i;
const MAY_PUT_FROM_AMONG_ONTO = /^you may put [^.]* from among them onto the battlefield\.$/i;
const UNTIL_EOT_EACH_TYPE =
  /^until end of turn, for each nonland card type, you may cast a spell of that type from among the exiled cards without paying its mana cost\.$/i;
/**
 * "Look at the top card of your library. If it's a land card or a creature card with mana value less than or equal to the number of loyalty counters on ~, you may put that card onto
 * the battlefield." (Galadriel deck, group 1, CR 401.2): the second sentence of the instruction of `LOOK_AT_TOP_CARD` that puts the card onto the battlefield (`effect.look-top-put`).
 */
const LOOK_AT_TOP_CARD_COST = /(?:^[+\-−]?\d+: |^|, )look at the top card of your library\.$/i;
const IF_ITS_LAND_OR_MAY_PUT =
  /^if it['’]s a land card or an? [^.,]* card with mana value less than or equal to [^.,]*, you may put that card onto the battlefield\.$/i;
/** "They become 5/5 Elemental creatures with flying and haste until end of turn. They're still lands." (Galadriel deck, group 1, CR 205.1b): the second sentence keeps the old types. */
const THEY_BECOME = /^they become [^.]*\.$/i;
const THEY_ARE_STILL = /^they['’]re still [^.]*\.$/i;
/** "Until end of turn, ~ becomes a 2/3 white and blue Bird creature with flying. It's still a land." (issue 81, Restless Anchorage, CR 205.1b): the second sentence keeps the land type. */
const BECOMES_LAND_CREATURE =
  /(?:^|: )until end of turn, ~ becomes an? (?:\d+|X)\/(?:\d+|X) [^.]*\.$/i;
const ITS_STILL_A_LAND = /^it['’]s still a land\.$/i;
/** "... It's still a land. It can't be blocked this turn." (Creeping Tar Pit, CR 509.1b): a third sentence, the restriction of the same land creature for the turn. */
const IT_CANT_BE_BLOCKED_THIS_TURN = /^it can['’]t be blocked this turn\.$/i;
/** "It becomes an 8/8 Elemental creature with trample and haste until end of turn. It's still a land." (Silvanus's Invoker, issue 345): the land the sentence before named keeps its types. */
const IT_BECOMES_LAND_CREATURE = /^it becomes an? \d+\/\d+ [^.]*\.$/i;
/** "{2}{G}{W}: ~ becomes a 3/3 green and white Llama creature until end of turn. It's still a land." (issue 145, Restless Prairie, CR 205.1b): the same, with the duration at the end. */
const BECOMES_LAND_CREATURE_TRAILING = /(?:^|: )~ becomes a \d+\/\d+ [^.]* until end of turn\.$/i;
/**
 * "Whenever another nontoken creature you control dies, you may return it to the battlefield face down under its owner's control. It's a Forest land." (Witherbloom Witchcraft, group C,
 * CR 708.2, 613.2b): the second sentence says what the face-down permanent is, so the two are read as one instruction (`effect.return-it-face-down-forest-land`).
 */
const RETURN_IT_FACE_DOWN =
  /(?:^|, )(?:you may )?return it to the battlefield face down under its owner['’]s control\.$/i;
const ITS_A_FOREST_LAND = /^it['’]s a Forest land\.$/i;
/**
 * "Draw a card and reveal it. Remove a number of loyalty counters equal to that card's mana value from ~." (Galadriel deck, group 3, CR 701.20a, 400.7j): the second sentence
 * reads the card the first one drew and revealed, so the two are read as one instruction (`effect.draw-reveal-remove`; the first may follow a loyalty cost).
 */
const DRAW_AND_REVEAL = /(?:^[+\-−]?\d+: |^|, )draw a card and reveal it\.$/i;
const REMOVE_COUNTERS_MANA_VALUE =
  /^remove a number of [^.]* counters equal to that card['’]s mana value from [^.]*\.$/i;
/** "Count the number of cards in your library. Your life total becomes that number." (issue 145, Invincible Hymn, CR 119.5): the second sentence reads the count of the first. */
const COUNT_LIBRARY = /^count the number of cards in your library\.$/i;
const LIFE_TOTAL_BECOMES_THAT_NUMBER = /^your life total becomes that number\.$/i;
const CREATE_TOKENS = /^create [^.]* tokens(?: [^.]*)?\.$/i;
/**
 * "Create Ragavan, a legendary 2/1 red Monkey creature token. Ragavan enters tapped and attacking." (Kari Zev, CR 508.4, 110.5b): the second sentence is the state the one named token
 * enters in, read as one instruction (`effect.create-token`).
 */
const LOOK_AT_DEFENDERS_HAND = /(?:^|, )look at defending player['’]s hand\.$/i;
const PUT_CREATURE_FROM_IT_ATTACKING =
  /^you may put a creature card from it onto the battlefield under your control tapped and attacking that player or a planeswalker they control\.$/i;
const CREATE_NAMED_TOKEN = /(?:^|, )create [^.]*, a legendary [^.]* creature token(?: [^.]*)?\.$/i;
const NAMED_TOKEN_ENTERS_TAPPED_ATTACKING = /^[^.]+ enters tapped and attacking\.$/i;
const TOKENS_HAVE_QUOTED_ABILITY = /^they have ["“].*["”]\.?$/i;
/**
 * "At the beginning of the next end step, if any of those cards remain exiled, put them into your graveyard, then create a 0/1 colorless Eldrazi Spawn creature token for each card put
 * into your graveyard this way. Those tokens have \"Sacrifice this token: Add {C}.\"" (issue 144, Glimpse the Impossible, CR 603.7, 111.4): the second sentence says what the tokens the
 * delayed ability makes have, so the two are read as one (`effect.create-token`).
 */
const DELAYED_TOKENS_FOR_EACH_GRAVEYARD =
  /^at the beginning of the next end step, [^.]*create [^.]* tokens? for each card put into your graveyard this way\.$/i;
const THOSE_TOKENS_HAVE_QUOTED_ABILITY = /^those tokens have ["“].*["”]\.?$/i;
/**
 * "Create a white Aura enchantment token named Contract attached to target creature an opponent controls. The token has enchant creature and \"...\"" (issue 89, CR 303.4f, 702.5a): an
 * Aura token is created attached to a target and the sentence after it says what it enchants and has, so the two are read as one (`effect.create-token`).
 */
const CREATE_AURA_TOKEN = /^create [^.]* Aura enchantment token [^.]*\.$/i;
const TOKEN_HAS_ENCHANT = /^the token has enchant creature(?:\.| and ["“].*["”]\.?)$/i;

/**
 * "Look at the top four cards of your library. You may put a land card from among them onto the battlefield tapped. If you don't, put a card from among them into your hand. Put
 * the rest on the bottom of your library in a random order." (Planar Genesis, CR 608.2c): four sentences that are one instruction (the second and third depend on each other and
 * on the cards the first one looks at), kept together for `effect.look-take-else-hand`. Only all four in a row.
 */
const MAY_PUT_AMONG_TAPPED = /^you may put [^.]* from among them onto the battlefield tapped\.$/i;
const IF_NOT_PUT_AMONG_HAND = /^if you don['’]t, put a card from among them into your hand\.$/i;
const PLAYER_REVEALS_UNTIL =
  /^target opponent reveals cards from the top of their library until they reveal [^.]*\.$/i;
const YOU_PUT_AND_LOSE_LIFE =
  /^you put that card onto the battlefield under your control and lose life equal to that permanent['’]s mana value\.$/i;
/**
 * "Target opponent exiles cards from the top of their library until they exile an instant, sorcery, or creature card. You may cast that card without paying its mana cost. If you cast a
 * creature spell this way, it gains haste and "At the beginning of the end step, sacrifice this creature."" (Strago and Relm, issue 97, CR 701.13, 608.2g): "that card" is the card the
 * first sentence exiles and "this way" the cast of the second, so the two or three sentences are one instruction (`effect.player-exiles-until-cast`).
 */
const PLAYER_EXILES_UNTIL_CAST =
  /^target (?:opponent|player) exiles cards from the top of their library until they exile [^.]*\.$/i;
const MAY_CAST_THAT_CARD_FREE = /^you may cast that card without paying its mana cost\.$/i;
const CREATURE_THIS_WAY_GAINS = /^if you cast a creature spell this way, it gains haste and ".*"$/i;
const THAT_PLAYER_PUTS_REST_RANDOM =
  /^that player puts the rest of the revealed cards on the bottom of their library in a random order\.$/i;
const CONTROLLER_REVEALS_UNTIL =
  /^that creature['’]s controller reveals cards from the top of their library until they reveal [^.]*\.$/i;
const THE_PLAYER_PUTS_ANY_ORDER =
  /^the player puts that card onto the battlefield and the rest on the bottom of their library in any order\.$/i;
/**
 * "Target opponent whose turn it is may cast a spell from their hand without paying its mana cost. If they do, you copy that spell. You may choose new targets for the copy. If they don't,
 * you draw a card." (Federation Fleet deck, group F, Cmdr. Troi; CR 608.2g, 608.2c, 707.10): four sentences that are one instruction, kept together for
 * `effect.opponent-casts-free-you-copy`. Only all four in a row.
 */
const TROI_CAST =
  /^target opponent whose turn it is may cast a spell from their hand without paying its mana cost\.$/i;
// "You may choose new targets for the copy." stays with the sentence before it (`splitSentences`).
const TROI_COPY = /^if they do, you copy that spell\. you may choose new targets for the copy\.$/i;
const TROI_ELSE_DRAW = /^if they don['’]t, you draw a card\.$/i;

function joinLookAtTop(text: string, spans: Span[]): Span[] {
  const out: Span[] = [];
  for (let i = 0; i < spans.length; i++) {
    const [a, b, c, d] = [spans[i], spans[i + 1], spans[i + 2], spans[i + 3]];
    const said = (span: Span | undefined, re: RegExp) =>
      span !== undefined && re.test(text.slice(span.start, span.end));
    // Genesis Wave: the reveal, the take of any number of permanents and the rest into the graveyard (`effect.reveal-any-permanents-x`).
    if (
      a !== undefined &&
      c !== undefined &&
      said(a, REVEAL_THE_TOP) &&
      said(b, MAY_PUT_ANY_PERMANENTS_X) &&
      said(c, THEN_PUT_REST_GRAVEYARD)
    ) {
      out.push({ start: a.start, end: c.end });
      i += 2;
      continue;
    }
    // Gandalf, Westward Voyager: the reveal of each opponent, the copy or the draw it decides and the otherwise (`effect.opponents-reveal-share-type`).
    if (
      a !== undefined &&
      c !== undefined &&
      said(a, EACH_OPPONENT_REVEALS_TOP) &&
      said(b, IF_ANY_SHARES_TYPE_COPY) &&
      said(c, OTHERWISE_YOU_DRAW)
    ) {
      out.push({ start: a.start, end: c.end });
      i += 2;
      continue;
    }
    // Issue 81 (Jhoira, Weatherlight Corsair): "Target opponent reveals cards from the top of their library until they reveal a historic permanent card. You put that card onto the battlefield
    // under your control and lose life equal to that permanent's mana value. That player puts the rest of the revealed cards on the bottom of their library in a random order.": one
    // instruction (`effect.player-reveals-until-you-put`).
    if (
      a !== undefined &&
      c !== undefined &&
      said(a, PLAYER_REVEALS_UNTIL) &&
      said(b, YOU_PUT_AND_LOSE_LIFE) &&
      said(c, THAT_PLAYER_PUTS_REST_RANDOM)
    ) {
      out.push({ start: a.start, end: c.end });
      i += 2;
      continue;
    }
    // Strago and Relm (issue 97): the exile until a card is found, the free cast of it and, when there is one, what a creature spell gains.
    if (
      a !== undefined &&
      b !== undefined &&
      said(a, PLAYER_EXILES_UNTIL_CAST) &&
      said(b, MAY_CAST_THAT_CARD_FREE)
    ) {
      const last = c !== undefined && said(c, CREATURE_THIS_WAY_GAINS) ? c : b;
      out.push({ start: a.start, end: last.end });
      i += last === b ? 1 : 2;
      continue;
    }
    // Issue 81 (Proteus Staff): "That creature's controller reveals cards from the top of their library until they reveal a creature card. The player puts that card onto the battlefield and
    // the rest on the bottom of their library in any order." (`effect.controller-reveals-until-puts`).
    if (
      a !== undefined &&
      b !== undefined &&
      said(a, CONTROLLER_REVEALS_UNTIL) &&
      said(b, THE_PLAYER_PUTS_ANY_ORDER)
    ) {
      out.push({ start: a.start, end: b.end });
      i += 1;
      continue;
    }
    // Cmdr. Troi, Outgoing Empath (Federation Fleet deck, group F): the four sentences of one instruction (three spans: the copy and its new targets are one).
    if (
      a !== undefined &&
      c !== undefined &&
      said(a, TROI_CAST) &&
      said(b, TROI_COPY) &&
      said(c, TROI_ELSE_DRAW)
    ) {
      out.push({ start: a.start, end: c.end });
      i += 2;
      continue;
    }
    // Counter Blitz deck, group E (Scholar of New Horizons): the four sentences of a search that may put its card onto the battlefield (`effect.search-reveal-may-put-else-hand`).
    if (
      a !== undefined &&
      d !== undefined &&
      said(a, COUNTER_BLITZ_E_SEARCH_JOIN[0]) &&
      said(b, COUNTER_BLITZ_E_SEARCH_JOIN[1]) &&
      said(c, COUNTER_BLITZ_E_SEARCH_JOIN[2]) &&
      said(d, COUNTER_BLITZ_E_SEARCH_JOIN[3])
    ) {
      out.push({ start: a.start, end: d.end });
      i += 3;
    } else if (
      a !== undefined &&
      d !== undefined &&
      said(a, FINALE_CAST) &&
      said(b, FINALE_EXILE_INSTEAD) &&
      said(c, FINALE_COPY_TWICE) &&
      said(d, FINALE_NEW_TARGETS)
    ) {
      out.push({ start: a.start, end: d.end });
      i += 3;
    } else if (
      a !== undefined &&
      d !== undefined &&
      said(a, LOOK_AT_TOP) &&
      said(b, MAY_PUT_AMONG_TAPPED) &&
      said(c, IF_NOT_PUT_AMONG_HAND) &&
      said(d, PUT_THE_REST)
    ) {
      out.push({ start: a.start, end: d.end });
      i += 3;
    } else if (
      a !== undefined &&
      d !== undefined &&
      said(a, REVEAL_UNTIL) &&
      said(b, MAY_PUT_THAT_CARD_ONTO) &&
      said(c, IF_YOU_DONT_HAND) &&
      said(d, PUT_THE_REST)
    ) {
      out.push({ start: a.start, end: d.end });
      i += 3;
    } else if (
      a !== undefined &&
      d !== undefined &&
      said(a, LOOK_AT_TOP) &&
      said(b, PUT_FROM_AMONG_ONTO) &&
      said(c, IF_EQUIPMENT_ATTACH) &&
      said(d, PUT_REST_OF_THOSE)
    ) {
      out.push({ start: a.start, end: d.end });
      i += 3;
    } else if (
      a !== undefined &&
      d !== undefined &&
      said(a, EXILE_TWO_PILES_FIRST) &&
      said(b, OPPONENT_CHOOSES_ONE_PILE) &&
      said(c, PUT_THAT_PILE_GRAVEYARD) &&
      said(d, LOOK_AT_OTHER_PILE)
    ) {
      out.push({ start: a.start, end: d.end });
      i += 3;
    } else if (
      a !== undefined &&
      d !== undefined &&
      said(a, REVEAL_TOP_CARD) &&
      said(b, IF_REVEALED_BRANCH) &&
      said(c, IF_REVEALED_BRANCH) &&
      said(d, IF_REVEALED_BRANCH)
    ) {
      out.push({ start: a.start, end: d.end });
      i += 3;
    } else if (
      a !== undefined &&
      c !== undefined &&
      said(a, REVEAL_TOP_CARD) &&
      said(b, IF_REVEALED_BRANCH) &&
      said(c, IF_REVEALED_BRANCH)
    ) {
      out.push({ start: a.start, end: c.end });
      i += 2;
    } else if (
      a !== undefined &&
      b !== undefined &&
      said(a, REVEAL_TOP_CARD) &&
      said(b, IF_REVEALED_BRANCH) &&
      !said(b, IF_REVEALED_CARD)
    ) {
      out.push({ start: a.start, end: b.end });
      i += 1;
    } else if (
      a !== undefined &&
      c !== undefined &&
      said(a, REVEAL_TOP_CARD) &&
      said(b, IF_REVEALED_CARD) &&
      said(c, OTHERWISE_PUT_INTO_HAND)
    ) {
      out.push({ start: a.start, end: c.end });
      i += 2;
    } else if (
      a !== undefined &&
      c !== undefined &&
      said(a, REVEAL_TOP_LEAD) &&
      said(b, MAY_PUT_FROM_AMONG_ONTO) &&
      said(c, THEN_SHUFFLE_THE_REST)
    ) {
      out.push({ start: a.start, end: c.end });
      i += 2;
    } else if (
      a !== undefined &&
      c !== undefined &&
      said(a, CHOOSE_CREATURE_OR_LAND) &&
      said(b, REVEAL_THE_TOP) &&
      said(c, PUT_ALL_CHOSEN_TYPE_HAND)
    ) {
      out.push({ start: a.start, end: c.end });
      i += 2;
    } else if (
      a !== undefined &&
      c !== undefined &&
      said(a, EACH_REVEAL_TOP) &&
      said(b, EACH_LOSE_LIFE_OTHER) &&
      said(c, EACH_PUT_REVEALED_INTO_HAND)
    ) {
      out.push({ start: a.start, end: c.end });
      i += 2;
    } else if (
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
      said(a, THAT_PLAYER_EXILES_UNTIL) &&
      said(b, MAY_CAST_THAT_CARD_FREE) &&
      said(c, THEN_THAT_PLAYER_BOTTOM_RANDOM)
    ) {
      out.push({ start: a.start, end: c.end });
      i += 2;
    } else if (
      a !== undefined &&
      c !== undefined &&
      said(a, CHOOSE_EXILED_WITH) &&
      said(b, MAY_CAST_THAT_FREE) &&
      said(c, BOTTOM_RIDER)
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
      c !== undefined &&
      said(a, LOOK_AT_TOP_CARD_COST) &&
      said(b, IF_ITS_CARD_MAY_PUT_TAPPED) &&
      said(c, IF_NOT_ONTO_BATTLEFIELD_HAND)
    ) {
      out.push({ start: a.start, end: c.end });
      i += 2;
    } else if (
      a !== undefined &&
      c !== undefined &&
      said(a, LOOK_AT_TOP_CARD) &&
      said(b, IF_ITS_CARD_MAY_TAKE) &&
      said(c, ELSE_BOTTOM_OF_LIBRARY)
    ) {
      out.push({ start: a.start, end: c.end });
      i += 2;
    } else if (
      a !== undefined &&
      c !== undefined &&
      said(a, EXILE_TOP_CARDS) &&
      said(b, MAY_PUT_FROM_AMONG_ONTO) &&
      said(c, UNTIL_EOT_EACH_TYPE)
    ) {
      out.push({ start: a.start, end: c.end });
      i += 2;
    } else if (
      a !== undefined &&
      c !== undefined &&
      said(a, REVEAL_TOP_CARD) &&
      said(b, DRAW_IF_REVEALED) &&
      said(c, ELSE_PUT_COUNTERS)
    ) {
      out.push({ start: a.start, end: c.end });
      i += 2;
    } else if (
      a !== undefined &&
      c !== undefined &&
      said(a, REVEAL_TOP_CARD) &&
      said(b, MAY_CAST_IF_LESSER) &&
      said(c, ELSE_CAST_INTO_HAND)
    ) {
      out.push({ start: a.start, end: c.end });
      i += 2;
    } else if (
      a !== undefined &&
      c !== undefined &&
      said(a, EXILE_CARD_THEN_COPY) &&
      said(b, IF_YOU_DO_COPY_IT) &&
      said(c, MAY_CAST_THE_COPY_PAYING)
    ) {
      out.push({ start: a.start, end: c.end });
      i += 2;
    } else if (
      a !== undefined &&
      c !== undefined &&
      said(a, BECOMES_LAND_CREATURE) &&
      said(b, ITS_STILL_A_LAND) &&
      said(c, IT_CANT_BE_BLOCKED_THIS_TURN)
    ) {
      out.push({ start: a.start, end: c.end });
      i += 2;
    } else if (
      a !== undefined &&
      c !== undefined &&
      said(a, CHOOSE_OPPONENT_AT_RANDOM) &&
      said(b, ATTACKS_THAT_PLAYER_THIS_COMBAT) &&
      said(c, CANT_CHOOSE_TAP_IT)
    ) {
      out.push({ start: a.start, end: c.end });
      i += 2;
    } else if (
      a !== undefined &&
      b !== undefined &&
      ((said(a, REVEAL_THE_TOP) && said(b, PUT_ONE_AMONG_REST_GRAVEYARD)) ||
        (said(a, LOOK_TOP_X_WHERE) && said(b, IF_YOU_DO_ONE_ON_TOP_REST_BOTTOM)) ||
        (said(a, SHUFFLE_THEN_REVEAL) && said(b, IF_ITS_CARD_PUT_ONTO)) ||
        (said(a, CREATE_TOKENS) && said(b, TOKENS_HAVE_QUOTED_ABILITY)) ||
        (said(a, CREATE_NAMED_TOKEN) && said(b, NAMED_TOKEN_ENTERS_TAPPED_ATTACKING)) ||
        (said(a, LOOK_AT_DEFENDERS_HAND) && said(b, PUT_CREATURE_FROM_IT_ATTACKING)) ||
        (said(a, DELAYED_TOKENS_FOR_EACH_GRAVEYARD) && said(b, THOSE_TOKENS_HAVE_QUOTED_ABILITY)) ||
        (said(a, CREATE_AURA_TOKEN) && said(b, TOKEN_HAS_ENCHANT)) ||
        (said(a, LOOK_AT_TOP_CARD) && said(b, IF_ITS_CARD_MAY_TAKE)) ||
        (said(a, LOOK_AT_TOP_CARD) && said(b, YOU_MAY_EXILE_IT_FACE_DOWN)) ||
        (said(a, UNTIL_EOT_PLAY_CARDS_EXILED_WITH) && said(b, SPELLS_CAST_THIS_WAY_COST_LESS)) ||
        (said(a, LOOK_AT_TOP_CARD_COST) && said(b, IF_ITS_LAND_OR_MAY_PUT)) ||
        // Explorer's Scope (CR 608.2c): a look at the top card and a land card that may be put onto the battlefield tapped (`effect.look-top-land-may-battlefield`).
        (said(a, LOOK_AT_TOP_CARD_COST) && said(b, IF_ITS_CARD_MAY_PUT_TAPPED)) ||
        (said(a, REVEAL_TOP_CARD) && said(b, IF_REVEALED_CARD)) ||
        (said(a, THEY_BECOME) && said(b, THEY_ARE_STILL)) ||
        (said(a, BECOMES_LAND_CREATURE) && said(b, ITS_STILL_A_LAND)) ||
        (said(a, IT_BECOMES_LAND_CREATURE) && said(b, ITS_STILL_A_LAND)) ||
        (said(a, RETURN_IT_FACE_DOWN) && said(b, ITS_A_FOREST_LAND)) ||
        (said(a, BECOMES_LAND_CREATURE_TRAILING) && said(b, ITS_STILL_A_LAND)) ||
        (said(a, COUNT_LIBRARY) && said(b, LIFE_TOTAL_BECOMES_THAT_NUMBER)) ||
        (said(a, DRAW_AND_REVEAL) && said(b, REMOVE_COUNTERS_MANA_VALUE)) ||
        (said(a, EACH_PLAYER_EXILES) && said(b, WHEN_NONLAND_EXILED)) ||
        (said(a, EACH_PLAYER_REVEALS_TOP) && said(b, FOR_EACH_NONLAND_REVEALED_TOKEN)) ||
        (said(a, FOR_EACH_PLAYER_CHOOSE) && said(b, THEN_SACRIFICE_OTHERS)) ||
        (said(a, EACH_PLAYER_VOW_KEEP) && said(b, THOSE_CREATURES_CANT_ATTACK_YOU)) ||
        (said(a, OPPONENT_CHOOSES_EXILED) && said(b, PUT_THAT_CARD_BOTTOM_RETURN_OTHER)) ||
        (said(a, FOR_EACH_OPPONENT_CHOOSE) && said(b, DESTROY_THE_CHOSEN_PERMANENTS)) ||
        // Counter Blitz deck, group C (Summon: Valefor): each opponent's choice and the move of the permanents chosen.
        COUNTER_BLITZ_C_JOINS.some(([first, second]) => said(a, first) && said(b, second)) ||
        (said(a, EXILE_TOP_CARD_SENTENCE) && said(b, PLAY_UNTIL_EXILE_ANOTHER)) ||
        (said(a, EXILE_AT_RANDOM) && said(b, PLAY_THE_EXILED_CARD)) ||
        (said(a, CHOOSE_EXILED_WITH) && said(b, MAY_CAST_THAT_FREE)) ||
        (said(a, LOOK_AT_TOP) &&
          (said(b, PUT_HAND_REST_BOTTOM) ||
            said(b, PUT_HAND_REST_TOP) ||
            said(b, PUT_HAND_OTHER_BOTTOM) ||
            said(b, PUT_HAND_REST_GRAVEYARD))) ||
        (said(a, CHOOSE_GRAVEYARD_PAIR) && said(b, MAY_RETURN_THOSE_CARDS)) ||
        (said(a, CAST_TARGET_FROM_GRAVEYARD) && said(b, EXILE_THAT_SPELL_INSTEAD)) ||
        (said(a, CAST_PER_OPPONENT_FREE) && said(b, EXILE_A_SPELL_CAST_THIS_WAY_INSTEAD)) ||
        (said(a, MAY_CAST_FROM_YOUR_GRAVEYARD) && said(b, EXILE_THAT_SPELL_INSTEAD_YOUR)) ||
        (said(a, CAST_FROM_YOUR_GRAVEYARD_FREE) && said(b, EXILE_THAT_SPELL_INSTEAD_YOUR)) ||
        (said(a, CAST_FROM_YOUR_GRAVEYARD_PAID) && said(b, EXILE_THAT_SPELL_INSTEAD_YOUR)) ||
        (said(a, CAST_SPELL_FROM_YOUR_GRAVEYARD_FREE) && said(b, EXILE_THAT_SPELL_INSTEAD_YOUR)) ||
        (said(a, ADD_MANA_SENTENCE) && said(b, MANA_STAYS_SENTENCE)) ||
        (said(a, CHOOSE_ODD_OR_EVEN) && said(b, RETURN_CHOSEN_PARITY)) ||
        (said(a, CHOOSE_ANY_OPPONENT_AT_RANDOM) && said(b, ATTACKS_THAT_PLAYER_THIS_COMBAT)) ||
        (said(a, EACH_PLAYER_ROLLS_D) && said(b, IF_OPPONENTS_HIGHEST_CANT_ATTACK)) ||
        (said(a, PLAYER_MANA_ABILITY_SENTENCE) && said(b, IF_YOU_DO_ADD_SENTENCE)) ||
        (said(a, PREVENT_ALL_SENTENCE) && said(b, FOR_EACH_PREVENTED_SENTENCE)) ||
        (said(a, EXILE_AND_COPY_IT) && said(b, MAY_CAST_THE_COPY)) ||
        (said(a, ITS_CONTROLLER_MAY_PAY) && said(b, IF_THEY_DO_THEY_DRAW)) ||
        (said(a, EACH_OPPONENT_MAY_CREATE) && said(b, FOR_EACH_OPPONENT_WHO_DOES_CREATE)) ||
        (said(a, EXILE_CARD_SENTENCE) && said(b, FOR_EACH_EXILED_COPY_IT)) ||
        (said(a, COPY_EACH_EXILED_WITH) && said(b, MAY_CAST_ANY_COPIES)) ||
        (said(a, PAY_REFLEXIVE_AND_COPY_THEM) && said(b, MAY_CAST_ANY_COPIES)) ||
        (said(a, REVEAL_THE_TOP) && said(b, PUT_ALL_FROM_AMONG)) ||
        (said(a, REVEAL_THE_TOP) && said(b, PUT_ALL_REVEALED_HAND)) ||
        (said(a, CHOOSE_PER_PLAYER_GRAVEYARD) && said(b, PUT_THOSE_CARDS_ONTO)) ||
        (said(a, CHOOSE_TARGET_CREATURE) && said(b, WHEN_THAT_CREATURE_DIES_RETURN)) ||
        (said(a, OPPONENTS_CHOOSE_GRAVEYARD_CARD) && said(b, RETURN_EACH_CARD_CHOSEN)) ||
        (said(a, CHOOSE_EXILED_VOID_CARD) && said(b, MAY_PLAY_IT_FREE)) ||
        (said(a, COUNTER_TARGET_SPELL) && said(b, EXILE_COUNTERED_THEN_CAST)) ||
        (said(a, SHUFFLE_THEN_REVEAL_UNTIL) && said(b, EXILE_THAT_CARD_REST_BOTTOM)) ||
        (said(a, WHENEVER_COPY_EXILED_CARD) && said(b, MAY_CAST_THE_COPY)) ||
        (said(a, MAY_CAST_IN_A_GRAVEYARD) && said(b, WHEN_CAST_IT_GAINS_ABILITIES)) ||
        (said(a, GAINS_ABILITIES_OF_TARGET) && said(b, SPEND_BLUE_AS_ANY_COLOR)) ||
        (said(a, GAINS_FLASHBACK) && said(b, FLASHBACK_COST_IS_MANA_COST)))
    ) {
      out.push({ start: a.start, end: b.end });
      i += 1;
    } else if (
      a !== undefined &&
      c !== undefined &&
      ((said(a, LOOK_AT_TOP) &&
        (said(b, TAKE_FROM_AMONG) ||
          said(b, TAKE_ANY_OF_CHOSEN_TYPE) ||
          said(b, PUT_ANY_TOTAL) ||
          said(b, PUT_FROM_AMONG_ONTO) ||
          said(b, CAST_FROM_AMONG_FREE))) ||
        (said(a, REVEAL_THE_TOP) && said(b, PUT_FROM_AMONG_REVEALED))) &&
      said(c, PUT_THE_REST)
    ) {
      out.push({ start: a.start, end: c.end });
      i += 2;
    } else if (
      a !== undefined &&
      c !== undefined &&
      said(a, EXILE_CARD_FROM_A_GRAVEYARD) &&
      said(b, COPY_THAT_CARD_TIMES) &&
      said(c, MAY_CAST_THE_COPIES)
    ) {
      out.push({ start: a.start, end: c.end });
      i += 2;
    } else if (
      a !== undefined &&
      b !== undefined &&
      said(a, EACH_PLAYER_CHOOSES_FEWEST_LANDS) &&
      said(b, DISCARD_AND_SACRIFICE_SAME_WAY)
    ) {
      out.push({ start: a.start, end: b.end });
      i += 1;
    } else if (
      a !== undefined &&
      b !== undefined &&
      said(a, LOOK_EXILE_ONE_FACE_DOWN) &&
      said(b, MAY_CAST_THAT_CARD_ANY_TYPE)
    ) {
      out.push({ start: a.start, end: b.end });
      i += 1;
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
    } else if (
      a !== undefined &&
      b !== undefined &&
      said(a, REVEAL_UNTIL_CHOSEN_TYPE_FIRST) &&
      said(b, PUT_THOSE_CARDS_SHUFFLE_REST)
    ) {
      out.push({ start: a.start, end: b.end });
      i += 1;
    } else if (
      a !== undefined &&
      b !== undefined &&
      said(a, EXILE_THEN_REVEAL_THAT_MANY) &&
      said(b, PUT_ALL_REVEALED_SHUFFLE_REST)
    ) {
      out.push({ start: a.start, end: b.end });
      i += 1;
    } else if (
      a !== undefined &&
      b !== undefined &&
      said(a, THEY_MAY_PAY) &&
      said(b, IF_THEY_DONT_CANT_ATTACK)
    ) {
      out.push({ start: a.start, end: b.end });
      i += 1;
    } else if (
      a !== undefined &&
      b !== undefined &&
      said(a, THAT_OPPONENT_MAY_PAY_HAND) &&
      said(b, IF_THEY_DONT_CANT_ATTACK_YOU_COMBAT)
    ) {
      out.push({ start: a.start, end: b.end });
      i += 1;
    } else if (
      a !== undefined &&
      b !== undefined &&
      said(a, REVEAL_UNTIL_OPPONENTS_FIRST) &&
      said(b, PUT_THOSE_CREATURES_SHUFFLE)
    ) {
      out.push({ start: a.start, end: b.end });
      i += 1;
    } else if (
      a !== undefined &&
      b !== undefined &&
      said(a, FOR_EACH_PERMANENT_DIFFERENT_OPPONENT) &&
      said(b, EACH_OPPONENT_GAINS_CONTROL)
    ) {
      out.push({ start: a.start, end: b.end });
      i += 1;
    } else if (
      a !== undefined &&
      b !== undefined &&
      said(a, EACH_PLAYER_REVEALS_THEN_DRAWS_SENTENCE) &&
      said(b, FOR_EACH_REVEALED_THIS_WAY)
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
      // The same after a quoted enchant ability (issue 89, Animate Dead, CR 702.5a): `... gains "enchant creature put onto the battlefield with ~." Return ...`.
      if (
        closes &&
        /\.['’]?$/u.test(text.slice(from, i)) &&
        (/^\s+(?:activate\b|this ability costs\b)/iu.test(text.slice(i + 1, end)) ||
          // Issue 81 (White Sun's Twilight): a token's quoted ability ends with its period and the next sentence is the condition on X: `... "This token can't block." If X is 5 or more, ...`.
          /^\s+if x is\b/iu.test(text.slice(i + 1, end)) ||
          (/\sgains "enchant [^"]*$/iu.test(text.slice(from, i)) &&
            /^\s+\S/u.test(text.slice(i + 1, end))))
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

/**
 * The costs of an activated ability, one span each (CR 118.1: costs are separated by commas). Grave Danger (issue 159, Grimoire of the Dead): the last cost may
 * join "sacrifice it" to the one before with "and" ("Remove three study counters from ~ and sacrifice it"): it is two costs, the second read by `cost.sacrifice`.
 */
function costSpans(text: string, end: number): Span[] {
  const spans: Span[] = [];
  let from = 0;
  // Counter Intelligence deck, group 2 (Tekuthal): "Remove three counters from among other artifacts, creatures, and planeswalkers you control" is one cost: the commas of a list of
  // the permanents the counters come off do not separate costs.
  const lists = [
    ...text
      .slice(0, end)
      .matchAll(/\bfrom among (?:other )?[a-z]+s(?:, [a-z]+s)+,? and [a-z]+s you control\b/giu),
  ].map((m) => ({ start: m.index ?? 0, end: (m.index ?? 0) + m[0].length }));
  for (const comma of topLevelCommas(text, 0, end)) {
    if (lists.some((list) => comma > list.start && comma < list.end)) continue;
    spans.push(trimmed(text, from, comma));
    from = comma + 1;
  }
  const last = trimmed(text, from, end);
  const joined = /^(.*~) and (sacrifice it)$/isu.exec(text.slice(last.start, last.end));
  if (joined !== null && joined[1] !== undefined) {
    spans.push({ start: last.start, end: last.start + joined[1].length });
    spans.push({ start: last.end - 'sacrifice it'.length, end: last.end });
  } else {
    spans.push(last);
  }
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

/**
 * "You may pay {1}. When you do, choose one —" and its bullets (D-511, CR 603.12, 700.2b): the sentences of a triggered ability's body up to a sentence that starts "When you do,
 * choose" and the modal text it holds (header and bullets). Null when the body has no such sentence, or it is the first (a body of nothing but the reflexive ability has nothing
 * that creates it).
 */
function reflexiveModal(
  text: string,
  from: number,
): { sentences: Span[]; header: Span; modes: Span[] } | null {
  const lead = /\. When you do, (?=choose\b)/i.exec(text.slice(from));
  if (lead === null) return null;
  const headerStart = from + lead.index + lead[0].length;
  const modal = modalBody(text, headerStart);
  if (modal === null) return null;
  return {
    sentences: splitSentences(text, from, from + lead.index + 1),
    header: modal.header,
    modes: modal.modes,
  };
}

/** "Lightning — ": the name of a chapter of a Saga, between its numeral and its text. */
const CHAPTER_NAME = /^\p{Lu}[\p{L}']*(?: \p{Lu}[\p{L}']*)? — /u;

/** "Boast — " before the cost of an activated ability (CR 702.142a). */
const BOAST_PREFIX = /^Boast — /u;

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
    ...optional('reflexiveModalHeader'),
    ...(sk.reflexiveModes === undefined
      ? {}
      : { reflexiveModes: sk.reflexiveModes.map((s) => shiftSpan(s, by)) }),
  };
}

/**
 * An activated ability's skeleton, the costs before the colon at `colon` and the effect after it (CR 602.1): modal, or sentences with
 * the "Activate only ..." restrictions that follow the effect.
 */
/**
 * "Choose one. Activate only as a sorcery." and its bullets (issue 105, Aetheric Amplifier; CR 700.2a, 602.5): the lead line of a modal activated ability that says its restriction right
 * after "Choose one". The header is "Choose one" (the `modal.choose-bare` rule), the restriction is read as any other `restrictions` entry of an activated ability, and the bullets
 * are the modes.
 */
function restrictedModalBody(
  text: string,
  from: number,
): { header: Span; restriction: Span; modes: Span[] } | null {
  const lead = /^(choose (?:one|two|one or both|one or more))\. (activate only [^\n•]*\.)\n•/i.exec(
    text.slice(from),
  );
  if (lead === null) return null;
  const lines = text.slice(from).split('\n');
  const [first = '', ...bullets] = lines;
  if (!bullets.every((line) => line.startsWith('•'))) return null;
  const headerEnd = from + (lead[1] ?? '').length;
  const restrictionStart = headerEnd + 2;
  const modes: Span[] = [];
  let at = from + first.length + 1;
  for (const bullet of bullets) {
    const start = at + (/^•\s*/.exec(bullet)?.[0].length ?? 0);
    modes.push(trimmed(text, start, at + bullet.length));
    at += bullet.length + 1;
  }
  return {
    header: trimmed(text, from, headerEnd),
    restriction: trimmed(text, restrictionStart, from + first.length),
    modes,
  };
}

function activatedSkeleton(
  text: string,
  colon: number,
  base: Omit<AbilitySkeleton, 'head'>,
): AbilitySkeleton {
  // "{4}, {T}: Choose one. Activate only as a sorcery." and its bullets (issue 105).
  const restricted = restrictedModalBody(text, trimmed(text, colon + 1, text.length).start);
  if (restricted !== null) {
    return {
      ...base,
      head: 'activated',
      costs: costSpans(text, colon),
      restrictions: [restricted.restriction],
      modalHeader: restricted.header,
      modes: restricted.modes,
    };
  }
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
    /^(?:activate\b|this ability costs\b|only your opponents may activate\b)/i.test(
      text.slice(s.start),
    ),
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
  // "Boast — Sacrifice another creature or artifact: ..." (CR 702.142a): the keyword word and its dash, then an ordinary activated ability.
  const boast = BOAST_PREFIX.exec(text);
  if (boast !== null) {
    const by = boast[0].length;
    const inner = segment(text.slice(by), face);
    if (inner.head === 'activated') return { ...shifted(inner, text, by), boast: true };
  }
  const whole = { start: 0, end: text.length };
  const base = { text, face, whole, ...EMPTY };

  const chapter = CHAPTER_PREFIX.exec(text);
  if (chapter !== null) {
    // CR 714.2: a chapter symbol is a keyword ability that represents a triggered ability. The
    // numerals are the trigger; the body is read like the body of any triggered ability.
    const numerals = chapter[1] ?? '';
    // A chapter may carry a name of its own before its text ("I — Lightning — ..."): a flavor name of one or two capitalized words, which is no rule (CR 714.2).
    const name = CHAPTER_NAME.exec(text.slice(chapter[0].length));
    // "I, II, III — Choose one at random —" and its bullets (CR 714.2, 700.2b): the body of the chapter is the modes.
    const chapterModal = modalBody(text, chapter[0].length);
    if (chapterModal !== null) {
      return {
        ...base,
        head: 'triggered',
        trigger: { start: 0, end: numerals.length },
        chapter: true,
        modalHeader: chapterModal.header,
        modes: chapterModal.modes,
      };
    }
    return {
      ...base,
      head: 'triggered',
      trigger: { start: 0, end: numerals.length },
      chapter: true,
      sentences: splitSentences(text, chapter[0].length + (name?.[0].length ?? 0), text.length),
    };
  }

  // "You may exert ~ as it attacks. When you do, ~ deals 4 damage to target creature." (CR 701.43d, 607.2h): the first sentence is the trigger, the rest the body.
  const exert = EXERT_LEAD.exec(text);
  if (exert !== null) {
    return {
      ...base,
      head: 'triggered',
      trigger: trimmed(text, 0, text.indexOf('.')),
      sentences: splitSentences(text, exert[0].length, text.length),
    };
  }

  // "When you next cast an instant or sorcery spell this turn, copy that spell." (D-336, CR 603.7): a spell's sentence that creates a delayed triggered ability,
  // not a triggered ability of a permanent; it is read as the sentences of the body (`sentence.delayed`).
  if (
    TRIGGER_WORD.test(text) &&
    !DELAYED_CAST_LEAD.test(text) &&
    !DELAYED_COMBAT_BATCH_LEAD.test(text)
  ) {
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
    // "..., you may pay {1}. When you do, choose one —" and its bullets (D-511, CR 603.12, 700.2b): the sentences before it, and the modes of the reflexive ability.
    const reflexive = modal === null ? reflexiveModal(text, bodyStart) : null;
    return {
      ...base,
      head: 'triggered',
      triggerWord: wordSpan,
      trigger,
      ...(interveningIf === undefined ? {} : { interveningIf }),
      ...(modal === null
        ? reflexive === null
          ? { sentences: splitSentences(text, bodyStart, text.length) }
          : {
              sentences: reflexive.sentences,
              reflexiveModalHeader: reflexive.header,
              reflexiveModes: reflexive.modes,
            }
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

  if (ACTIVATED_MAY_CAST_RIDER.test(text)) {
    const colon = costColon(text);
    if (colon > 0) return activatedSkeleton(text, colon, base);
    // A spell of the same two sentences: the rider belongs to the permission, not to a replacement effect of a permanent.
    return { ...base, head: 'other', sentences: splitSentences(text, 0, text.length) };
  }

  // Finale of Promise (issue 121): "If a spell cast this way would be put into your graveyard, exile it instead." belongs to the permission the first sentence gives, not to a replacement
  // effect of a permanent: the text is a spell of four sentences.
  if (FINALE_CAST.test(text.split(/(?<=\.) /u)[0] ?? '')) {
    return { ...base, head: 'other', sentences: splitSentences(text, 0, text.length) };
  }

  if (ACTIVATED_CAST_EXILED_RIDER.test(text)) {
    const colon = costColon(text);
    if (colon > 0) return activatedSkeleton(text, colon, base);
  }

  if (SPELL_LEAVE_EXILE_RIDER.test(text)) {
    return { ...base, head: 'other', sentences: splitSentences(text, 0, text.length) };
  }

  if (LEAVE_EXILE_RIDER.test(text)) {
    const colon = costColon(text);
    if (colon > 0 && text.slice(0, colon).includes('{'))
      return activatedSkeleton(text, colon, base);
  }

  if (
    REPLACEMENT_ENTERS.test(text) ||
    REPLACEMENT_ENTER_AS_COPY.test(text) ||
    REPLACEMENT_ESCAPES.test(text) ||
    REPLACEMENT_UMBRA_ARMOR.test(text) ||
    REPLACEMENT_IF_ENTERS.test(text) ||
    // Issue 81 (Omnath): "If you would lose unspent mana, that mana becomes colorless instead." is a static ability of the permanent about its controller's pool (`static.unspent-mana-colorless`).
    (/ would /.test(text) &&
      / instead\b/.test(text) &&
      !/^if you would lose unspent mana, that mana becomes colorless instead\.$/iu.test(text) &&
      // Aven Mindcensor: "If an opponent would search a library, that player searches the top four cards of that library instead." is a static ability of the permanent (`static.opponent-search-top-only`).
      !/^if an opponent would search a library, that player searches the top \w+ cards of that library instead\.$/iu.test(
        text,
      ))
  ) {
    return { ...base, head: 'replacement' };
  }

  const colon = costColon(text);
  if (colon > 0) {
    const costText = text.slice(0, colon);
    if (
      costText.includes('{') ||
      COST_WORDS.test(costText) ||
      COST_PUT_COUNTERS_WORDS.test(costText)
    ) {
      return activatedSkeleton(text, colon, base);
    }
  }

  return { ...base, head: 'other', sentences: splitSentences(text, 0, text.length) };
}
