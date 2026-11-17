/** Bump whenever engine behavior changes. Every game state records it (`GameState.engineVersion`). */
// 98: Behold as a spell cost, granted loyalty activation legality (D-529 to D-531).
// 99: Restrict a first-spell trigger to opponent turns (D-565).
// 100: Carry a resolving creature-type choice into the remaining instructions (D-566).
// 101: Let a resolving effect grant activated, triggered or mana abilities until end of turn (D-568).
// 102: Give the promised tapped Fish Gift and select targets for the matching gift branch (D-569).
// 103: Carry resolving choices of objects into later instructions of the same sequence (D-570).
// 104: Read a target's mana-value limit from the graveyard of that target's controller.
// 105: Add temporary must-block requirements and compare them jointly with must-be-blocked attackers.
// 106: Let an effect give control of targeted objects to one targeted player; filter nonattacking objects.
// 107: Preserve the target count that a cast trigger reads when the spell is cast.
// 108: Pay an optional hand-exile spell cost after mana and expose its chosen count to cost reductions (D-575).
// 109: Track the player who declined a playersMay choice for its otherwise effect (D-576).
// 110: Support protection from the Ring-bearer designation and Lord of the Nazgûl's Wraith threshold (D-577).
// 111: Apply Maskwood Nexus's all-creature-types effect to controlled and owned cards (D-578).
// 112: Keep Sauron's Ransom's face-down pile identities private through resolution (D-579).
export const ENGINE_VERSION = 112;
