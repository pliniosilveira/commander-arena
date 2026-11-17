/** Bump whenever engine behavior changes. Every game state records it (`GameState.engineVersion`). */
// 98: Behold as a spell cost, granted loyalty activation legality (D-559 to D-561).
// 99: Galadriel deck: exchange of control, buyback, dice, restrictions on activated abilities and the rest of D-528 to D-558.
// 100: Restrict a first-spell trigger to opponent turns (D-565).
// 101: Carry a resolving creature-type choice into the remaining instructions (D-566).
// 102: Let a resolving effect grant activated, triggered or mana abilities until end of turn (D-568).
// 103: Give the promised tapped Fish Gift and select targets for the matching gift branch (D-569).
// 104: Carry resolving choices of objects into later instructions of the same sequence (D-570).
// 105: Read a target's mana-value limit from the graveyard of that target's controller.
// 106: Add temporary must-block requirements and compare them jointly with must-be-blocked attackers.
// 107: Let an effect give control of targeted objects to one targeted player; filter nonattacking objects.
// 108: Preserve the target count that a cast trigger reads when the spell is cast.
// 109: Pay an optional hand-exile spell cost after mana and expose its chosen count to cost reductions (D-575).
// 110: Track the player who declined a playersMay choice for its otherwise effect (D-576).
// 111: Support protection from the Ring-bearer designation and Lord of the Nazgûl's Wraith threshold (D-577).
// 112: Apply Maskwood Nexus's all-creature-types effect to controlled and owned cards (D-578).
// 113: Keep Sauron's Ransom's face-down pile identities private through resolution (D-579).
// 114: A cost of no life is payable at a negative life total; target slots carry target words (D-581, D-582).
// 115: Order interacting life-gain replacements (D-583).
// 116: Remember non-repeating modes for the source object's lifetime (D-585).
// 117: Read current life totals as effect amounts and set a total from such an amount (D-586).
// 118: Read devotion in characteristic-defining toughness abilities (D-587).
// 119: Check gained-and-lost-life turn history (D-588).
// 120: Allow life gained this turn as a mana-value selector limit (D-590).
// 121: Distinguish Ring tempt events that chose a creature as Ring-bearer (D-592).
// 122: Emit and match Class level reached triggers (D-593).
// 123: Allow a dies trigger's delayed trigger to return its trigger card to its owner's hand (D-594).
// 126: Replace a command-zone cast's commander tax with its card-defined life payment (D-600).
// 127: Activate emblem abilities from the command zone (D-601).
// 128: Lock a player's life total and grant temporary protection from everything (D-602).
export const ENGINE_VERSION = 128;
