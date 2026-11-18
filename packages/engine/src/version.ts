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
// 114: A cost of no life is payable at a negative life total (D-581, issue 254); a targets decision slot carries the card's own target words (D-582).
// 115: Pay a sacrifice cost of one or more permanents and read the count sacrificed as a cost from the resolving ability (D-583, D-584, issue 258).
// 116: Order interacting life-gain replacements (D-588).
// 117: Remember non-repeating modes for the source object's lifetime (D-590).
// 118: Read current life totals as effect amounts and set a total from such an amount (D-591).
// 119: Read devotion in characteristic-defining toughness abilities (D-592).
// 120: Check gained-and-lost-life turn history (D-593).
// 121: Allow life gained this turn as a mana-value selector limit (D-595).
// 122: Distinguish Ring tempt events that chose a creature as Ring-bearer (D-597).
// 123: Emit and match Class level reached triggers (D-598).
// 124: Allow a dies trigger's delayed trigger to return its trigger card to its owner's hand (D-599).
// 127: Replace a command-zone cast's commander tax with its card-defined life payment (D-605).
// 128: Activate emblem abilities from the command zone (D-606).
// 129: Lock a player's life total and grant temporary protection from everything (D-607).
// 130: Lorehold Spirit deck: discard in a payment, batch discard trigger, cast-only and free play permissions from exile, linked exile filter, damage to itself, a search counted for "this way" and the repeat of an offered search, a free cast from exile that ends on the bottom of the library, a hand-size condition over every player, discard of a whole hand (D-610 to D-624, issue 86).
// 131: Pay a cost that taps an untapped permanent before the mana of the same cost, and in a mana ability (D-625, issue 160).
// 132: Count the opponents with fewer of a stat, discard the whole hand as a cost and search for up to an amount of cards (D-626, issue 160).
// 133: Populate, the choice of a creature token to copy (D-627, issue 160).
// 134: Give every creature back to its owner as layer 2 effects (D-628, issue 160).
// 135: An Aura that enchants a player: its spell targets a player, it enters attached to them and goes to the graveyard when they can no longer be enchanted (D-629, issue 160).
// 136: Additional land plays for a turn, a target slot and a condition about the phase a spell was cast in, mana spent on the chosen creature type, and counters on a commander cast with marked mana (D-630, issues 199, 208, 241, 244).
export const ENGINE_VERSION = 136;
