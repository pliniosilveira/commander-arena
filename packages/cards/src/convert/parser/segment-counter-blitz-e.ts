/**
 * Sentences of group E of the Counter Blitz deck that are one instruction, kept together by `segment.ts`: the four sentences of the search of Scholar of New Horizons (read by
 * `effect.search-reveal-may-put-else-hand`).
 */
const SEARCH_AND_REVEAL = /^search your library for an? [^.,]+ and reveal it\.$/i;
const IF_OPPONENT_MAY_PUT =
  /^if an opponent [^.,]+, you may put that card onto the battlefield(?: tapped)?\.$/i;
const IF_NOT_PUT_HAND =
  /^if you don['’]t put the card onto the battlefield, put it into your hand\.$/i;
const THEN_SHUFFLE = /^then shuffle\.$/i;

export const COUNTER_BLITZ_E_SEARCH_JOIN: readonly [RegExp, RegExp, RegExp, RegExp] = [
  SEARCH_AND_REVEAL,
  IF_OPPONENT_MAY_PUT,
  IF_NOT_PUT_HAND,
  THEN_SHUFFLE,
];
