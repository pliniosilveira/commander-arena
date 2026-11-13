/**
 * The words of group 5 of the Hashaton deck (D-382 to D-385): the exceptions of a token copy ("..., except it's a 4/4 black Zombie"), the kind of card
 * a discard trigger names ("Whenever you discard a creature card"), Eternalize (the chip, the stack and the activation label) and "for each token you control of the chosen type
 * that entered this turn, create a token that's a copy of it". Composed from the engine's data; a shape the words do not cover is left unsaid (`null`), never guessed at.
 * Pure.
 */
import type { Effect, ObjectFilter, TokenSpec } from '@commander-arena/engine';
import { COLOR_NAMES } from './words';

type CopyToken = Extract<TokenSpec, { kind: 'copyOf' }>;

/** The reminder of Eternalize (CR 702.129a), for the tooltip of its chip and the stack. */
export const ETERNALIZE_REMINDER =
  "Exile this card from your graveyard: create a token that's a copy of it, except it's black, it's 4/4, it has no mana cost, and it's a Zombie in addition to its other types. Activate only as a sorcery.";

/** "a Zombie", "an Elf Wizard": the creature types with their article. */
function typesWithArticle(types: readonly string[]): string {
  const words = types.join(' ');
  return `${/^[AEIOU]/u.test(words) ? 'an' : 'a'} ${words}`;
}

/**
 * The exceptions of a copy, as the text says them (CR 707.9b): "it's a 4/4 black Zombie" when the numbers, the colors and the creature types are all given, else one clause for
 * each exception ("it's black", "it's 4/4", "it has no mana cost", "it's a Zombie in addition to its other types"). Empty when the copy has none that change a characteristic.
 */
export function copyExceptionsText(token: CopyToken): string {
  const clauses: string[] = [];
  if (token.setPt !== undefined && token.setColors !== undefined && token.setCreatureTypes) {
    const colors =
      token.setColors.length === 0
        ? 'colorless'
        : token.setColors.map((c) => COLOR_NAMES[c] ?? c).join(' and ');
    clauses.push(
      `it's a ${token.setPt.power}/${token.setPt.toughness} ${colors} ${token.setCreatureTypes.join(' ')}`,
    );
  } else {
    if (token.setColors !== undefined) {
      clauses.push(
        token.setColors.length === 0
          ? "it's colorless"
          : `it's ${token.setColors.map((c) => COLOR_NAMES[c] ?? c).join(' and ')}`,
      );
    }
    if (token.setPt !== undefined)
      clauses.push(`it's ${token.setPt.power}/${token.setPt.toughness}`);
    if (token.setCreatureTypes !== undefined) {
      clauses.push(`it's ${typesWithArticle(token.setCreatureTypes)}`);
    }
  }
  if (token.noManaCost === true) clauses.push('it has no mana cost');
  // Only with another exception: the creature type "in addition" of an older card is worded where that card says it.
  if (clauses.length > 0 && token.addSubtypes !== undefined) {
    clauses.push(`it's ${typesWithArticle(token.addSubtypes)} in addition to its other types`);
  }
  if (clauses.length === 0) return '';
  const last = clauses[clauses.length - 1];
  const list =
    clauses.length === 1
      ? (clauses[0] ?? '')
      : `${clauses.slice(0, -1).join(', ')}, and ${last ?? ''}`;
  return `, except ${list}`;
}

/** "a creature card", "a nonland card", "a card": what a discard trigger names, or null for a filter the words do not cover. */
export function discardedCardWords(filter: ObjectFilter | undefined): string | null {
  if (filter === undefined) return 'a card';
  const { types, notTypes, ...rest } = filter;
  if (Object.keys(rest).length > 0) return null;
  if (types !== undefined && notTypes === undefined && types.length === 1) {
    const kind = types[0] ?? '';
    return `${/^[aeiou]/u.test(kind) ? 'an' : 'a'} ${kind} card`;
  }
  if (notTypes !== undefined && types === undefined && notTypes.length === 1) {
    return `a non${notTypes[0] ?? ''} card`;
  }
  return null;
}

/**
 * "For each token you control of the chosen type that entered this turn, create a token that's a copy of it": a `createCopies` of the tokens of the controller, with no
 * ability added (the Vraska copies add haste and an ability, which this does not word). Null for any other group.
 */
export function copiesOfTokensText(
  effect: Extract<Effect, { kind: 'createCopies' }>,
): string | null {
  if (effect.abilities !== undefined || effect.objects.kind !== 'each') return null;
  const { token, controller, chosenType, enteredThisTurn, ...rest } = effect.objects.filter;
  if (token !== true || controller !== 'you' || Object.keys(rest).length > 0) return null;
  const group = `token you control${chosenType === true ? ' of the chosen type' : ''}${enteredThisTurn === true ? ' that entered this turn' : ''}`;
  return `For each ${group}, create a token that's a copy of it`;
}
