/**
 * Sentences of group C of the Counter Blitz deck that are one instruction, kept together by `segment.ts` (each pair is the first sentence and the one that says what is done with what it chose).
 */

/** "Each opponent chooses a creature with the greatest mana value among creatures they control. Return those creatures to their owners' hands." (Summon: Valefor, CR 608.2d, 101.4): read by `effect.each-opponent-chooses-return`. */
const EACH_OPPONENT_CHOOSES = /^each opponent chooses an? [^.,]+ they control\.$/i;
const RETURN_THOSE_TO_HANDS = /^return those [^.,]+ to their owners['’] hands\.$/i;

export const COUNTER_BLITZ_C_JOINS: readonly (readonly [RegExp, RegExp])[] = [
  [EACH_OPPONENT_CHOOSES, RETURN_THOSE_TO_HANDS],
];
