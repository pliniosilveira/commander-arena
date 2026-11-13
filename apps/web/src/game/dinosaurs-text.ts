/**
 * The words of the Dinosaurs slice (D-145), composed from the engine's nodes and never from a card name: Escalate and
 * Hideaway reminders, a mana ability that makes other mana "instead", Fight, "reveal cards until ...", casting or playing
 * without paying the mana cost, prevention by the kind of source, damage divided as the spell is cast, and the line each
 * target of a divided spell reads on the stack.
 *
 * A shape the words do not cover gives `null` (the caller drops the whole instruction), never a guess (AGENTS.md "Honesty"). Pure.
 */
import type {
  Ability,
  ChosenTarget,
  Cost,
  Effect,
  ManaAbility,
  ManaProduction,
  ObjectFilter,
  ObjectSelector,
  TargetSpec,
} from '@commander-arena/engine';
import { cardNoun, numberWord } from './artifacts-text';
import { gameConditionWords } from './condition-text';
import { activationCostText } from './cost-text';
import { anyCombinationWords } from './dragons-text';
import { thingsPhrase } from './filter-text';
import { filterPhrase } from './trigger-text';

/** Escalate's reminder (CR 702.120a): what the keyword means, for the tooltip of its chip. */
export const ESCALATE_REMINDER = 'Pay this cost for each mode chosen beyond the first.';

/**
 * The escalate cost a spell's Oracle text prints, as mana symbols ("Escalate {1}{G}" gives `['1', 'G']`); null for a text with none.
 * The view carries no abilities of a spell, so the modes dialog reads the cost here (CR 702.120a: mana only).
 */
export function escalateCostOf(oracleText: string): readonly string[] | null {
  const found = /\bescalate\s*((?:\{[^}]+\})+)/i.exec(oracleText);
  if (found === null) return null;
  return [...(found[1] ?? '').matchAll(/\{([^}]+)\}/g)].flatMap((m) =>
    m[1] === undefined ? [] : [m[1]],
  );
}

/**
 * The mana of `times` payments of a cost, as the symbols print: two payments of {1}{G} are {2}{G}{G} (the generic parts add up).
 * '' for none.
 */
export function repeatedCost(symbols: readonly string[], times: number): string {
  if (times <= 0) return '';
  const generic = symbols.reduce((sum, s) => sum + (/^\d+$/.test(s) ? Number(s) : 0), 0) * times;
  const colored = symbols.filter((s) => !/^\d+$/.test(s));
  const repeated = Array.from({ length: times }, () => colored).flat();
  return `${generic > 0 ? `{${generic}}` : ''}${repeated.map((s) => `{${s}}`).join('')}`;
}

/** Hideaway's reminder (CR 702.75a): the enters trigger, and who may look at the exiled card. */
export function hideawayReminder(count: number): string {
  return `When this permanent enters, look at the top ${numberWord(count)} cards of your library. Exile one of them face down and put the rest on the bottom of your library in a random order. The player who controls the permanent may look at the exiled card.`;
}

/** "one mana of any color", "two mana of any one color", "{G}{G}": what a mana production makes; null for the other kinds. */
export function productionWords(production: ManaProduction): string | null {
  switch (production.kind) {
    case 'fixed':
      return production.mana.length === 0 ? null : production.mana.map((m) => `{${m}}`).join('');
    case 'anyColor': {
      const count = production.count ?? 1;
      return count === 1 ? 'one mana of any color' : `${numberWord(count)} mana of any one color`;
    }
    case 'commanderIdentity':
      // CR 903.4: "Add one mana of any color in your commander's color identity".
      return "one mana of any color in your commander's color identity";
    case 'chosenColor':
      // D-149 (CR 106.1, 614.12): "Add one mana of the chosen color".
      return 'one mana of the chosen color';
    case 'anyCombination':
      // D-151 (CR 106.1b): "Add two mana in any combination of colors".
      return anyCombinationWords(production.count, production.distinct === true);
    default:
      return null;
  }
}

/**
 * "{T}: Add one mana of any color. If you control a creature with power 4 or greater, add two mana of any one color
 * instead." (D-145, CR 605.3b): a mana ability whose production changes while a condition holds. Null for a mana ability
 * without `instead` (the card's own text says it), or one whose cost, production or condition the words cannot say.
 */
export function manaInsteadWording(
  ability: Pick<ManaAbility, 'cost' | 'production' | 'instead'>,
): string | null {
  const { instead } = ability;
  if (instead === undefined) return null;
  const plain = productionWords(ability.production);
  const better = productionWords(instead.production);
  const when = gameConditionWords(instead.condition);
  if (plain === null || better === null || when === null) return null;
  const cost: readonly Cost[] = ability.cost;
  return `${activationCostText(cost)}: Add ${plain}. If ${when}, add ${better} instead`;
}

/** The sentences of the mana abilities among `abilities` that make other mana "instead" (D-145), each with its period. */
export function manaInsteadWordings(abilities: readonly Ability[]): readonly string[] {
  return abilities.flatMap((a) => {
    const text = a.kind === 'mana' ? manaInsteadWording(a) : null;
    return text === null ? [] : [`${text}.`];
  });
}

/** The nouns a "fights" sentence needs from its caller: the words for one object, and for a group of them. */
export interface FightWords {
  readonly object: (what: ObjectSelector) => string;
}

/**
 * "Target creature you control fights target creature you don't control." and, with `pairing`, "Each of them fights a
 * different one of the creatures an opponent controls." (D-145, CR 701.14). Null when the group cannot be said.
 */
export function fightText(
  effect: Extract<Effect, { kind: 'fight' }>,
  words: FightWords,
): string | null {
  const { fighters, against } = effect;
  if (effect.pairing === undefined) {
    const who = words.object(fighters);
    return `${who.charAt(0).toUpperCase()}${who.slice(1)} fights ${words.object(against)}`;
  }
  if (against.kind !== 'each') return null;
  // The creatures are read as the effect begins, so a plural group is said, not "each".
  const group = thingsPhrase(against.filter, true)?.replace(' on the battlefield', '') ?? null;
  if (group === null) return null;
  const each = fighters.kind === 'moved' ? 'Each of them' : `Each of ${words.object(fighters)}`;
  return `${each} fights a different one of the ${group}`;
}

/**
 * "Reveal cards from the top of your library until you reveal a land card. Put it onto the battlefield tapped and the
 * rest on the bottom of your library in a random order." (D-145, CR 701.20). Null when the filter cannot be said.
 */
export function revealUntilText(effect: Extract<Effect, { kind: 'revealUntil' }>): string | null {
  const card = cardNoun(effect.filter);
  if (card === null) return null;
  const where =
    effect.put === 'hand'
      ? 'into your hand'
      : `onto the battlefield${effect.tapped === true ? ' tapped' : ''}`;
  return `Reveal cards from the top of your library until you reveal ${card}. Put it ${where} and the rest on the bottom of your library in a random order`;
}

/**
 * "You may cast a spell with mana value 5 or less from your hand without paying its mana cost", "You may play the exiled card
 * without paying its mana cost" (D-145, CR 608.2g, 118.9): a `castFree`. Null when the cards cannot be said.
 */
export function castFreeText(effect: Extract<Effect, { kind: 'castFree' }>): string | null {
  const verb = effect.play === true ? 'play' : 'cast';
  const { objects } = effect;
  let what: string;
  let from = '';
  switch (objects.kind) {
    case 'moved':
      what = 'it';
      break;
    case 'linkedExile':
      what = 'the exiled card';
      break;
    case 'choose': {
      const { zone, controller: _controller, notTypes, ...rest } = objects.filter;
      if (zone !== 'hand') return null;
      // A spell is never a land: "a spell with mana value 5 or less". A card to play may be a land.
      const kept =
        effect.play === true || notTypes === undefined
          ? { ...rest, ...(notTypes === undefined ? {} : { notTypes }) }
          : { ...rest, ...(notTypes.length === 1 && notTypes[0] === 'land' ? {} : { notTypes }) };
      const phrase = filterPhrase(kept as ObjectFilter, effect.play === true ? 'card' : 'spell');
      if (phrase === null) return null;
      what = phrase;
      from = ' from your hand';
      break;
    }
  }
  return `You may ${verb} ${what}${from} without paying its mana cost`;
}

/** The scope words of a prevention: "all combat damage", "all damage", "all noncombat damage". */
const SCOPE_WORDS = {
  all: 'all damage',
  combat: 'all combat damage',
  noncombat: 'all noncombat damage',
} as const;

/**
 * "Prevent all combat damage that would be dealt this turn by non-Spider creatures." (D-145, CR 615.1): a `preventDamage`
 * by the kind of source. Null for any other prevention (not said here) or a group the words cannot say.
 */
export function preventByFilterText(
  effect: Extract<Effect, { kind: 'preventDamage' }>,
): string | null {
  const { byFilter } = effect;
  if (byFilter === undefined || effect.amount !== 'all' || effect.to.kind !== 'any') return null;
  const group = thingsPhrase(byFilter, true)?.replace(' on the battlefield', '') ?? null;
  if (group === null) return null;
  return `Prevent ${SCOPE_WORDS[effect.scope]} that would be dealt this turn by ${group}`;
}

/**
 * "Double the power and toughness of each creature you control until end of turn." (D-145, CR 701.10): a `modifyPt` whose
 * amounts are the stat of the creature it is for. `of` is the words of the creatures; null when the effect is any other.
 */
export function doublePtText(
  effect: Extract<Effect, { kind: 'modifyPt' }>,
  of: string,
): string | null {
  const doubled = (amount: typeof effect.power, stat: 'power' | 'toughness'): boolean =>
    typeof amount === 'object' && amount.kind === 'affected' && amount.stat === stat;
  const power = doubled(effect.power, 'power');
  const toughness = doubled(effect.toughness, 'toughness');
  const none = (amount: typeof effect.power): boolean => amount === 0;
  const until = effect.duration === 'untilEndOfTurn' ? ' until end of turn' : '';
  if (power && toughness) return `Double the power and toughness of ${of}${until}`;
  if (power && none(effect.toughness)) return `Double the power of ${of}${until}`;
  if (toughness && none(effect.power)) return `Double the toughness of ${of}${until}`;
  return null;
}

/** "one", "one or two", "one, two or three": the numbers from `min` to `max`, as the cards print a range of targets. */
function rangeWords(min: number, max: number): string {
  const numbers = Array.from({ length: max - min + 1 }, (_, i) => numberWord(min + i));
  return numbers.length <= 2
    ? numbers.join(' or ')
    : `${numbers.slice(0, -1).join(', ')} or ${numbers[numbers.length - 1]}`;
}

/**
 * "any number of target creatures", "one or two target creatures" (D-145, CR 601.2d): the targets a divided spell names,
 * from the plural of the slot's own words (`noun`: "creatures an opponent controls"). `max` left out is any number.
 */
export function dividedTargetsText(spec: TargetSpec, plural: string): string {
  const min = spec.min ?? 0;
  if (spec.max === undefined)
    return `${min === 0 ? 'any number of' : `${numberWord(min)} or more`} ${plural}`;
  return `${rangeWords(Math.max(min, 1), spec.max)} ${plural}`;
}

/**
 * The plural words of what a slot targets: "target creatures", "target creatures an opponent controls", "targets" (any
 * target). Null for a filter the words cannot say.
 */
export function targetsPlural(spec: TargetSpec): string | null {
  switch (spec.what.kind) {
    case 'anyTarget':
      return 'targets';
    case 'playerOrObject':
    case 'objectOrGraveyardCard':
      return null;
    case 'player':
      return spec.what.filter === 'opponent' ? 'target opponents' : 'target players';
    case 'object': {
      const things = thingsPhrase(spec.what.filter, true)?.replace(' on the battlefield', '');
      return things === undefined || things === null ? null : `target ${things}`;
    }
  }
}

/**
 * "Deal X damage divided as you choose among any number of target creatures" (D-145, CR 601.2d): the `dealDividedDamage`
 * effect with the slot it names. `total` is how the total is said (a number, or X defined at the end of the sentence).
 */
export function dividedDamageText(spec: TargetSpec | undefined, total: string): string | null {
  if (spec === undefined) return null;
  const plural = targetsPlural(spec);
  return plural === null
    ? null
    : `Deal ${total} damage divided as you choose among ${dividedTargetsText(spec, plural)}`;
}

/**
 * "3 damage to Goblin, 2 damage to Elf": the shares a divided spell on the stack gives its targets, in the order chosen. `name`
 * words a target ("You", a creature's name). Null when no target carries a share (the spell divides nothing).
 */
export function sharesText(
  targets: readonly ChosenTarget[],
  name: (target: ChosenTarget) => string,
): string | null {
  const shared = targets.filter((t) => t.share !== undefined);
  if (shared.length === 0) return null;
  return shared.map((t) => `${t.share} damage to ${name(t)}`).join(', ');
}
