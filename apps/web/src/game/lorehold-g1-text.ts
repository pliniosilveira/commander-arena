/**
 * The words of group 1 of the Lorehold Spirit deck (issue 86) that need more than a line in a switch: a search of the library said with what it looks for and where the card goes (Claim
 * Jumper). Pure; no DOM.
 */
import type { Effect } from '@commander-arena/engine';
import { filterPhrase } from './trigger-text';

type SearchEffect = Extract<Effect, { kind: 'search' }>;

const WHERE = {
  battlefield: 'onto the battlefield',
  hand: 'into your hand',
  graveyard: 'into your graveyard',
  library: 'on top of your library',
} as const;

/**
 * "You may search your library for a Plains card and put it onto the battlefield tapped": the search of the controller's own library for one card, with the offer when it is the
 * player's choice, where the card goes and, when the effect shuffles, ", then shuffle". Any other search (another player's, several cards, two places) is "Search your library".
 */
export function searchText(effect: SearchEffect): string {
  const [place, ...more] = effect.destinations;
  if (effect.player.kind !== 'you' || effect.max !== 1 || place === undefined || more.length > 0) {
    return 'Search your library';
  }
  // Issue 104 (CR 201.2): "a card named God-Pharaoh's Gift", and (CR 701.23a) the zones the player searches: "graveyard, hand, and/or library".
  const { named, ...rest } = effect.filter;
  const card =
    named === undefined
      ? filterPhrase(effect.filter, 'card')
      : Object.keys(rest).length === 0
        ? `a card named ${named}`
        : null;
  const zones =
    effect.zones === undefined
      ? 'library'
      : effect.zones.length === 2
        ? effect.zones.join(' and/or ')
        : `${effect.zones.slice(0, -1).join(', ')}, and/or ${effect.zones[effect.zones.length - 1]}`;
  if (card === null) return 'Search your library';
  const put = `${place.zone === 'exile' ? 'exile it' : `put it ${WHERE[place.zone]}`}${place.tapped === true ? ' tapped' : ''}`;
  const found = effect.reveal ? `, reveal it and ${put}` : ` and ${put}`;
  return `${effect.optional === true ? 'You may search' : 'Search'} your ${zones} for ${card}${found}${effect.shuffle ? ', then shuffle' : ''}`;
}
