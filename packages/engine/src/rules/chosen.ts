/**
 * Choices made as a permanent enters (D-100): "As this enters, choose a creature type", "choose a
 * color" and (D-376) "choose a card type" (CR 614.12, 614.12a), and what reads them ("of the chosen type", CR 607.2d). The options of
 * each question, the check of an answer, and where the answer is found afterwards. The answer lives on
 * the permanent (`GameObject.chosen`) and is gone when it leaves the battlefield (CR 400.7).
 */
import { CARD_TYPES, COLORS } from '../characteristics';
import { CREATURE_TYPES } from '../data/creature-types';
import { PLANESWALKER_TYPES } from '../data/planeswalker-types';
import type { ObjectId } from '../ids';
import type { ChosenValues, GameState } from '../state/types';

export type ChoiceKind =
  | 'creatureType'
  | 'color'
  | 'option'
  | 'cardType'
  | 'planeswalkerType'
  | 'lifePaid'
  | 'player';

/** The options of a question, in the fixed order its legal actions follow. */
export function optionsFor(
  what: ChoiceKind,
  named: readonly string[] = [],
  except: string | undefined = undefined,
  /** The life total of the player who pays, for `lifePaid`. */
  life = 0,
): readonly string[] {
  // CR 119.4, 119.4b: "pay any amount of life": 0 can always be paid, and no more than the life total.
  // CR 614.12a: "choose a player" is one of the players in the game, the options (`seat:<n>`) the caller names (`playerOptions`).
  if (what === 'player') return named;
  if (what === 'lifePaid')
    return Array.from({ length: Math.max(life, 0) + 1 }, (_, i) => String(i));
  // Cloud Key (CR 205.2a): a card type choice may list the types it offers; with none listed every card type is offered.
  if (what === 'cardType') return named.length > 0 ? named : CARD_TYPES;
  // CR 205.3j: "choose a planeswalker type" is one of the planeswalker types the rules list.
  if (what === 'planeswalkerType') return PLANESWALKER_TYPES;
  // Issue 184: "choose a color other than blue" leaves that color out.
  if (what === 'color') return COLORS.filter((c) => c !== except);
  return what === 'creatureType' ? CREATURE_TYPES : what === 'option' ? named : COLORS;
}

/** The options of "choose a player": every player still in the game, in turn order from the first seat, as `seat:<n>` (CR 614.12a, 800.4a: a player who has left cannot be chosen). */
export function playerOptions(state: GameState): readonly string[] {
  return state.seats.flatMap((s) => (s.hasLost ? [] : [`seat:${s.id}`]));
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
  // CR 614.12a: the player chosen is one of the options offered, `seat:<n>`.
  if (what === 'player') {
    const seat = /^seat:(\d+)$/u.exec(option)?.[1];
    return named.includes(option) && seat !== undefined ? { player: Number(seat) } : null;
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
