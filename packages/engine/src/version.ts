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
// 116: A static ability may give ward; each instance granted is a triggered ability of its own (D-638, issue 89).
// 117: Goad: the effect `goad`, the static ability "is goaded" of an attached permanent and the continuous change `goaded`, read where attackers are declared (D-639, issue 89).
// 118: A static ability may give annihilator; each instance granted is a triggered ability of its own (D-640, issue 89).
// 119: A trigger of an attack batch keeps, for each creature declared, whom it attacked (a player or the controller of a planeswalker), read by the intervening "if" `attackersAtYouAtLeast` (D-643, issue 89).
// 120: The static ability `cantAttackYou` keeps a group of creatures from attacking its controller and their planeswalkers, and the filter `enchantedByYou` (D-647, issue 89).
// 121: The trigger `playerAttacksOpponent`, the selector `triggerAttackedPlayer`, the condition `attackedHasMoreLifeThanOtherOpponent` and `createToken.attacking` (D-648, issue 89).
// 122: The effect `loseHexproofShroud` and its continuous change, read where abilities are derived (D-649, issue 89).
// 123: The filter `attackingOpponents: 'players'` (creatures attacking an opponent as a player) and `except: triggerSubject` of an `each` selector (D-650, issue 89).
// 124: Protection from the chosen color of the permanent that gives it, with the exception that keeps its own Aura attached (D-652, issue 89).
// 125: chooseObjects may require the choice (`exactly`), "put counters on a creature you control" (D-653, issue 89).
// 126: The amount `aurasAttachedToTriggerSubject` and the last-known Auras (D-654), `castFree.filter` and `moveToZone.random` (D-655), the alternative cost of `castFromGraveyard` (D-656), issue 89.
// 127: A delayed return of the Aura card that has the ability (`thisCard`) after "when enchanted creature dies" (D-657, issue 89).
// 128: `revealUntil` may put nothing (D-659), `attach` of the permanent a trigger is about (D-660), the card a `lookAtTop` put onto the battlefield is `moved` (D-658), issue 89.
export const ENGINE_VERSION = 128;
