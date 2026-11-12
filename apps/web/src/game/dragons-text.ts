/**
 * The words of the Dragons slice (D-151), composed from the engine's nodes and never from a card name: exiling the top cards and
 * the permission to play them, an additional combat phase, a creature that enters attacking, revealing the top card, Discover and
 * its kin, Behold, paying any amount of a symbol, discarding any number of cards, casting spells from the top of the library, mana
 * that stays, a permanent that enters as a copy or with a chosen option, the keyword reminders (Read ahead, Dethrone, Myriad), and
 * the mana of a count, of any combination of colors and with a rider.
 *
 * A shape the words do not cover gives `null` (the caller drops the whole instruction), never a guess (AGENTS.md "Honesty"). Pure.
 */
import type {
  Amount,
  CardType,
  Duration,
  Effect,
  ManaProduction,
  ObjectFilter,
  PlayUntil,
  Replacement,
  StaticEffect,
  TriggerStep,
} from '@commander-arena/engine';
import { amountPhrase, UNKNOWN_AMOUNT } from './amount-text';
import { asCreatures, cardNoun, numberWord } from './artifacts-text';
import { pluralSubtype, thingsPhrase } from './filter-text';
import { triggerWording, withText } from './trigger-text';
import { COLOR_NAMES } from './words';

/**
 * "Exile the top card of your library", "Exile the top two cards of your library", "Exile the top X cards of your library"; D-187 (CR 406.3): "Exile the
 * top two cards of target opponent's library face down". `library` words whose library it is when it is not the controller's ("target opponent's library").
 */
export function exileTopText(
  effect: Extract<Effect, { kind: 'exileTop' }>,
  say: (amount: Amount) => string,
  library = 'your library',
): string {
  const { count } = effect;
  const down = effect.faceDown === true ? ' face down' : '';
  if (count === 1) return `Exile the top card of ${library}${down}`;
  const n = typeof count === 'number' ? numberWord(count) : say(count);
  return `Exile the top ${n} cards of ${library}${down}`;
}

/** What a play permission lasts, as the cards print it: "this turn", "until the end of your next turn", "until your next end step". */
const PLAY_UNTIL: Readonly<Record<PlayUntil, string>> = {
  endOfTurn: 'this turn',
  endOfYourNextTurn: 'until the end of your next turn',
  yourNextEndStep: 'until your next end step',
  whileExiled: 'for as long as they remain exiled',
};

/**
 * "You may play that card this turn", "Until the end of your next turn, you may play those cards", "You may play those cards until
 * your next end step" (CR 601.2, 305.1, 611.2a): `many` is whether the cards before it in the sequence were several. D-187 (CR 406.3): "You may look at
 * and play those cards for as long as they remain exiled" (a single card: "that card ... as long as it remains exiled").
 */
export function mayPlayText(effect: Extract<Effect, { kind: 'mayPlay' }>, many: boolean): string {
  const what = many ? 'those cards' : 'that card';
  if (effect.lasts === 'endOfYourNextTurn') {
    return `Until the end of your next turn, you may play ${what}`;
  }
  if (effect.lasts === 'whileExiled') {
    const look = effect.lookAt === true ? 'look at and ' : '';
    return `You may ${look}play ${what} for as long as ${many ? 'they remain' : 'it remains'} exiled`;
  }
  return `You may play ${what} ${PLAY_UNTIL[effect.lasts]}`;
}

/** "After this phase, there is an additional combat phase" (CR 500.8, 500.10). */
export const EXTRA_COMBAT_TEXT = 'After this phase, there is an additional combat phase';

/**
 * D-187: "There's an additional combat phase after this phase. At the beginning of that combat, untap all creatures you control": the same phase,
 * with what a delayed ability does as it begins (`atBeginning`, said by the caller in the words of the effect).
 */
export function extraCombatText(atBeginning: string | null): string {
  return atBeginning === null
    ? EXTRA_COMBAT_TEXT
    : `${EXTRA_COMBAT_TEXT}. At the beginning of that combat, ${lowerFirst(atBeginning)}`;
}

const lowerFirst = (text: string): string => `${text.charAt(0).toLowerCase()}${text.slice(1)}`;

/** The six types a "permanent card" is (CR 110.4): `anyOf` of exactly these says "permanent". */
const PERMANENT_TYPES: readonly CardType[] = [
  'artifact',
  'creature',
  'enchantment',
  'land',
  'planeswalker',
  'battle',
];

/** True when the filter is the union of the six permanent types and nothing else. */
function isPermanentCard(filter: ObjectFilter): boolean {
  const members = filter.anyOf;
  if (members === undefined || Object.keys(filter).length !== 1) return false;
  const types = members.flatMap((m) => (Object.keys(m).length === 1 ? (m.types ?? []) : []));
  return types.length === members.length && PERMANENT_TYPES.every((t) => types.includes(t));
}

/** "a permanent card", "a land card", "an artifact card with mana value 3 or less": the card `revealTop` looks for. */
function revealedCard(filter: ObjectFilter): string | null {
  return isPermanentCard(filter) ? 'a permanent card' : cardNoun(filter);
}

/**
 * "If it's a permanent card, they put it onto the battlefield" (CR 701.20): what the player does with the card revealed, in the
 * person of `me` (you) or of someone else (they). Null when the card cannot be said.
 */
export function revealTopTail(
  effect: Extract<Effect, { kind: 'revealTop' }>,
  me: boolean,
): string | null {
  const card = revealedCard(effect.ifMatches);
  if (card === null) return null;
  const where =
    effect.to === 'hand'
      ? `into ${me ? 'your' : 'their'} hand`
      : `onto the battlefield${effect.tapped === true ? ' tapped' : ''}`;
  return `If it's ${card}, ${me ? 'put' : 'they put'} it ${where}`;
}

/**
 * "Target player reveals the top card of their library. If it's a permanent card, they put it onto the battlefield" (CR 701.20):
 * `subject` words the player ("target player", "its owner", "you").
 */
export function revealTopText(
  effect: Extract<Effect, { kind: 'revealTop' }>,
  subject: string,
): string | null {
  const me = subject === 'you';
  const tail = revealTopTail(effect, me);
  if (tail === null) return null;
  const reveal = me ? 'Reveal' : `${capital(subject)} reveals`;
  return `${reveal} the top card of ${me ? 'your' : 'their'} library. ${tail}`;
}

const capital = (text: string): string => `${text.charAt(0).toUpperCase()}${text.slice(1)}`;

/**
 * "Discover 10", or the whole instruction of "Exile cards from the top of your library until you exile a nonland card. You may cast it
 * without paying its mana cost if that spell's mana value is 8 or less. If you don't, put that card into your hand" (CR 701.57, 702.85a).
 */
export function exileUntilCastText(effect: Extract<Effect, { kind: 'exileUntilCast' }>): string {
  if (effect.foundAtMost !== undefined) return `Discover ${effect.foundAtMost}`;
  const limit =
    effect.castAtMost === undefined
      ? ''
      : ` if that spell's mana value is ${effect.castAtMost} or less`;
  return `Exile cards from the top of your library until you exile a nonland card. You may cast it without paying its mana cost${limit}. If you don't, put that card into your hand`;
}

/** Discover's reminder (CR 701.57a), for the dialog that asks the question. */
export function discoverReminder(n: number): string {
  return `Exile cards from the top of your library until you exile a nonland card with mana value ${n} or less. Cast it without paying its mana cost if its mana value is ${n} or less, or put it into your hand. Put the rest on the bottom of your library in a random order.`;
}

/** "Behold a Dragon", "Behold a creature with power 4 or greater" (CR 701.4a): the keyword action, with its quality. */
export function beholdText(effect: Extract<Effect, { kind: 'behold' }>): string | null {
  const quality = beholdQuality(effect.filter);
  return quality === null ? null : `Behold ${quality}`;
}

/** "a Dragon", "an artifact": what is beheld, with its article. */
export function beholdQuality(filter: ObjectFilter): string | null {
  const said = cardNoun(asCreatures(filter));
  return said === null ? null : said.replace(/ card(?= |$)/, '');
}

/** The reminder of Behold (CR 701.4a), with the quality: "Reveal a Dragon card from your hand or choose a Dragon you control". */
export function beholdReminder(filter: ObjectFilter): string | null {
  const quality = beholdQuality(filter);
  if (quality === null) return null;
  const card = cardNoun(asCreatures(filter));
  return card === null
    ? null
    : `Reveal ${card} from your hand or choose ${quality} you control on the battlefield`;
}

/** "You may pay any amount of {R}" (CR 118.1): the first half of `payAnyAmount`. */
export function payAnyAmountText(symbol: string): string {
  return `You may pay any amount of {${symbol}}`;
}

/** "Discard any number of cards" (CR 701.9), in the person of the discarder. */
export const ANY_NUMBER_OF_CARDS = 'any number of cards';

/** "red", "red and green", "colorless": the colors a static names. */
function colorsOf(colors: readonly string[]): string {
  const names = colors.map((c) => (c === 'C' ? 'colorless' : (COLOR_NAMES[c] ?? c)));
  return names.length <= 2
    ? names.join(' and ')
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** "creature spells with power 4 or greater", "spells": the spells a permission or a restriction names. */
export function spellsOf(spells: ObjectFilter): string | null {
  const { types, subtypes, colors, controller: _controller, ...rest } = spells;
  const allowed = new Set(['power', 'toughness', 'manaValue']);
  if (Object.keys(rest).some((k) => !allowed.has(k))) return null;
  const adjectives = [
    ...(colors ?? []).map((c) => COLOR_NAMES[c] ?? c),
    ...(subtypes ?? []),
    ...(types ?? []),
  ];
  return `${adjectives.length === 0 ? '' : `${adjectives.join(' ')} `}spells${withText(rest)}`;
}

/**
 * "You may cast creature spells with power 4 or greater from the top of your library. If you cast a creature spell this way, it
 * gains haste until end of turn." (CR 601.3, 702.10): the static `castFromTopOfLibrary`.
 */
export function castFromTopText(
  effect: Extract<StaticEffect, { kind: 'castFromTopOfLibrary' }>,
): string | null {
  const spells = spellsOf(effect.spells);
  if (spells === null) return null;
  const head = `You may cast ${spells} from the top of your library`;
  if (effect.gainsHaste !== true) return head;
  const kinds = effect.spells.types ?? [];
  const spell = kinds.length === 1 ? `${kinds[0]} spell` : 'spell';
  const article = /^[aeiou]/i.test(spell) ? 'an' : 'a';
  return `${head}. If you cast ${article} ${spell} this way, it gains haste until end of turn`;
}

/** "You don't lose unspent red mana as steps and phases end" (CR 500.5, 106.4). */
export function unspentManaText(
  effect: Extract<StaticEffect, { kind: 'unspentManaStays' }>,
): string {
  return `You don't lose unspent ${colorsOf(effect.colors)} mana as steps and phases end`;
}

/** What a copy lasts: "until end of turn", or nothing for as long as the permanent is on the battlefield. */
function copyDuration(duration: Duration): string {
  return duration === 'untilEndOfTurn' ? ' until end of turn' : '';
}

/** "haste", "flying and haste": the keywords an "except it has ..." gives the copy. */
function keywordList(kinds: readonly string[]): string {
  const words = kinds.map((k) => k.replace(/([A-Z])/g, ' $1').toLowerCase());
  return words.length <= 2
    ? words.join(' and ')
    : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
}

/**
 * "As this artifact enters, you may have it become a copy of any creature on the battlefield until end of turn, except it has haste"
 * (CR 707.9, 614.12). `noun` is the card type of the permanent ("artifact"). Null when the permanents cannot be said.
 */
export function entersAsCopyText(
  replacement: Extract<Replacement, { kind: 'entersAsCopy' }>,
  noun: string,
): string | null {
  const what = thingsPhrase(replacement.what, false)?.replace(' on the battlefield', '') ?? null;
  if (what === null) return null;
  const except =
    replacement.gains === undefined || replacement.gains.length === 0
      ? ''
      : `, except it has ${keywordList(replacement.gains.map((k) => k.kind))}`;
  const become = replacement.optional === true ? 'you may have it become' : 'it becomes';
  return `As this ${noun} enters, ${become} a copy of any ${what} on the battlefield${copyDuration(replacement.duration)}${except}`;
}

/** "As this enchantment enters, choose Khans or Dragons" (CR 614.12a, 607.2d): a choice among names the card gives. */
export function entersOptionText(options: readonly string[], noun: string): string {
  const list =
    options.length <= 2
      ? options.join(' or ')
      : `${options.slice(0, -1).join(', ')} or ${options[options.length - 1]}`;
  return `As this ${noun} enters, choose ${list}`;
}

/** "{R} for each tapped land your opponents control": the symbols a `fixed` production makes, once for each of an amount. */
export function fixedTimesWords(
  production: Extract<ManaProduction, { kind: 'fixed' }>,
): string | null {
  const symbols = production.mana.map((m) => `{${m}}`).join('');
  if (production.times === undefined) return symbols;
  const each = timesEach(production.times);
  return each === null ? null : `${symbols} for each ${each}`;
}

/** "tapped land your opponents control", "creature you control": what a count of a mana production counts, in the singular. */
function timesEach(times: Amount): string | null {
  if (typeof times === 'object' && times.kind === 'countOf') {
    const things = thingsPhrase(asCreatures(times.filter), false);
    return things === null
      ? null
      : things.replace(' an opponent controls', ' your opponents control');
  }
  const phrase = amountPhrase(times);
  return phrase === UNKNOWN_AMOUNT ? null : phrase;
}

/**
 * "two mana in any combination of colors" (CR 106.1b): the production `anyCombination`; with `distinct` (D-319) "two mana of different colors", the
 * words of a card that never makes the same color twice.
 */
export function anyCombinationWords(count: number, distinct = false): string {
  return distinct
    ? `${numberWord(count)} mana of different colors`
    : `${numberWord(count)} mana in any combination of colors`;
}

/**
 * "Dragon spells or activate abilities of Dragons", "a Dragon creature spell": what the mana of a restricted ability may be spent on,
 * said after "Spend this mana only to cast". `alsoAbilities` adds the abilities of the permanents that match.
 */
export function spendOnDragonWords(spend: {
  readonly types?: readonly string[];
  readonly subtypes?: readonly string[];
  readonly alsoAbilities?: true;
}): string | null {
  const types = spend.types ?? [];
  const subtypes = spend.subtypes ?? [];
  if (types.length === 0 && subtypes.length === 0) return null;
  if (subtypes.length > 1 && types.length > 0) return null;
  if (spend.alsoAbilities === true) {
    // "Dragon spells or activate abilities of Dragons": plural nouns, as the cards print it.
    const plural = [
      ...subtypes.map(pluralSubtype),
      ...types.map((t) => (subtypes.length > 0 ? t : `${t}s`)),
    ];
    const spells = [...subtypes, ...types].join(' ');
    const owners = plural.join(' or ');
    return `${spells} spells or activate abilities of ${owners}`;
  }
  return null;
}

/**
 * "a red instant or sorcery spell", "an instant spell": the spell a copy rider (D-951) names, as the card prints it: a color, then the card types joined
 * by "or". Null for a rider the words do not cover (creature types, a color choice, the commander).
 */
function copiedSpellWords(spells: {
  readonly types?: readonly string[];
  readonly subtypes?: readonly string[];
  readonly sharesTypeWithCommander?: true;
  readonly commander?: true;
  readonly colors?: readonly string[];
}): string | null {
  if (spells.subtypes !== undefined || spells.sharesTypeWithCommander === true) return null;
  if (spells.commander === true) return null;
  const colors = spells.colors ?? [];
  const names = colors.map((c) => COLOR_NAMES[c]);
  if (names.length > 1 || names.some((n) => n === undefined)) return null;
  const nouns = [...names, ...(spells.types === undefined ? [] : [spells.types.join(' or ')])];
  if (nouns.length === 0) return null;
  const phrase = `${nouns.join(' ')} spell`;
  return `${/^[aeiou]/i.test(phrase) ? 'an' : 'a'} ${phrase}`;
}

/** " If that mana is spent on a Dragon creature spell, it gains haste until end of turn": the rider of a mana ability. */
export function spentRiderText(rider: {
  readonly spells: {
    readonly types?: readonly string[];
    readonly subtypes?: readonly string[];
    readonly sharesTypeWithCommander?: true;
    readonly commander?: true;
    readonly colors?: readonly string[];
  };
  readonly grants:
    | 'haste'
    | { readonly scry: number }
    | { readonly scryCommanderCasts: true }
    | { readonly copySpell: 'may' | 'no' };
}): string | null {
  const { spells, grants } = rider;
  // D-951 (CR 707.10, 707.10c): Pyromancer's Goggles' "When that mana is spent to cast a red instant or sorcery spell, copy that spell and you may choose new targets for the copy".
  if (typeof grants === 'object' && 'copySpell' in grants) {
    const spell = copiedSpellWords(spells);
    if (spell === null) return null;
    const copy = grants.copySpell === 'may' ? ' and you may choose new targets for the copy' : '';
    return `When that mana is spent to cast ${spell}, copy that spell${copy}`;
  }
  // D-229 (CR 903.8): Study Hall's "When you spend this mana to cast your commander, scry X, where X is the number of times it's been cast from the command zone this game".
  if (typeof grants === 'object' && 'scryCommanderCasts' in grants) {
    return "When you spend this mana to cast your commander, scry X, where X is the number of times it's been cast from the command zone this game";
  }
  const nouns = [...(spells.subtypes ?? []), ...(spells.types ?? [])];
  if (nouns.length === 0) return null;
  const phrase = `${nouns.join(' ')} spell`;
  const article = /^[aeiou]/i.test(phrase) ? 'an' : 'a';
  if (grants === 'haste') {
    return spells.sharesTypeWithCommander === true
      ? null
      : `If that mana is spent on ${article} ${phrase}, it gains haste until end of turn`;
  }
  // Group 4 of the Vraska deck (CR 603.2, 701.22a): "When that mana is spent to cast a creature spell that shares a creature type with your commander, scry 1".
  const shares = spells.sharesTypeWithCommander === true;
  return `When that mana is spent to cast ${article} ${phrase}${shares ? ' that shares a creature type with your commander' : ''}, scry ${(grants as { scry: number }).scry}`;
}

/** The reminder of Read ahead (CR 702.155a, 702.155b), for the tooltip of its chip. */
export const READ_AHEAD_REMINDER =
  "As this Saga enters, choose a chapter and start with that many lore counters. Chapters before it don't trigger.";

/** The reminder of Dethrone (CR 702.105a). */
export const DETHRONE_REMINDER =
  'Whenever this creature attacks the player with the most life or tied for most life, put a +1/+1 counter on it.';

/** The reminder of Myriad (CR 702.116a). With two players there is never another opponent, so it does nothing. */
export const MYRIAD_REMINDER =
  'Whenever this creature attacks, for each opponent other than the defending player, you may create a token copy that is tapped and attacking that player. Exile the tokens at end of combat.';

/**
 * "At the beginning of your next end step", "At the beginning of the next upkeep" (CR 603.7): when a delayed triggered ability happens.
 * Null for a step the words do not say with "next" (the combat steps).
 */
export function delayedWords(at: {
  readonly step: TriggerStep | 'nextMain';
  readonly whose: 'you' | 'each';
}): string | null {
  // D-217: "At the beginning of your next main phase".
  if (at.step === 'nextMain') return 'At the beginning of your next main phase';
  if (at.step === 'beginCombat' || at.step === 'combatEnd') return null;
  const words = triggerWording({ kind: 'step', step: at.step, whose: at.whose }, { self: 'it' });
  if (words === null) return null;
  return words.replace(/^(At the beginning of) (?:your|each) /, (_all, head: string) =>
    at.whose === 'you' ? `${head} your next ` : `${head} the next `,
  );
}
