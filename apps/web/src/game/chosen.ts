/**
 * The words for "As this enters, choose a creature type / a color" (CR 614.12a, D-100): the color
 * names for the engine's letters and the short and long labels of a permanent's choice, shared by
 * the board tile, the preview panel, the log and the pickers.
 */
import type { Color, ObjectView } from '@commander-arena/engine';
import { riotAnswerText } from './keywords-text';

export const COLOR_NAMES: Readonly<Record<Color, string>> = {
  W: 'White',
  U: 'Blue',
  B: 'Black',
  R: 'Red',
  G: 'Green',
};

/** "Blue" for `U`; an unknown letter is returned as it is. */
export function colorName(letter: string): string {
  return COLOR_NAMES[letter as Color] ?? letter;
}

/** What `option` of a `chooseOption` answer reads as: a creature type as it is, a color by name. */
export function optionText(
  purpose:
    | 'creatureType'
    | 'color'
    | 'cardType'
    | 'attackTarget'
    | 'option'
    | 'effect'
    | 'riot'
    | 'vote',
  option: string,
): string {
  if (purpose === 'color') return colorName(option);
  if (purpose === 'riot') return riotAnswerText(option);
  // D-139 (CR 508.7): "player:1" is a player (seats count from 0), "permanent:o17" a planeswalker or battle.
  if (purpose === 'attackTarget') {
    const seat = /^player:(\d+)$/.exec(option)?.[1];
    return seat === undefined ? 'a permanent' : `player ${Number(seat) + 1}`;
  }
  return option;
}

/** The noun of the choice: "creature type" or "color". */
export function purposeNoun(
  purpose:
    | 'creatureType'
    | 'color'
    | 'cardType'
    | 'attackTarget'
    | 'option'
    | 'effect'
    | 'riot'
    | 'replacement'
    | 'vote'
    | 'meldOrder',
): string {
  if (purpose === 'meldOrder') return 'order of the two cards';
  if (purpose === 'riot') return 'riot choice';
  if (purpose === 'vote') return 'vote';
  if (purpose === 'replacement') return 'effect to apply first';
  if (purpose === 'attackTarget') return 'player or permanent to attack';
  if (purpose === 'option' || purpose === 'effect') return 'option';
  if (purpose === 'cardType') return 'card type';
  return purpose === 'color' ? 'color' : 'creature type';
}

export interface ChosenLabel {
  /** The chip on the tile: "Elf" or "Blue". */
  readonly short: string;
  /** The chip's title: "Chosen type: Elf" or "Chosen color: Blue". */
  readonly title: string;
  /** The preview's row label: "Chosen creature type" or "Chosen color". */
  readonly heading: string;
}

/** The choice made as the permanent entered, or null when it made none (`ObjectView.chosen`). */
export function chosenLabel(object: Pick<ObjectView, 'chosen'>): ChosenLabel | null {
  const { chosen } = object;
  if (chosen === undefined) return null;
  if (chosen.creatureType !== undefined) {
    return {
      short: chosen.creatureType,
      title: `Chosen type: ${chosen.creatureType}`,
      heading: 'Chosen creature type',
    };
  }
  if (chosen.color !== undefined) {
    const name = colorName(chosen.color);
    return { short: name, title: `Chosen color: ${name}`, heading: 'Chosen color' };
  }
  // D-376 (CR 205.2a): "choose a card type" (Serra's Emissary).
  if (chosen.cardType !== undefined) {
    return {
      short: chosen.cardType,
      title: `Chosen card type: ${chosen.cardType}`,
      heading: 'Chosen card type',
    };
  }
  // D-151: a name from the list the card gives, as "choose Khans or Dragons" (the noun is the one `purposeNoun` uses).
  if (chosen.option !== undefined) {
    return {
      short: chosen.option,
      title: `Chosen option: ${chosen.option}`,
      heading: 'Chosen option',
    };
  }
  return null;
}
