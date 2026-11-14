/**
 * The words of the Angels slice (D-149), composed from the engine's nodes and never from a card name: the replacements of life
 * gain and of creatures that enter with counters, the "can't" statics ("You have hexproof", "You can't lose the game", a card that
 * can't be cast in the first turns, prevention to the permanent itself, a tax on blocking), the conditions on a turn number, on
 * permanents with the same name, on whom the attackers attacked and on the permanent that triggered an ability, the effects
 * "Proliferate" and "exile until this permanent leaves the battlefield", and the restrictions of mana ("Spend this mana only
 * to cast an Angel spell").
 *
 * A shape the words do not cover gives `null` (the caller drops the whole sentence), never a guess (AGENTS.md "Honesty"). Pure.
 */
import type {
  Ability,
  Cost,
  Effect,
  ManaAbility,
  ObjectFilter,
  Replacement,
  SeatView,
  StaticEffect,
  TargetSpec,
} from '@commander-arena/engine';
import { amountPhrase } from './amount-text';
import { cardinalWord, ordinalWord } from './angels-conditions';
import { asCreatures } from './artifacts-text';
import { activationCostText } from './cost-text';
import { productionWords } from './dinosaurs-text';
import { spendOnDragonWords, spentRiderText } from './dragons-text';
import { thingsPhrase } from './filter-text';
import { manaSpentWords } from './mana-spent-text';
import { COLOR_NAMES } from './words';

type Counted = Extract<Replacement, { kind: 'othersEnterWithCounters' }>['count'];

/** "an additional +1/+1 counter", "2 additional -1/-1 counters". */
function counterWords(counter: string, count: number): string {
  return count === 1
    ? `an additional ${counter} counter`
    : `${count} additional ${counter} counters`;
}

/** "If you would gain life, you gain that much life plus 1 instead." (CR 119.10, D-149): the replacement of every gain of life. */
export function lifeGainBonusWording(amount: number): string {
  return `If you would gain life, you gain that much life plus ${amount} instead`;
}

/**
 * "Each other Angel you control enters with an additional +1/+1 counter on it for each Angel you already control", "Each other
 * creature you control of the chosen type enters with an additional +1/+1 counter on it" (CR 614.1c, 614.12, D-149). Null when the
 * entering permanents or the count cannot be said.
 */
export function othersEnterWithCountersWording(
  replacement: Extract<Replacement, { kind: 'othersEnterWithCounters' }>,
): string | null {
  const { what, counter, count } = replacement;
  const chosen =
    what.chosenType === true
      ? ' of the chosen type'
      : what.chosenColor === true
        ? ' of the chosen color'
        : '';
  const { chosenType: _type, chosenColor: _color, ...plain } = what;
  const group = thingsPhrase(asCreatures(plain), false)?.replace(' on the battlefield', '') ?? null;
  if (group === null) return null;
  // "Each other creature you control of the chosen type": what the permanents have comes after "you control".
  const at = group.indexOf(' you control');
  const subject =
    at < 0 || chosen === ''
      ? `${group}${chosen}`
      : `${group.slice(0, at + 12)}${chosen}${group.slice(at + 12)}`;
  const head = `Each ${subject} enters with`;
  return `${head} ${perCounter(counter, count)}`;
}

/** "an additional +1/+1 counter on it", "... on it for each Angel you already control". Null for a count the words cannot say. */
function perCounter(counter: string, count: Counted): string {
  if (typeof count === 'number') return `${counterWords(counter, count)} on it`;
  // D-183 (CR 601.2h): "for each mana from an artifact source spent to cast it".
  if (count.kind === 'manaSpent') {
    return `${counterWords(counter, 1)} on it for each ${manaSpentWords(count.fromType)}`;
  }
  if (count.kind === 'enteredThisTurn' || count.kind === 'diedThisTurn') {
    return `${counterWords(counter, 1)} on it for each of ${amountPhrase(count).replace(/^the number of /, 'the ')}`;
  }
  const things =
    thingsPhrase(asCreatures(count.filter), false)?.replace(' on the battlefield', '') ?? null;
  if (things === null) return 'an additional counter on it';
  const kind = counterWords(counter, 1);
  // "for each Angel you already control": the permanent that enters is not counted.
  const each = things.replace(' you control', ' you already control');
  return `${kind} on it for each ${each}`;
}

/** "Creatures can't block unless their controller pays {1} for each of those creatures" (CR 509.1b, 509.1d). */
function blockTaxWording(effect: Extract<StaticEffect, { kind: 'blockTax' }>): string {
  const cost = activationCostText(effect.cost);
  const tax = `creatures can't block unless their controller pays ${cost} for each of those creatures`;
  return effect.whileAttacking === true
    ? `As long as this creature is attacking, ${tax}`
    : `${tax.charAt(0).toUpperCase()}${tax.slice(1)}`;
}

/** The scope of "Prevent all combat damage that would be dealt to this creature": the words of `PreventScope`. */
const PREVENT_SCOPE: Readonly<Record<string, string>> = {
  combat: 'all combat damage',
  noncombat: 'all noncombat damage',
  all: 'all damage',
};

/**
 * The sentence of one static of the slice (no condition, no period): the protection and the "can't" statics. Null for any other
 * static, for `cantCastThis` (it needs its condition: `cantCastWording`) and for a scope the words do not know.
 */
export function angelsStaticWording(effect: StaticEffect, noun: string): string | null {
  switch (effect.kind) {
    case 'playerHexproof':
      return 'You have hexproof';
    case 'cantLoseGame':
      return "You can't lose the game";
    case 'opponentsCantWin':
      return "Your opponents can't win the game";
    case 'playerProtection':
      // D-376 (CR 702.16): the card type the permanent chose, or the types the effect names.
      return effect.from === 'chosenCardType'
        ? 'You have protection from the chosen card type'
        : `You have protection from ${effect.types.join(' and ')}`;
    case 'cantGainLife':
      // D-363 (CR 119.7): the opponents of the controller are the only group the engine reads.
      return "Your opponents can't gain life";
    case 'opponentsCantCastOnYourTurn':
      // D-179 (CR 101.2): the condition, if there is one, is said by `conditionalWording`.
      return "Your opponents can't cast spells during your turn";
    case 'preventDamageToThis': {
      const scope = PREVENT_SCOPE[effect.scope];
      return scope === undefined ? null : `Prevent ${scope} that would be dealt to this ${noun}`;
    }
    case 'blockTax':
      return blockTaxWording(effect);
    default:
      return null;
  }
}

/**
 * "You can't cast this card during your first three turns of the game." (CR 101.2, D-149): the static of a card that can't be
 * cast while its condition holds. The condition is part of the sentence ("as long as ..." would read as a lord); only the
 * turn number is said, any other condition gives null.
 */
export function cantCastWording(ability: Extract<Ability, { kind: 'static' }>): string | null {
  if (ability.static.kind !== 'cantCastThis') return null;
  const { condition } = ability;
  if (condition?.kind !== 'ownTurnNumber') return null;
  const { cmp, value } = condition.compare;
  if (cmp === 'atMost') {
    return value === 1
      ? "You can't cast this card during your first turn of the game"
      : `You can't cast this card during your first ${cardinalWord(value)} turns of the game`;
  }
  return cmp === 'atLeast'
    ? `You can't cast this card from your ${ordinalWord(value)} turn of the game on`
    : `You can't cast this card during your ${ordinalWord(value)} turn of the game`;
}

/** "You can't lose the game and your opponents can't win the game": the two statics of one sentence, when both are there. */
export function gameEndSentence(
  abilities: readonly Ability[],
): { readonly text: string; readonly used: ReadonlySet<Ability> } | null {
  const find = (kind: 'cantLoseGame' | 'opponentsCantWin') =>
    abilities.find(
      (a) => a.kind === 'static' && a.condition === undefined && a.static.kind === kind,
    );
  const lose = find('cantLoseGame');
  const win = find('opponentsCantWin');
  if (lose === undefined || win === undefined) return null;
  return {
    text: "You can't lose the game and your opponents can't win the game",
    used: new Set<Ability>([lose, win]),
  };
}

/** "Proliferate" (CR 701.34a): the keyword action, as an instruction. */
export const PROLIFERATE_TEXT = 'Proliferate';

/** The reminder of proliferate, for the dialog that asks the question (CR 701.34a). */
export const PROLIFERATE_REMINDER =
  'Choose any number of permanents and/or players with counters on them, then give each another counter of each kind already there.';

/**
 * "Exile target creature an opponent controls until this enchantment leaves the battlefield", "For each opponent, exile up to
 * one target nonland permanent that player controls until this enchantment leaves the battlefield" (CR 610.3, D-149). `noun`
 * words the permanent with the ability. Null when the slot or the objects cannot be said.
 */
export function exileUntilText(
  effect: Extract<Effect, { kind: 'exile' }>,
  spec: TargetSpec | undefined,
  objects: string,
  self: string,
): string | null {
  if (effect.until === undefined) return null;
  const tail = `until this ${self} leaves the battlefield`;
  if (spec?.onePerOpponent === true) {
    if (spec.what.kind !== 'object') return null;
    const { filter } = spec.what;
    const noun = slotNoun(filter);
    if (noun === null) return null;
    return `For each opponent, exile up to one target ${noun} that player controls ${tail}`;
  }
  return `Exile ${objects} ${tail}`;
}

/** The noun of a slot's filter with its adjectives and what it has: "nonland permanent", "creature with power 4 or greater". */
function slotNoun(filter: ObjectFilter): string | null {
  const { controller: _controller, ...rest } = filter;
  const things = thingsPhrase({ ...rest, controller: 'you' }, false);
  return things === null ? null : things.replace(' you control', '');
}

/** "an Angel spell", "an artifact or creature spell", "an Elf creature spell": the spells restricted mana may pay for. */
function spendOnWords(spend: {
  readonly types?: readonly string[];
  readonly subtypes?: readonly string[];
}): string | null {
  const types = spend.types ?? [];
  const subtypes = spend.subtypes ?? [];
  if (types.length === 0 && subtypes.length === 0) return null;
  // "an Elf creature spell": the pairing of a type and a subtype is read as one noun when each is single.
  if (subtypes.length > 1 && types.length > 0) return null;
  const nouns = [
    ...(subtypes.length > 0 ? [subtypes.join(' or ')] : []),
    ...[types.join(' or ')].filter((t) => t !== ''),
  ];
  const phrase = `${nouns.join(' ')} spell`;
  return `${/^[aeiou]/i.test(phrase) ? 'an' : 'a'} ${phrase}`;
}

/**
 * "{T}: Add {W}. Spend this mana only to cast an Angel spell." and "{T}: Add one mana of the chosen color." (CR 106.6, D-149):
 * a mana ability with a restriction on how its mana is spent, or one that makes mana of the chosen color. Null for any other
 * mana ability, and for a restriction or production the words do not cover.
 */
export function manaRestrictionWording(
  ability: Pick<ManaAbility, 'cost' | 'production' | 'spendOnly' | 'spentRider'>,
): string | null {
  // D-151 (CR 106.1b, 106.6): two mana in any combination of colors, and mana that carries a rider, are said as well.
  const special =
    ability.production.kind === 'chosenColor' || ability.production.kind === 'anyCombination';
  if (ability.spendOnly === undefined && ability.spentRider === undefined && !special) return null;
  const made = productionWords(ability.production);
  if (made === null) return null;
  const cost: readonly Cost[] = ability.cost;
  let text = `${activationCostText(cost)}: Add ${made}`;
  if (ability.spendOnly !== undefined) {
    const spells =
      ability.spendOnly.alsoAbilities === true
        ? spendOnDragonWords(ability.spendOnly)
        : spendOnWords(ability.spendOnly);
    if (spells === null) return null;
    text = `${text}. Spend this mana only to cast ${spells}`;
  }
  if (ability.spentRider !== undefined) {
    const rider = spentRiderText(ability.spentRider);
    if (rider === null) return null;
    text = `${text}. ${rider}`;
  }
  return text;
}

/** The sentences of the mana abilities among `abilities` that this file words, each with its period. */
export function manaRestrictionWordings(abilities: readonly Ability[]): readonly string[] {
  return abilities.flatMap((a) => {
    const text = a.kind === 'mana' ? manaRestrictionWording(a) : null;
    return text === null ? [] : [`${text}.`];
  });
}

/** A restriction on how a mana in a pool may be spent, as the view carries it. */
export type PoolRestriction = NonNullable<SeatView['manaPool'][number]['restriction']>;

/**
 * "Spend only to cast an Angel spell": what restricted mana in a pool can pay for (CR 106.6, D-149), for the tooltip of its symbol.
 * `spellMatch` is a spell of one of the types and of one of the subtypes; `spellTypes` a spell of one of the types; `abilitiesOnly`
 * an activated ability.
 */
export function restrictionWords(restriction: PoolRestriction): string {
  switch (restriction.kind) {
    case 'abilitiesOnly':
      return 'Spend only to activate abilities';
    case 'spellTypes':
      return `Spend only to cast ${restriction.types.join(' or ')} spells`;
    case 'spellMatch': {
      // D-151: "Spend only to cast Dragon spells or activate abilities of Dragons".
      const spells =
        restriction.alsoAbilities === true
          ? spendOnDragonWords(restriction)
          : spendOnWords(restriction);
      return spells === null ? 'Spend only on certain spells' : `Spend only to cast ${spells}`;
    }
  }
}

/** A rider that mana in a pool carries, as the view carries it (D-151). */
export type PoolRider = NonNullable<SeatView['manaPool'][number]['rider']>;

/** "If spent on a Dragon creature spell, it gains haste until end of turn": what mana in a pool does when it is spent (CR 106.6). */
export function riderWords(rider: PoolRider): string {
  const nouns = [...(rider.subtypes ?? []), ...(rider.types ?? [])];
  if (rider.kind === 'copy') {
    // D-328: "When spent to cast a red instant or sorcery spell, copy that spell and you may choose new targets for the copy".
    const colors = (rider.colors ?? []).map((c) => COLOR_NAMES[c] ?? c);
    const spell = [...colors, ...(rider.types === undefined ? [] : [rider.types.join(' or ')])];
    const phrase = `${spell.length === 0 ? '' : `${spell.join(' ')} `}spell`;
    const article = /^[aeiou]/i.test(phrase) ? 'an' : 'a';
    return `When spent to cast ${article} ${phrase}, copy that spell${rider.newTargets === 'may' ? ' and you may choose new targets for the copy' : ''}`;
  }
  if (rider.kind === 'scry') {
    // Group 4 of the Vraska deck (CR 603.2, 701.22a): the scry of the mana a Path of Ancestry makes.
    const shares = rider.sharesTypeWithCommander === true;
    const spell = `${nouns.length === 0 ? '' : `${nouns.join(' ')} `}spell`;
    return `When spent to cast a ${spell}${shares ? ' that shares a creature type with your commander' : ''}, scry ${rider.count ?? 1}`;
  }
  if (nouns.length === 0) return 'It gains haste until end of turn if spent on a spell';
  const phrase = `${nouns.join(' ')} spell`;
  return `If spent on ${/^[aeiou]/i.test(phrase) ? 'an' : 'a'} ${phrase}, it gains haste until end of turn`;
}
