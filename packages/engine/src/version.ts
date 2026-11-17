/** Bump whenever engine behavior changes. Every game state records it (`GameState.engineVersion`). */
// 98: Behold as a spell cost, granted loyalty activation legality (D-529 to D-531).
// 99: Restrict a first-spell trigger to opponent turns (D-535).
// 100: Carry a resolving creature-type choice into the remaining instructions (D-536).
// 101: Let a resolving effect grant activated, triggered or mana abilities until end of turn (D-538).
// 102: Give the promised tapped Fish Gift and select targets for the matching gift branch (D-539).
// 103: Carry resolving choices of objects into later instructions of the same sequence (D-540).
// 104: Read a target's mana-value limit from the graveyard of that target's controller.
// 105: Add temporary must-block requirements and compare them jointly with must-be-blocked attackers.
// 106: Let an effect give control of targeted objects to one targeted player; filter nonattacking objects.
// 107: Preserve the target count that a cast trigger reads when the spell is cast.
// 108: Pay an optional hand-exile spell cost after mana and expose its chosen count to cost reductions (D-545).
// 109: Track the player who declined a playersMay choice for its otherwise effect (D-546).
export const ENGINE_VERSION = 109;
