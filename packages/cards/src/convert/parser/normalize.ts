/**
 * Oracle text normalization, per face (SPEC 7.2): reminder text out, self references to `~`.
 * The grammar then only has to know one spelling of "this card".
 */

import { CREATURE_TYPES, PLANESWALKER_TYPES } from '@commander-arena/engine';

export interface NormalizeOptions {
  /** The face's own name. */
  readonly name: string;
  /**
   * Legendary cards also refer to themselves by the part of the name before the first comma and, with no comma, before " the "
   * ("Rhonas the Indomitable" is "Rhonas": stage P32, D-147).
   */
  readonly legendary: boolean;
  /**
   * The face is a creature (D-515): a legendary creature named "<Name> of <Title>" calls itself by its first word ("Sharae of Numbing Depths" is "Sharae"). Left out for any other
   * face: a planeswalker "Gideon of the Trials" is not "Gideon" in its text, where "a Gideon planeswalker" is a type of permanent.
   */
  readonly creature?: boolean;
}

/**
 * The ability words of CR 207.2c (Text Box), as that rule lists them: italic labels at the start
 * of an ability that "have no special rules meaning", so the ability reads the same without them
 * ("Landfall — Whenever a land you control enters, ..." is "Whenever a land you control enters,
 * ..."). Copied from the CR text in `docs/rules/`; a word the CR adds later is not stripped until
 * it is added here.
 */
export const ABILITY_WORDS: readonly string[] = [
  'adamant',
  'addendum',
  'alliance',
  'battalion',
  'bloodrush',
  'celebration',
  'channel',
  'chroma',
  'cohort',
  'constellation',
  'converge',
  'council’s dilemma',
  'coven',
  'delirium',
  'descend 4',
  'descend 8',
  'disappear',
  'domain',
  'eerie',
  'eminence',
  'enrage',
  'fateful hour',
  'fathomless descent',
  'ferocious',
  'flurry',
  'formidable',
  'grandeur',
  'hellbent',
  'heroic',
  'imprint',
  'infusion',
  'inspired',
  'join forces',
  'kinship',
  'landfall',
  'lieutenant',
  'magecraft',
  'metalcraft',
  'morbid',
  'opus',
  'pack tactics',
  'paradox',
  'parley',
  'radiance',
  'raid',
  'rally',
  'renew',
  'repartee',
  'revolt',
  'secret council',
  'spell mastery',
  'strive',
  'survival',
  'sweep',
  'tempting offer',
  'threshold',
  'undergrowth',
  'valiant',
  'vivid',
  'void',
  'will of the council',
];

/** "Landfall — " at the start of a line: an ability word, an em dash and the ability. */
const ABILITY_WORD_RE = new RegExp(
  `^(?:${[...ABILITY_WORDS]
    .sort((a, b) => b.length - a.length)
    .map((w) => escapeRegExp(w).replace('’', "['’]"))
    .join('|')}) — `,
  'i',
);

/** Removes a leading ability word and its em dash (CR 207.2c); any other line is unchanged. */
export function stripAbilityWord(line: string): string {
  return line.replace(ABILITY_WORD_RE, '');
}

/**
 * A flavor word (CR 207.2d): "Rage — Whenever ~ attacks, ...", "The Allagan Eye — ...", "A Test of Your Reflexes! — ...". Like an ability word it "has no
 * special rules meaning", but the CR does not list them ("each flavor word is tailored to the specific ability it appears with"), so no list can
 * name them. A label is a capitalized phrase of one to six words (letters, apostrophes, hyphens, "!" and "?"; no digit, comma, period, colon, brace or
 * bullet), an em dash with a space on each side and the ability.
 */
const FLAVOR_LABEL = /^(\p{Lu}[\p{L}'’!?-]*(?: [\p{L}'’!?-]+){0,5}) — (?=\S)/u;

/**
 * Labels that look like a flavor word and are not (CR 207.2d only covers italic labels without a rules meaning): the head of a mode list
 * ("Choose one —", CR 700.2), a chapter ("I —", CR 714.2), and the keywords whose text has a dash with spaces ("Boast — {1}: ..." adds a restriction to
 * the ability that follows, CR 702.142a; "Forecast —", "Companion —", "Solved —", "Level N —", "To solve —" and "Max speed —" (CR 702.179: the ability works only at max speed) have rules meaning too). The keyword
 * forms written with no spaces ("Escape—", "Ward—", "Equip—") never match the pattern above. A line with one of these is left as it is.
 */
const NOT_A_FLAVOR_WORD =
  /^(?:choose\b|boast$|forecast$|companion$|solved$|level\b|to solve$|max speed$)/i;
const CHAPTER_NUMERAL = /^[IVX]+$/;

/**
 * The line without its leading flavor word, or the line itself when it has none (CR 207.2d). Not part of `normalizeOracleText`: a line that
 * reads as written is never changed, so `parseFaceText` reads the line again without the label only when the whole line did not read (D-204).
 */
export function stripFlavorWord(line: string): string {
  const m = FLAVOR_LABEL.exec(line);
  const label = m?.[1] ?? '';
  if (m === null || NOT_A_FLAVOR_WORD.test(label) || CHAPTER_NUMERAL.test(label)) return line;
  const rest = line.slice(m[0].length);
  // What follows is an ability, which starts a sentence ("Whenever ...", "Equip {4}", "{T}: ...", "+1/+1 counters ..." is not one): a lower case word after the dash
  // means the dash is inside a sentence and the words before it are not a label.
  return /^[\p{Lu}{]/u.test(rest) ? rest : line;
}

const SELF_NOUNS =
  'creature|artifact|enchantment|land|permanent|spell|planeswalker|battle|vehicle|spacecraft|equipment|aura|saga|class';
const SELF_NOUN_RE = new RegExp(`\\bthis (?:${SELF_NOUNS})\\b`, 'gi');

/**
 * "this token" inside the quotes of a token's own ability (stage P35, D-176, CR 111.4): `create a 1/1 Pest creature token with "When this
 * token dies, you gain 1 life."` is the ability of the token, which refers to itself as "this token" (a card's own text never says it,
 * so it is only rewritten inside quotes). As in any quoted ability, `~` there is the permanent that has the ability.
 */
const QUOTED_SPAN = /"[^"]*"|“[^”]*”/gu;

function tokenSelfInQuotes(text: string): string {
  return text.replace(QUOTED_SPAN, (quoted) => quoted.replace(/\bthis token\b/giu, '~'));
}

/**
 * Whether the text puts the card's own name inside a quotation (stage P36, D-178): there `~` is the card, where a quoted ability otherwise says
 * "this creature" or "this artifact" of the permanent that has it, and both are `~` once normalized. An ability granted to a group is not read
 * from such a text, since `~` could be either.
 */
export function namesItselfInQuotes(text: string, options: NormalizeOptions): boolean {
  const names = selfNames(options).map(
    (name) => new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(name)}(?![\\p{L}\\p{N}])`, 'u'),
  );
  return [...stripReminderText(text).matchAll(QUOTED_SPAN)].some((quoted) =>
    names.some((re) => re.test(quoted[0])),
  );
}

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Removes reminder text: every parenthesized part, with the space before it. */
export function stripReminderText(text: string): string {
  let out = text;
  for (;;) {
    const next = out.replace(/[ \t]*\([^()]*\)/g, '');
    if (next === out) return out;
    out = next;
  }
}

/**
 * "<Name> the <Title>": the name before " the ", when the word before it is not a preposition that "the" belongs to ("Gideon of the
 * Trials" is not "Gideon of").
 */
const SHORT_NAME_THE =
  /^((?:[\p{L}'’-]+ )*?(?<!\b(?:of|to|in|on|at|for|from|and|with|by|into) )[\p{Lu}][\p{L}'’-]*) the \p{Lu}/u;

/** The names a card uses for itself, longest first. */
export function selfNames(options: NormalizeOptions): string[] {
  const names = [options.name];
  if (options.legendary) {
    const comma = options.name.indexOf(',');
    if (comma > 0) {
      names.push(options.name.slice(0, comma));
      // "<Rank> <Given name> <Family name>, <Title>": Oracle text may call the card by the rank and the family name ("Ensign Harry Kim, Operations" is "Ensign Kim", Federation Fleet
      // deck, group D). Only a part of three or more capitalized words has such a short form.
      const words = options.name.slice(0, comma).split(' ');
      const first = words[0];
      const last = words[words.length - 1];
      if (
        words.length >= 3 &&
        first !== undefined &&
        last !== undefined &&
        words.every((w) => /^\p{Lu}[\p{L}'’-]*$/u.test(w))
      ) {
        names.push(`${first} ${last}`);
      }
    } else {
      const short = SHORT_NAME_THE.exec(options.name);
      if (short?.[1] !== undefined) names.push(short[1]);
      else {
        // "<Given name> <Family name> of <Title>": a legendary creature may also be called by the two words before "of" ("Rosie Cotton of South Lane" is "Rosie Cotton").
        const personal =
          options.creature === true
            ? /^(\p{Lu}[\p{L}'’-]+(?: \p{Lu}[\p{L}'’-]+)+) of \p{Lu}/u.exec(options.name)?.[1]
            : undefined;
        if (personal !== undefined) names.push(personal);
        const given =
          givenName(options.name) ??
          (options.creature === true ? creatureOfName(options.name) : undefined);
        if (given !== undefined) names.push(given);
      }
    }
  }
  return names.filter((n) => n.length > 0);
}

/**
 * Words that start a legendary name without being a given name: the types and kinds a permanent is made of, which Oracle text also
 * writes with a capital letter ("target Goblin", "a Treasure"). Creature types come from the engine's table (CR 205.3m).
 */
const NOT_A_GIVEN_NAME = new Set<string>([
  ...CREATURE_TYPES,
  'Mountain',
  'Island',
  'Plains',
  'Swamp',
  'Forest',
  'Equipment',
  'Aura',
  'Saga',
  'Vehicle',
  'Treasure',
  'Food',
  'Clue',
  'Blood',
  'Gold',
  'Shrine',
  'Cave',
  'Desert',
  'Gate',
  'Lair',
  'Locus',
  'Fortification',
  'Curse',
  'Contraption',
]);

/**
 * "<Given name> <Family name>": a legendary name of two or more words with no comma and no " the ", which Oracle text shortens to its
 * first word ("Lobelia Sackville-Baggins" is "Lobelia": stage P46, D-198). Only a capitalized first word of three or more letters that is
 * no possessive and no type of permanent counts (see NOT_A_GIVEN_NAME), so ordinary words of the text are not taken for the card.
 */
function givenName(name: string): string | undefined {
  const space = name.indexOf(' ');
  if (space < 3) return undefined;
  const first = name.slice(0, space);
  // "Gideon of the Trials", "Liliana of the Veil": a word of lower case after the first one makes it a title, not a family name.
  if (!/^\p{Lu}/u.test(name.slice(space + 1))) return undefined;
  if (!/^\p{Lu}[\p{L}'’-]*$/u.test(first) || /['’]s$/u.test(first)) return undefined;
  return NOT_A_GIVEN_NAME.has(first) ? undefined : first;
}

/**
 * "<Name> of <Title>": a legendary creature named for a person and the place or thing it is of, which Oracle text shortens to the first word ("When Sharae enters": Sharae of Numbing
 * Depths, D-515). The title starts with a capital (a "of the" is a place of the plane, not a name: "Liliana of the Veil"), and the word is no possessive and no type of permanent.
 */
function creatureOfName(name: string): string | undefined {
  const m = /^(\p{Lu}[\p{L}'’-]{2,}) of (the )?\p{Lu}/u.exec(name);
  const first = m?.[1];
  if (first === undefined || /['’]s$/u.test(first) || NOT_A_GIVEN_NAME.has(first)) return undefined;
  // "Ureni of the Unwritten" is "Ureni" (a legendary creature), but "of the" after a planeswalker type is a place of the plane ("Gideon of the Trials", "Liliana of the Veil"): that
  // word is the type of a planeswalker the text may name ("a Gideon planeswalker"), not the card.
  if (m?.[2] !== undefined && PLANESWALKER_TYPES.includes(first)) return undefined;
  return first;
}

/**
 * Strips reminder text, replaces self references with `~`, trims every line, collapses runs of
 * spaces, removes a leading ability word (CR 207.2c) and drops lines that end up empty. Lines stay separated by a single newline.
 */
/**
 * The class level bar "{1}{R}: Level 2" (stage P75, D-235, CR 716.2) has no period, as every effect the grammar reads has: the period is added so the line reads as the
 * activated ability it is.
 */
function withLevelBarPeriod(line: string): string {
  return /^(?:\{[^}]+\})+: Level [2-9]\d*$/u.test(line) ? `${line}.` : line;
}

/**
 * "Exile target card that's an instant or sorcery from your graveyard" (Mizzix's Mastery, issue 121) says what "Exile target instant or sorcery card from your graveyard" says: a card of
 * those types, in a graveyard. The words are put in the order the noun rules read (CR 404.1, 205.2a); only a list of card types ("instant or sorcery", "creature", "artifact and/or
 * enchantment") before "from your graveyard", "from a graveyard" or "in your graveyard" is rewritten.
 */
const CARD_THAT_IS_TYPES =
  /\bcard that['’]s an? ((?:artifact|battle|creature|enchantment|instant|land|planeswalker|sorcery)(?:,? (?:or|and\/or) (?:artifact|battle|creature|enchantment|instant|land|planeswalker|sorcery))*) (?=(?:from (?:your|a) graveyard|in your graveyard)\b)/giu;

export function withCardThatIs(line: string): string {
  return line.replace(CARD_THAT_IS_TYPES, '$1 card ');
}

/**
 * "half X" says how it rounds (CR 107.1a), in one of two places that no phrase of the grammar sits next to: after the whole instruction ("create half X Food tokens, rounded
 * up.") or in a sentence of its own for every "half" before it ("... gain half X life and draw half X cards. Round down each time."). The line is written so the rounding follows
 * the amount, as the other "half" phrases have it: "create half X, rounded up Food tokens." The sentence "Round down each time." is dropped once its rounding is written in.
 */
export function withHalfRounding(line: string): string {
  const each = /^(.*?)\s*\bRound (up|down) each time\.?$/u.exec(line);
  if (each?.[1] !== undefined && /\bhalf X\b/u.test(each[1])) {
    return each[1].replace(/\bhalf X\b(?!, rounded)/gu, `half X, rounded ${each[2] ?? 'down'}`);
  }
  return line.replace(
    /\bhalf X ((?:(?!half)[^,.])+), rounded (up|down)(?=[.,]|$)/gu,
    'half X, rounded $2 $1',
  );
}

/** The words before a planeswalker type that say it is a kind of permanent: "each Garruk you control", "another Jace". */
const PLANESWALKER_TYPE_LEAD = /\b(?:each|another|other|an?|target|all|those) $/iu;

export function normalizeOracleText(text: string, options: NormalizeOptions): string {
  let out = stripReminderText(text);
  for (const name of selfNames(options)) {
    // CR 205.3j (Garruk, Cursed Huntsman: "put a loyalty counter on each Garruk you control"): a planeswalker type is also the short name of the card, but after a word that makes it a
    // kind of permanent ("each", "another", "a", ...) it is the type, which the noun rules read, and not the card itself.
    const type = PLANESWALKER_TYPES.includes(name);
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(name)}(?![\\p{L}\\p{N}])`, 'gu');
    out = out.replace(re, (match, offset: number) =>
      type && PLANESWALKER_TYPE_LEAD.test(out.slice(Math.max(0, offset - 12), offset))
        ? match
        : '~',
    );
  }
  out = out.replace(SELF_NOUN_RE, '~');
  out = tokenSelfInQuotes(out);
  let spree = false;
  return out
    .split('\n')
    .map((line) =>
      withCardThatIs(
        withHalfRounding(withLevelBarPeriod(stripAbilityWord(line.replace(/[ \t]+/g, ' ').trim()))),
      ),
    )
    .filter((line) => line !== '')
    .map((line) => {
      // Spree (CR 702.172b): the plus signs before the modes "do not have additional rules meaning": they are the bullets of the modal text.
      if (/^spree$/iu.test(line)) spree = true;
      return spree && /^\+ (?=\{)/u.test(line) ? line.replace(/^\+ /u, '• ') : line;
    })
    .join('\n');
}

/**
 * "As ~ enters, choose Khans or Dragons." (stage P34, D-152, CR 614.12, 607.2d): a choice among names the card gives, whose bullets are
 * abilities of their own ("• Khans — At the beginning of your upkeep, ..."), not the modes of a modal text. The names begin with a capital.
 */
const OPTION_CHOICE = /^[Aa]s ~ enters, choose \p{Lu}[^.—•\n]*? or \p{Lu}[^.—•\n]*\.$/u;

/**
 * "... When ~ leaves the battlefield, that creature's controller sacrifices it." (issue 89, Animate Dead; CR 603.1, 607.2): a triggered ability that the Oracle text prints in the
 * same paragraph as the one it is linked to is an ability of its own, so it starts a line. Only after the period that ends a sentence, outside quotes.
 */
const LINKED_LEAVES = /(?<=\.) (?=When ~ leaves the battlefield, )/gu;

function splitLinkedLeaves(normalized: string): string {
  return normalized.replace(LINKED_LEAVES, (_match, offset: number) =>
    (normalized.slice(0, offset).match(/["”“]/gu)?.length ?? 0) % 2 === 0 ? '\n' : ' ',
  );
}

/**
 * Splits normalized text into abilities, one per line. A bullet line ("• ...") belongs to the
 * line above it, so "Choose one —" stays together with its modes; the bullets of a choice among
 * named options are lines of their own (`segment` reads the name).
 */
export function splitAbilities(normalized: string): string[] {
  const abilities: string[] = [];
  let optionBullets = false;
  for (const line of splitLinkedLeaves(normalized).split('\n')) {
    if (line === '') continue;
    const last = abilities.length - 1;
    if (line.startsWith('•') && last >= 0 && !optionBullets) {
      abilities[last] = `${abilities[last]}\n${line}`;
    } else {
      abilities.push(line);
      if (!line.startsWith('•')) {
        optionBullets = OPTION_CHOICE.test(line);
      }
    }
  }
  return abilities;
}
