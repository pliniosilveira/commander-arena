/**
 * The sentences of the Peace Offering deck (issue 112) that are one instruction, kept together by the segmenter (`segment.ts`) so that one rule reads them.
 *
 * - Tempt with Bunnies (CR 101.4, 608.2d): "Then each opponent may draw a card and create a 1/1 white Rabbit creature token. For each opponent who does, you draw a card and you create a 1/1
 *   white Rabbit creature token.": the second sentence counts the opponents the first one asked who accepted (`effect.opponents-may-for-each-who-does`).
 * - Tempt with Discovery (CR 701.23, 101.4): "Each opponent may search their library for a land card and put it onto the battlefield. For each opponent who searches a library this way, search
 *   your library for a land card and put it onto the battlefield. Then each player who searched a library this way shuffles.": the second counts the opponents who searched, the third
 *   shuffles every library searched (`effect.opponents-may-search-for-each-who-searches`).
 * - Selvala, Explorer Returned (CR 701.20a, 608.2c): "Each player reveals the top card of their library. For each nonland card revealed this way, add {G} and you gain 1 life. Then each
 *   player draws a card.": the second counts the cards the first revealed, and the third draws them (`effect.each-player-reveals-mana-life-then-draws`).
 * - Fisher's Talent (CR 701.20a, 608.2c): "Look at the top card of your library. You may reveal it if it's a land card. Create a 1/1 blue Fish creature token if you revealed it this
 *   way.": the second reveals the card the first looked at, and the third reads the reveal (`effect.look-top-may-reveal-create-if-revealed`).
 * - Illusionist's Gambit (CR 506.4, 500.8, 508.1c, 508.1d): "Remove all attacking creatures from combat and untap them. After this phase, there is an additional combat phase. Each of those
 *   creatures attacks that combat if able. They can't attack you or planeswalkers you control that combat.": the last two bind the creatures of the first in the combat of the second
 *   (`effect.remove-attackers-attack-again`).
 */

/** Two sentences that are one instruction. */
export const PEACE_OFFERING_PAIR_JOINS: readonly (readonly [RegExp, RegExp])[] = [
  [
    /^(?:then )?each opponent may draw [^.]*\.$/i,
    /^for each opponent who does, you draw [^.]*\.$/i,
  ],
];

/** Three sentences that are one instruction. */
export const PEACE_OFFERING_TRIPLE_JOINS: readonly (readonly [RegExp, RegExp, RegExp])[] = [
  [
    /^each opponent may search their library for [^.]*\.$/i,
    /^for each opponent who searches a library this way, search your library for [^.]*\.$/i,
    /^then each player who searched a library this way shuffles\.$/i,
  ],
  [
    /^each player reveals the top card of their library\.$/i,
    /^for each nonland card revealed this way, add (?:\{[wubrgc]\})+ and you gain \d+ life\.$/i,
    /^then each player draws a card\.$/i,
  ],
  // Fisher's Talent (`effect.look-top-may-reveal-create-if-revealed`).
  [
    /^look at the top card of your library\.$/i,
    /^you may reveal it if it['’]s an? [^.,]* card\.$/i,
    /^create [^.]* if you revealed it this way\.$/i,
  ],
];

/** Four sentences that are one instruction. */
export const PEACE_OFFERING_QUAD_JOINS: readonly (readonly [RegExp, RegExp, RegExp, RegExp])[] = [
  [
    /^remove all attacking creatures from combat and untap them\.$/i,
    /^after this phase, there is an additional combat phase\.$/i,
    /^each of those creatures attacks that combat if able\.$/i,
    /^they can['’]t attack you or planeswalkers you control that combat\.$/i,
  ],
];
