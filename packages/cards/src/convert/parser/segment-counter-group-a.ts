/**
 * Sentences of the Final Fantasy X counter group (Together Forever) that `segment.ts` keeps together: "Choose target creature with a counter on it." names the creature and "When that creature
 * dies this turn, return that card to its owner's hand." is the delayed triggered ability about it, so the two are one instruction (`effect.choose-target-dies-return`).
 */
export const CHOOSE_TARGET_CREATURE =
  /(?:^|: )choose target creature(?: with a counter on it)?\.$/i;
export const WHEN_THAT_CREATURE_DIES_RETURN =
  /^when that creature dies this turn, return that card to its owner['’]s hand\.$/i;
