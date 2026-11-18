/**
 * Bump on every change to what the parser reads or to how a card's support is decided: cached
 * support reports (`SupportReport.parserVersion`, IndexedDB) and `golden.expected.json` are
 * recomputed when it changes. Rule ids are part of that contract: renaming one needs a bump,
 * because ids appear in reports.
 *
 * What each version added: `git log -p -- packages/cards/src/version.ts`, `docs/DECISIONS.md`
 * (one entry per slice) and `docs/MECHANICS.md`.
 */
// 105: Behold costs, granted loyalty abilities and graveyard self-exile activation costs (D-559 to D-561).
// 106: Galadriel deck: scry, the Ring, lands as creatures, exchange of control, buyback, dice (D-528 to D-558).
// 107: Read one-card look-and-take effects with the remaining cards ordered on top or bottom.
// 108: Bind "it phases out" to the earlier targeted creature.
// 109: Read repeated colored spell subjects in cost reductions.
// 110: Read a first-spell trigger during each opponent's turn.
// 111: Choose a creature type as a spell resolves and use it in the following instructions.
// 112: Read "you attack with one or more" through the existing attack-batch trigger.
// 113: Read temporary grants of a quoted triggered ability and return the card a creature became to the battlefield.
// 114: Read the tapped Fish form of Gift and condition target slots on whether Gift was promised.
// 115: Read optional resolving choices of permanents and graveyard cards (D-570).
// 116: Read a target mana-value limit from its controller's graveyard count (D-571).
// 117: Read "They block this turn if able" for the preceding plural creature group (D-572).
// 118: Read player-directed control of target groups and nonattacking creature filters (D-573).
// 119: Read "with one or more targets" and "draw that many" for a cast trigger (D-574).
// 120: Read optional exile-from-hand costs and reductions based on cards exiled that way (D-575).
// 121: Read "Sacrifice one or more artifacts" and "Choose a color. Target player adds N mana of the chosen color for each artifact sacrificed this way" (D-585, D-586, issue 258).
// 122: Read "has ward {N}" as a granted keyword (D-588, issue 89).
// 123: Read "..., and is goaded" of an Aura as the static ability `goaded` (D-589, issue 89).
// 124: Read "has annihilator N" as a granted keyword (D-590, issue 89).
// 125: Read an ability in quotes after what an attached permanent has, and an activated one given to it (D-591, issue 89).
// 126: Read "..., and has [keywords], and it loses all other abilities, card types, and creature types" of an Aura (D-592, issue 89).
// 127: Read "an opponent attacks with creatures", "if two or more of those creatures are attacking you and/or planeswalkers you control" and "that opponent" (D-593, issue 89).
// 128: Read a list of three kinds of spell in a cast trigger (D-594, issue 89).
// 129: Read "Spells you cast that target a creature cost {N} less to cast" (D-595, issue 89).
// 130: Read "spells you cast have affinity for Auras" and "that targets a modified permanent you control" in a cast trigger (D-596, issue 89).
// 131: Read "[group] can't attack you or planeswalkers you control" and "each creature that's enchanted by an Aura you control" (D-597, issue 89).
// 132: Read "a player attacks one of your opponents", "that attacking player", "that opponent" of that trigger and a token "that's attacking that opponent" (D-598, issue 89).
export const PARSER_VERSION = 132;
