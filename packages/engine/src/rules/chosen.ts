/**
 * Choices made as a permanent enters (D-100): "As this enters, choose a creature type", "choose a
 * color" and (D-376) "choose a card type" (CR 614.12, 614.12a), and what reads them ("of the chosen type", CR 607.2d). The options of
 * each question, the check of an answer, and where the answer is found afterwards. The answer lives on
 * the permanent (`GameObject.chosen`) and is gone when it leaves the battlefield (CR 400.7).
 */
import { CARD_TYPES, COLORS } from '../characteristics';
import { CREATURE_TYPES } from '../data/creature-types';
import { PLANESWALKER_TYPES } from '../data/planeswalker-types';
import type { ObjectId, SeatId } from '../ids';
import type { ChosenValues, GameState } from '../state/types';
import { copiableValues } from './copiable';

export type ChoiceKind =
  | 'creatureType'
  | 'color'
  | 'option'
  | 'cardType'
  | 'planeswalkerType'
  | 'lifePaid'
  | 'player'
  | 'cardName';

/** The option of the question that stands for `seat` (`seat:<n>`), as the other player questions spell it. */
export const playerOption = (seat: SeatId): string => `seat:${seat}`;

/** The seat an option of a `player` choice stands for, or null when it is not one (`seat:<n>`, a whole number). */
export function seatOfOption(option: string): SeatId | null {
  const m = /^seat:(0|[1-9]\d*)$/u.exec(option);
  return m?.[1] === undefined ? null : Number(m[1]);
}

/**
 * The most a name may be: "choose a nonland card name" is free text (the engine has no list of every card), so an answer is any text of one line up to this long; a longer one is no card name
 * (the longest printed names are far shorter).
 */
export const MAX_CARD_NAME_LENGTH = 200;

/**
 * The names the question "choose a nonland card name" suggests (CR 201.2): the nonland cards of the game that every player can see, those on the battlefield, in a graveyard, in exile,
 * on the stack and in the command zone, each once, sorted. A hidden card (a hand, a library) is never listed, so the question tells nothing about it; any name may still be typed.
 * A token, a land, a face-down permanent and a card with no name are left out.
 */
export function visibleNonlandNames(state: GameState): readonly string[] {
  const names = new Set<string>();
  for (const obj of Object.values(state.objects)) {
    if (obj.card === null || obj.token !== null || obj.faceDown !== undefined) continue;
    if (obj.emblem === true || obj.zone === 'hand' || obj.zone === 'library') continue;
    const { name, types } = copiableValues(state, obj).characteristics;
    if (name !== '' && !types.includes('land')) names.add(name);
  }
  return [...names].sort();
}

/** The options of a question, in the fixed order its legal actions follow. */
export function optionsFor(
  what: ChoiceKind,
  named: readonly string[] = [],
  except: string | undefined = undefined,
  /** The life total of the player who pays, for `lifePaid`. */
  life = 0,
  /** The game and the player who chooses, for the questions about the game itself (`player`, `cardName`). */
  game: { readonly state: GameState; readonly seat: SeatId } | undefined = undefined,
): readonly string[] {
  // CR 614.12a: "choose a player" is any player still in the game, the chooser included, in seat order.
  if (what === 'player') {
    if (game === undefined) return [];
    return game.state.seats.flatMap((s, i) => (s.hasLost ? [] : [playerOption(i)]));
  }
  if (what === 'cardName') return game === undefined ? [] : visibleNonlandNames(game.state);
  // CR 119.4, 119.4b: "pay any amount of life": 0 can always be paid, and no more than the life total.
  if (what === 'lifePaid')
    return Array.from({ length: Math.max(life, 0) + 1 }, (_, i) => String(i));
  if (what === 'cardType') return CARD_TYPES;
  // CR 205.3j: "choose a planeswalker type" is one of the planeswalker types the rules list.
  if (what === 'planeswalkerType') return PLANESWALKER_TYPES;
  // Issue 184: "choose a color other than blue" leaves that color out.
  if (what === 'color') return COLORS.filter((c) => c !== except);
  return what === 'creatureType' ? CREATURE_TYPES : what === 'option' ? named : COLORS;
}

/**
 * Two creature type names are the same type. The rules spell two of them with a typographic apostrophe
 * (C’tan, Shi’ar); a card definition may write the plain one, and it is the same type.
 */
export function sameCreatureType(a: string, b: string): boolean {
  return a === b || a.replaceAll('’', "'") === b.replaceAll('’', "'");
}

/** The answer `option` makes to a question, or null when it is not one of its options. */
export function chosenFromOption(
  what: ChoiceKind,
  option: string,
  named: readonly string[] = [],
): ChosenValues | null {
  if (what === 'option') return named.includes(option) ? { option } : null;
  // CR 614.12a: "choose a player" is one of the players the question offered (the caller checks the option list).
  if (what === 'player') {
    const seat = seatOfOption(option);
    return seat === null ? null : { player: seat };
  }
  // CR 201.2: a card name is the exact text; any non-empty one-line text up to `MAX_CARD_NAME_LENGTH` is taken, the engine cannot check it against every card.
  if (what === 'cardName') {
    return option.trim() === '' ||
      option !== option.trim() ||
      option.length > MAX_CARD_NAME_LENGTH ||
      /[\r\n]/u.test(option)
      ? null
      : { cardName: option };
  }
  // CR 119.4 (pay any amount of life): the amount is one of the options the question offered (0 to the life total).
  if (what === 'lifePaid') return named.includes(option) ? { lifePaid: Number(option) } : null;
  if (what === 'creatureType')
    return CREATURE_TYPES.includes(option) ? { creatureType: option } : null;
  if (what === 'planeswalkerType')
    return PLANESWALKER_TYPES.includes(option) ? { planeswalkerType: option } : null;
  // D-376 (CR 205.2a): "choose a card type" is one of the card types the engine models (`CARD_TYPES`).
  if (what === 'cardType') {
    const cardType = CARD_TYPES.find((t) => t === option);
    return cardType === undefined ? null : { cardType };
  }
  const color = COLORS.find((c) => c === option);
  return color === undefined ? null : { color };
}

/**
 * What `source` chose as it entered: read from the object while it is in the game, from its last-known
 * information after it left (CR 113.7a, 608.2h: a triggered ability of a permanent that is gone still
 * reads what it chose). Undefined when nothing was chosen.
 */
export function chosenOf(state: GameState, source: ObjectId | null): ChosenValues | undefined {
  if (source === null) return undefined;
  return (state.objects[source] ?? state.lki[source]?.object)?.chosen;
}
