/**
 * The words of the Artifacts slice (D-139), composed from the engine's nodes and never from a card name: looking at the
 * top cards of a library and taking some, "discard two cards unless you discard an artifact card", "tap any number of
 * untapped Myr you control", "this ability costs {1} less to activate for each other artifact you control", "activate
 * only once each turn", a state trigger ("When there are four or more page counters on this artifact"), "during the
 * declare attackers step" and Living weapon's reminder text.
 * A shape the words do not cover gives `null` (or '' where a caller expects a sentence part), never a guess
 * (AGENTS.md "Honesty"). Pure.
 */
import {
  type Ability,
  type Amount,
  type CardType,
  type ChooseSelector,
  type CombatStep,
  type Condition,
  CREATURE_TYPES,
  type Effect,
  type ObjectFilter,
  type PlayerSelector,
  type Trigger,
} from '@commander-arena/engine';
import { amountPhrase, UNKNOWN_AMOUNT } from './amount-text';
import { COMBAT_STEP_WORDS, gameConditionWords } from './condition-text';
import { tappedWhat } from './cost-text';
import { thingsPhrase } from './filter-text';
import { filterPhrase, type TriggerContext, triggerWording, withText } from './trigger-text';

const NUMBER_WORDS: readonly string[] = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
];

/** "creature" for any creature (an artifact creature is "this creature", D-139), else the first card type: "this artifact". */
export function nounOfTypes(types: readonly string[]): string {
  return types.includes('creature') ? 'creature' : (types[0] ?? 'permanent');
}

/** "six" for 6, "12" for 12: a small count in words, as the cards print it. */
export function numberWord(n: number): string {
  return NUMBER_WORDS[n] ?? String(n);
}

const CREATURE_TYPE_SET: ReadonlySet<string> = new Set(CREATURE_TYPES);

/**
 * A filter that names a creature type but no card type ("untapped Myr you control") is read as creatures of that type,
 * so the words say "Myr" and not "Myr permanents" (a creature type only ever describes a creature or a Kindred card,
 * CR 205.3m, 308.3).
 */
export function asCreatures(filter: ObjectFilter): ObjectFilter {
  const subtypes = filter.subtypes ?? [];
  if (filter.types !== undefined || subtypes.length === 0) return filter;
  return subtypes.every((s) => CREATURE_TYPE_SET.has(s))
    ? { ...filter, types: ['creature'] }
    : filter;
}

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
export function isPermanentCard(filter: ObjectFilter): boolean {
  const members = filter.anyOf;
  if (members === undefined || Object.keys(filter).length !== 1) return false;
  const types = members.flatMap((m) => (Object.keys(m).length === 1 ? (m.types ?? []) : []));
  return types.length === members.length && PERMANENT_TYPES.every((t) => types.includes(t));
}

/**
 * "an artifact, creature, enchantment, land, or planeswalker card" (D-397): a list of three or more card types, joined as English joins a list. `cardNoun` of the same
 * filter says "an artifact or creature or enchantment ... card", which is no wording a card prints. Null for any other filter.
 */
function typeListNoun(filter: ObjectFilter): string | null {
  const members = filter.anyOf;
  if (members === undefined || Object.keys(filter).length !== 1 || members.length < 3) return null;
  const types = members.flatMap((m) => (Object.keys(m).length === 1 ? (m.types ?? []) : []));
  if (types.length !== members.length) return null;
  const list = `${types.slice(0, -1).join(', ')}, or ${types[types.length - 1]}`;
  return `${/^[aeiou]/i.test(list) ? 'an' : 'a'} ${list} card`;
}

/**
 * "an artifact card", "a creature card with mana value 3 or less", "a card"; with `many`, "creature cards": the cards a
 * filter names in a hand or a library. Null when a field cannot be said.
 */
export function cardNoun(filter: ObjectFilter, many = false): string | null {
  const phrase = filterPhrase(filter, 'card');
  if (phrase === null) return null;
  const tail = withText(filter);
  const core = phrase.slice(0, phrase.length - tail.length);
  // D-151: "a creature card of the chosen type", not "a creature of the chosen type card".
  const chosen = / of the chosen (?:type|color)$/.exec(core)?.[0] ?? '';
  const bare = chosen === '' ? core : core.slice(0, core.length - chosen.length);
  const noun = bare.endsWith(' card') ? `${bare}${chosen}` : `${bare} card${chosen}`;
  if (!many) return `${noun}${tail}`;
  return `${noun.replace(/^(?:an?|another) /, '')}s${tail}`;
}

/** "Put the rest on the bottom of your library in a random order" / "Put the rest into your graveyard". */
const REST_WORDS: Readonly<Record<'bottomRandom' | 'graveyard' | 'top' | 'bottomChosen', string>> =
  {
    bottomRandom: 'Put the rest on the bottom of your library in a random order',
    // D-324 (CR 401.4): the owner of the cards chooses the order.
    bottomChosen: 'Put the rest on the bottom of your library in any order',
    graveyard: 'Put the rest into your graveyard',
    top: 'Leave the rest on top of your library',
  };

/**
 * "Look at the top six cards of your library. You may reveal an artifact card from among them and put it into your
 * hand. Put the rest on the bottom of your library in a random order" (D-139, CR 701.20): the `lookAtTop` effect. `say`
 * words a count that reads the game (an X defined at the end of the sentence). Null when the filter cannot be said.
 */
export function lookAtTopText(
  effect: Extract<Effect, { kind: 'lookAtTop' }>,
  say: (amount: Amount) => string,
): string | null {
  const { count, take, rest } = effect;
  const top =
    count === 1
      ? 'the top card'
      : `the top ${typeof count === 'number' ? numberWord(count) : say(count)} cards`;
  const one = take.max === 1;
  const plain = Object.keys(take.filter).length === 0;
  // D-397: "a permanent card" and "an artifact, creature, enchantment, land, or planeswalker card" are worded as the cards print them (one card only).
  const special = one
    ? isPermanentCard(take.filter)
      ? 'a permanent card'
      : typeListNoun(take.filter)
    : null;
  let what = special ?? (one ? cardNoun(take.filter) : cardNoun(take.filter, true));
  if (what === null) return null;
  // D-145 (CR 202.3): "with mana value less than or equal to the number of lands you control".
  if (take.manaValueAtMost !== undefined) {
    const limit = amountPhrase(take.manaValueAtMost);
    if (limit === UNKNOWN_AMOUNT) return null;
    what = `${what} with mana value less than or equal to ${limit}`;
  }
  // D-230 (CR 202.3): "any number of nonland permanent cards with total mana value 4 or less".
  if (take.totalManaValue !== undefined) {
    const total = `${what} with total mana value ${take.totalManaValue} or less`;
    return `Look at ${top} of your library. Put any number of ${total} from among them onto the battlefield. ${REST_WORDS[rest]}`;
  }
  const taken = one ? what : `up to ${numberWord(take.max)} ${what}`;
  const them = one ? 'it' : 'them';
  // D-396 (CR 701.20a): "Reveal the top five cards of your library. You may put a creature or enchantment card from among them into your hand."
  if (effect.revealAll === true && take.to === undefined && take.hidden !== true) {
    return `Reveal ${top} of your library. You may put ${taken} from among them into your hand. ${REST_WORDS[rest]}`;
  }
  const look = `Look at ${top} of your library`;
  // D-145 (CR 702.75a, Hideaway): "Exile one of them face down", a card that must be taken.
  if (take.to === 'exileFaceDown') {
    const which = plain && one ? 'one of them' : `${taken} from among them`;
    return `${look}. Exile ${which} face down. ${REST_WORDS[rest]}`;
  }
  // D-324 (CR 701.20a): "Put two of them into your hand", with no reveal.
  if (take.hidden === true) {
    const which =
      plain && one
        ? 'one of them'
        : plain
          ? `${numberWord(take.max)} of them`
          : `${taken} from among them`;
    return `${look}. Put ${which} into your hand. ${REST_WORDS[rest]}`;
  }
  // D-151: one card looked at and put back on top ("If it's a creature card of the chosen type, you may reveal it ...").
  if (rest === 'top' && count === 1 && one && (take.min ?? 0) === 0 && take.to !== 'battlefield') {
    return `${look}. If it's ${what}, you may reveal it and put it into your hand. If you don't, it stays on top of your library`;
  }
  // `min` 1 or more: no "you may", the card is taken whenever there is one.
  const may = (take.min ?? 0) > 0 ? '' : 'You may ';
  const reveal = `${may}${may === '' ? 'Reveal' : 'reveal'} ${taken} from among them`;
  const where =
    take.to === 'battlefield'
      ? `onto the battlefield${take.tapped === true ? ' tapped' : ''}`
      : 'into your hand';
  return `${look}. ${reveal} and put ${them} ${where}. ${REST_WORDS[rest]}`;
}

/** Who answers a discard's alternative: "you discard", "that player discards", "they discard". */
function discarder(player: PlayerSelector): string {
  switch (player.kind) {
    case 'you':
      return 'you discard';
    case 'target':
    case 'controllerOf':
    case 'ownerOf':
    case 'triggerPlayer':
    case 'defendingPlayer':
    case 'giftRecipient':
      return 'that player discards';
    default:
      return 'they discard';
  }
}

/**
 * " unless you discard an artifact card" (D-139, CR 701.9): the single card of a kind that may be discarded instead of
 * the count. '' for a discard without one; null when the filter cannot be said.
 */
export function discardUnlessTail(effect: Extract<Effect, { kind: 'discard' }>): string | null {
  if (effect.unless === undefined) return '';
  const card = cardNoun(effect.unless);
  return card === null ? null : ` unless ${discarder(effect.player)} ${card}`;
}

/**
 * "You may tap any number of untapped Myr you control", "Tap two untapped creatures you control" (D-139, CR 701.26a):
 * a `tap` of permanents the controller chooses. Null when the filter cannot be said.
 */
export function tapChooseText(selector: ChooseSelector): string | null {
  const filter = asCreatures(selector.filter);
  if (selector.anyNumber === true) {
    const things = thingsPhrase({ ...filter, tapped: false, controller: 'you' }, true);
    return things === null ? null : `You may tap any number of ${things}`;
  }
  const count = selector.count ?? 1;
  return typeof count === 'number' ? `Tap ${tappedWhat(filter, count)}` : null;
}

/**
 * "Untap up to three lands" (D-216, CR 701.26a): an `untap` of permanents the controller chooses, none up to the count. Null when the filter
 * cannot be said.
 */
export function untapChooseText(selector: ChooseSelector): string | null {
  const count = selector.count ?? 1;
  if (typeof count !== 'number') return null;
  const things = thingsPhrase(selector.filter, true);
  // Any player's permanents: the place of a filter with no controller is not said ("lands", not "lands on the battlefield").
  return things === null
    ? null
    : `Untap up to ${numberWord(count)} ${things.replace(/ on the battlefield$/, '')}`;
}

/**
 * The card of "You may put a land card from among them into your hand" (D-411): "a permanent card", a list of types, or two kinds with limits of their own, "a Plains card or a
 * creature card with mana value 3 or less" (each member of the choice is said whole, so a limit is never dropped). Null when the filter cannot be said.
 */
function fromAmongNoun(kind: ObjectFilter): string | null {
  if (isPermanentCard(kind)) return 'a permanent card';
  const members = kind.anyOf;
  if (
    members !== undefined &&
    Object.keys(kind).length === 1 &&
    members.some((m) => m.manaValue !== undefined)
  ) {
    const parts = members.map((m) => cardNoun(m));
    return parts.every((p): p is string => p !== null) ? parts.join(' or ') : null;
  }
  return typeListNoun(kind) ?? cardNoun(kind);
}

/**
 * "You may put an artifact card from your hand onto the battlefield", "Put a creature card from your graveyard onto the
 * battlefield tapped" (D-139): a `moveToZone` of a card the controller chooses in their hand or graveyard. Null for any
 * other choice, or a filter that cannot be said.
 */
export function chosenCardMoveText(effect: Extract<Effect, { kind: 'moveToZone' }>): string | null {
  const { objects } = effect;
  // D-411 (CR 608.2d): "You may put a land card from among them into your hand": a choice among the cards the mill before it put into the graveyard.
  if (objects.kind === 'choose' && objects.fromMoved === true && effect.to === 'hand') {
    const { zone: _zone, controller: _owner, ...kind } = objects.filter;
    const noun = fromAmongNoun(kind);
    if (noun === null) return null;
    return `${objects.optional === true ? 'You may put' : 'Put'} ${noun} from among them into your hand`;
  }
  if (objects.kind !== 'choose' || effect.to !== 'battlefield') return null;
  const { zone, controller: _controller, ...rest } = objects.filter;
  if (zone !== 'hand' && zone !== 'graveyard') return null;
  const card = cardNoun(rest);
  if (card === null) return null;
  const count = objects.count ?? 1;
  if (typeof count !== 'number') return null;
  const what = count === 1 ? card : `${numberWord(count)} ${cardNoun(rest, true) ?? card}`;
  const head = objects.optional === true ? 'You may put' : 'Put';
  return `${head} ${what} from your ${zone} onto the battlefield${effect.tapped === true ? ' tapped' : ''}`;
}

/**
 * " This ability costs {1} less to activate for each other artifact you control." (D-139, CR 601.2f): an activated
 * ability's `costReducedBy`. '' when it has none, or its amount cannot be said.
 */
export function costReducedByNote(
  ability: Pick<Extract<Ability, { kind: 'activated' }>, 'costReducedBy'>,
): string {
  const amount = ability.costReducedBy?.amount;
  if (amount === undefined) return '';
  let generic = 1;
  let counted: Amount = amount;
  if (typeof amount === 'object' && amount.kind === 'multiple') {
    generic = amount.factor;
    counted = amount.of;
  }
  if (typeof counted === 'object' && counted.kind === 'countOf') {
    const each = thingsPhrase(asCreatures(counted.filter), false);
    if (each === null) return '';
    return ` This ability costs {${generic}} less to activate for each ${each}.`;
  }
  const phrase = amountPhrase(amount);
  return phrase === UNKNOWN_AMOUNT
    ? ''
    : ` This ability costs {X} less to activate, where X is ${phrase}.`;
}

/** " Activate only once each turn." (CR 602.5b, D-139), or ''. */
export function oncePerTurnNote(
  ability: Pick<Extract<Ability, { kind: 'activated' }>, 'oncePerTurn'>,
): string {
  return ability.oncePerTurn === true ? ' Activate only once each turn.' : '';
}

/**
 * The condition of a state trigger (CR 603.8, D-139) as a sentence start: "When there are four or more page counters on
 * this artifact", "When you have 30 or more life". `self` is the noun of the permanent ("artifact"). Null when the
 * condition cannot be said.
 */
export function stateTriggerWording(condition: Condition, self: string): string | null {
  if (
    condition.kind === 'amountIs' &&
    typeof condition.amount === 'object' &&
    condition.amount.kind === 'countersOn' &&
    condition.amount.of.kind === 'this'
  ) {
    const { value, cmp } = condition.compare;
    const counter = condition.amount.counter;
    const where = `on this ${self}`;
    if (cmp === 'atLeast') {
      return `When there are ${numberWord(value)} or more ${counter} counters ${where}`;
    }
    const many = `${counter} counter${value === 1 ? '' : 's'}`;
    if (cmp === 'equal') {
      return `When there ${value === 1 ? 'is' : 'are'} exactly ${numberWord(value)} ${many} ${where}`;
    }
  }
  const words = gameConditionWords(condition, { self });
  return words === null ? null : `When ${words}`;
}

/**
 * The full words of a trigger: `triggerWording`, with the state trigger worded from its condition (which
 * `trigger-text.ts` cannot read: `condition-text.ts` imports it). `noun` is the source's card type for "this artifact".
 */
export function triggerWords(trigger: Trigger, ctx: TriggerContext, noun: string): string | null {
  if (trigger.kind === 'state') return stateTriggerWording(trigger.condition, noun);
  return triggerWording(trigger, ctx);
}

/** " during the declare attackers step" (D-139, CR 506.1): an enters trigger's `duringStep` condition. */
export function duringStepPhrase(step: CombatStep): string {
  return ` during the ${COMBAT_STEP_WORDS[step]}`;
}

/**
 * Living weapon's reminder text (CR 702.92a): what the keyword means, for the rules in words of an Equipment that has it.
 */
export const LIVING_WEAPON_REMINDER =
  'Living weapon (When this Equipment enters, create a 0/0 black Phyrexian Germ creature token, then attach this Equipment to it.)';

/** Job select's reminder text (CR 702.182a, D-206). */
export const JOB_SELECT_REMINDER =
  'Job select (When this Equipment enters, create a 1/1 colorless Hero creature token, then attach this to it.)';

/** True when the abilities have Job select (CR 702.182). */
export function hasJobSelect(abilities: readonly Ability[]): boolean {
  return abilities.some((a) => a.kind === 'keyword' && a.keyword.kind === 'jobSelect');
}

/** True when the abilities have Living weapon (CR 702.92). */
export function hasLivingWeapon(abilities: readonly Ability[]): boolean {
  return abilities.some((a) => a.kind === 'keyword' && a.keyword.kind === 'livingWeapon');
}

/**
 * The first effect of a kind inside an effect, looking through sequences, conditions, "may" and reflexive triggers:
 * where a decision's words find the instruction that asks it (D-139).
 */
export function findEffect<K extends Effect['kind']>(
  effect: Effect,
  kind: K,
): Extract<Effect, { kind: K }> | null {
  if (effect.kind === kind) return effect as Extract<Effect, { kind: K }>;
  switch (effect.kind) {
    case 'sequence':
      for (const part of effect.effects) {
        const found = findEffect(part, kind);
        if (found !== null) return found;
      }
      return null;
    case 'conditional':
      return (
        findEffect(effect.effect, kind) ??
        (effect.else === undefined ? null : findEffect(effect.else, kind))
      );
    case 'may':
    case 'reflexive':
      return findEffect(effect.effect, kind);
    default:
      return null;
  }
}
