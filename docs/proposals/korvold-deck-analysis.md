# Korvold deck: analysis of the 45 cards the engine did not run

Status: analysis; slice 7a (three of the four cards of slice 7) is DONE (section 3.7, branch `m56-korvold-singles`, stacked on slice 6, D-187 and D-188, `ENGINE_VERSION` 42, `PARSER_VERSION` 46) and slice 1 is DONE (section 3.1, branch `m50-korvold-text-tokens`, D-175 and D-176, `ENGINE_VERSION` 36, `PARSER_VERSION` 40) and slice 2 is DONE (section 3.2, branch `m51-korvold-fetch-treasure`, stacked on slice 1, D-177 and D-178, `ENGINE_VERSION` 37, `PARSER_VERSION` 41) and slice 4 is DONE (section 3.3, branch `m52-korvold-triggers-statics`, stacked on slice 2, D-179 and D-180, `ENGINE_VERSION` 38, `PARSER_VERSION` 42) and slice 3 is DONE (section 3.4, branch `m53-korvold-casting-targets`, stacked on slice 4, D-181 and D-182, `ENGINE_VERSION` 39, `PARSER_VERSION` 43) and slice 5 is DONE (section 3.5, branch `m54-korvold-mana-spent`, stacked on slice 3, D-183 and D-184, `ENGINE_VERSION` 40, `PARSER_VERSION` 44) and slice 6 is DONE (section 3.6, branch `m55-korvold-keywords`, stacked on slice 5, D-185 and D-186, `ENGINE_VERSION` 41, `PARSER_VERSION` 45); the other slices wait for the owner's approval and three subsystems wait for a decision (the proposals of section 5). Date: 2026-11-02, repository at `main` commit e011597, `PARSER_VERSION` 39 when written.

Input: the owner's export of 2026-10-29 (parser 38, engine 33, deck "koko", commander Korvold, Fae-Cursed King): 45 request records, one per card that was not fully supported at that run. The file is not the decklist: the other cards of the deck were supported then (or are basic lands) and the commander is not among the 45. Korvold himself is in the golden corpus as an acceptance card and is supported. The owner's `decks/korvold.txt` is still needed to measure the deck itself with `pnpm corpus:decks`.

## 1. Where the 45 stand today

How it was measured: each record's card was imported with today's `importCard` (the app's path, with the engine's fixtures as overrides, and again with no overrides: all 45 gave the same status either way). The request file has no power, toughness, colors or color identity, and the importer needs power and toughness for a creature, so creature cards got a placeholder 1/1 for this run only (nothing was written to the repository; without the placeholder the only extra reason is "a creature needs power", and the unparsed abilities are identical). The card text is the file's own.

**Supported today: 2 of 45** (Atsushi, the Blazing Sky and Haven of the Spirit Dragon; both were fixed by the Dragons slice, D-152). **Not supported: 43.** Tear Asunder had no unparsed ability in the old file and was unsupported already then: the engine refuses a target that is chosen only if the spell was kicked (CR 702.33g), a reason that the old file's `unparsed` list does not carry. Apart from Atsushi and Haven, nothing changed since parser 38 except one diagnostic detail (Conqueror's Flail's second line now reports slot `static` instead of `condition`). Fabled Passage and Tear Asunder are already in the golden corpus as unsupported cards and their entries agree with this run.

The pipeline gives `needs` (the engine features a read ability lacks) only for Ziatora (`selector:bound`); every other ability is `unrecognised` (no rule reads it; no `needs`) or `notRunnable` without a named feature. Classes: T template, P primitive, K keyword, S subsystem (playbook, step 3). "T + P" means a template and a small primitive. Slices are in section 3.

| Card | Supported today | What the pipeline reports (ability index on face 0 unless stated: reason, closest rule, slot, needs) | Class | Slice |
| --- | --- | --- | --- | --- |
| Ancient Adamantoise | no | a1: unrecognised, none, -, no needs; a2: unrecognised, none, replacement, no needs | P (hard) | 7 |
| Atsushi, the Blazing Sky | yes | all 1 earlier unparsed abilities now read | fixed (D-152) | - |
| Awakening Zone | no | a0: unrecognised, effect.base-pt, effect, no needs | T | 1 |
| Beledros Witherbloom | no | a1: unrecognised, token.custom, token, no needs | T | 1 |
| Bolt Bend | no | a0: unrecognised, static.self-cost-reduction, amount, no needs; a1: unrecognised, none, effect, no needs | P | 3 |
| Bootleggers' Stash | no | a0: notRunnable, static.permanents, -, no needs | T (+ engine check) | 2 |
| Cabaretti Courtyard | no | a0: unrecognised, noun.library-card, noun, no needs | T + P | 2 |
| Cindervines | no | a1: unrecognised, effect.damage, noun, no needs | T | 1 |
| Coin of Mastery | no | a0: unrecognised, static.each, noun, no needs | P | 5 |
| Conqueror's Flail | no | a0: unrecognised, amount.for-each, amount, no needs; a1: unrecognised, static.conditional-prefix, static, no needs | P | 4 |
| Decadent Dragon // Expensive Taste | yes (slice 7a, D-187, D-188) | face 1 (Expensive Taste) a0: unrecognised, effect.flicker, noun, no needs at the analysis | P (hard): the hidden information was the one Hideaway and Foretell already had, with a new looker | 7 |
| Dragon Broodmother | yes (slice 6, D-185, D-186) | a1: unrecognised, ability.triggered, effect, no needs at the analysis | K + T | 6 |
| Emissary Green | yes (slice 8b, D-194, D-195) | a0: unrecognised, ability.triggered, effect, no needs | S (vote), built as P: one effect, one amount, an existing decision | 8 |
| Fabled Passage | no | a0: unrecognised, ability.activated, effect, no needs | T + P | 2 |
| Far Wanderings | no | a1: unrecognised, none, effect, no needs | T | 2 |
| Ganax, Astral Hunter | no | a2: unrecognised, none, -, no needs | K (no effect in play) | 1 |
| Gilt-Leaf's Embrace | no | a2: unrecognised, ability.triggered, effect, no needs | T | 1 |
| Goldspan Dragon | no | a1: unrecognised, trigger.or, trigger, no needs; a2: notRunnable, static.permanents, -, no needs | P + T | 2 |
| Goldvein Hydra | no | a2: unrecognised, token.predefined, token, no needs | T | 1 |
| Haven of the Spirit Dragon | yes | all 2 earlier unparsed abilities now read | fixed (D-152) | - |
| Impulsive Pilferer | yes (slice 6, D-185, D-186) | a1: unrecognised, none, -, no needs at the analysis | K (Encore; two engine pieces more: the cost and the requirement) | 6 |
| Jund Panorama | no | a1: unrecognised, noun.library-card, noun, no needs | T | 2 |
| Kaervek the Merciless | no | a0: unrecognised, effect.damage, amount, no needs | T + P | 4 |
| Kardur, Doomscourge | no | a0: unrecognised, ability.triggered, effect, no needs | P | 4 |
| Lavalanche | no | a0: unrecognised, noun.player, noun, no needs | P | 4 |
| Lobelia Sackville-Baggins | no | a2: unrecognised, none, trigger, no needs | P | 4 |
| Maestros Theater | no | a0: unrecognised, noun.library-card, noun, no needs | T + P | 2 |
| Moraug, Fury of Akoum | yes (slice 7a, D-187, D-188) | a0: unrecognised, static.each, static, no needs; a1: unrecognised, ability.triggered, condition, no needs at the analysis | P (hard): the list of added phases is short (CR 500.8 puts a new phase first) | 7 |
| My Precious // Allure of Power | no | a1: unrecognised, none, -, no needs | T | 1 |
| Nesting Dragon | no | a1: unrecognised, ability.triggered, effect, no needs | T | 1 |
| Prossh, Skyraider of Kher | no | a0: unrecognised, trigger.cast, trigger, no needs | P + T | 5 |
| Rancor | no | a2: unrecognised, effect.return, noun, no needs | T | 1 |
| Rhythm of the Wild | yes (slice 6, D-185, D-186) | a0: unrecognised, none, -, no needs; a1: unrecognised, static.permanents, static, no needs at the analysis | K + P (riot is a keyword the group gives, not a replacement) | 6 |
| Riveteers Overlook | no | a0: unrecognised, noun.library-card, noun, no needs | T + P | 2 |
| Spelunking | no | a0: unrecognised, ability.triggered, effect, no needs; a1: unrecognised, static.permanents, noun, no needs | P + T | 4 |
| Stir Up Trouble | no | a0: unrecognised, static.additional-cost, noun, no needs | P | 3 |
| Swashbuckler Extraordinaire | yes (slice 7a, D-187, D-188) | a1: unrecognised, trigger.cast, trigger, no needs at the analysis | P (hard): `atLeastOne` and `upToThatMany` | 7 |
| Tear Asunder | no | no unparsed ability; blocked by the engine check: a target chosen only if the spell was kicked (CR 702.33g) | P | 3 |
| Temur Battle Rage | no | a1: unrecognised, none, effect, no needs | T | 1 |
| The Balrog of Moria | no | a3: unrecognised, trigger.cast, trigger, no needs | P | 4 |
| The Mending of Dominaria | no | a0: unrecognised, effect.player, noun, no needs; a1: unrecognised, ability.triggered, effect, no needs | T | 1 |
| There and Back Again | no; DONE in slice 8c, 3.10 | a0: unrecognised, ability.triggered, effect, no needs; a2: unrecognised, effect.create-token, token, no needs | S (the Ring) + P | 8 |
| Tireless Provisioner | no | a0: unrecognised, token.predefined, token, no needs | T | 1 |
| Treasure Nabber | no | a0: unrecognised, trigger.or, trigger, no needs | S (control); DONE in slice 8a, 3.8 | 8 |
| Ziatora, the Incinerator | no | a1: notRunnable, amount.power-of, -, needs selector:bound | P | 2 |

## 2. Why each unsupported card is blocked

The rules were read with `pnpm rule`; engine pieces are named from `packages/engine/src/ast/types.ts`, `docs/MECHANICS.md` and `docs/ROADMAP.md`. "Probe" means a one-line card run through the real parser in a scratch test (deleted): they show which half of a line is read.

### Slice 1: parser only, no new engine (12 cards)

- **Awakening Zone, Beledros Witherbloom, Nesting Dragon (T).** A token with a quoted ability: "It has "Sacrifice this token: Add {C}."", "with "When this token dies, you gain 1 life."", and Nesting Dragon's nested quotes (a token whose death trigger makes a token with an activated pump). The engine's `TokenDefinition` carries `abilities` and the validator checks them (`supported.ts`), a mana ability with only a sacrifice cost exists, and a token with plain keywords is read. `docs/ROADMAP.md` lists "tokens with quoted abilities" under tokens; probes show the parser stops at the quote.
- **Goldvein Hydra (T).** "create a number of tapped Treasure tokens equal to its power" when it dies: `createToken` with `tapped` (D-131) and a `powerOf` amount from last-known information (CR 608.2h). Ten tapped Treasures (Adamantoise's last line) already read.
- **Tireless Provisioner (T).** "create a Food token or a Treasure token": two modes of an inline choice (modal triggered abilities exist, D-105, D-114). Lowering each side only when it is a single `createToken`.
- **Rancor (T).** "When ~ is put into a graveyard from the battlefield, return it to its owner's hand": "dies" means exactly that for any permanent (CR 700.4) and `moveToZone` of `this` out of the graveyard exists (D-135, D-151); the parser reads the trigger and stops at "return it".
- **Gilt-Leaf's Embrace (T).** "enchanted creature gains trample and indestructible until end of turn": `grantKeyword` with the `attached` reference; the parser has no effect rule with that subject (the static "Enchanted creature gets +2/+0" reads).
- **Temur Battle Rage (T).** After the ability word "Ferocious —" (stripped, CR 207.2c): "That creature also gains trample until end of turn if you control a creature with power 4 or greater": `conditional` over `controlsAtLeast`; "also" has no effect on the engine.
- **Cindervines (T).** "~ deals 2 damage to that permanent's controller" after the destroy: `controllerOf` a target, read from last-known information (CR 608.2h), exists; the noun "that permanent's controller" is unread.
- **The Mending of Dominaria (T).** Chapters I and II: "Mill two cards, then you may return a creature card from your graveyard to your hand" (`mill`, `may`, `moveToZone` with a `choose` from the graveyard, D-139). Chapter III: "Return all land cards from your graveyard to the battlefield" reads (probe), "then shuffle your graveyard into your library" is `moveToZone` of `each` graveyard card to the library plus `shuffle`; to check at the start of the slice that the engine moves a whole graveyard to a library (P-small if not).
- **My Precious // Allure of Power (T).** "Equip—{2}, Pay 2 life." The engine's `equip` takes `mana` and `payLife` costs (`ast/types.ts`, CR 702.6a); the parser reads only "Equip {M}".
- **Ganax, Astral Hunter (K, no effect in play).** "Choose a Background" is a partner variant (CR 702.124k): it only decides who may be a second commander, so in the 99 it does nothing. Read it as a keyword with no game effect like Partner; `docs/ROADMAP.md` already defers Background in deck validation. To confirm with the owner.

### Slice 2: lands that fetch, reflexive sacrifice and Treasure grants (9 cards)

- **Cabaretti Courtyard, Maestros Theater, Riveteers Overlook (T + P).** "When this land enters, sacrifice it. When you do, search your library for a basic Mountain, Forest, or Plains card, put it onto the battlefield tapped, then shuffle and you gain 1 life." Template: a list of basic land types as the card to find (`ObjectFilter.anyOf` exists; the parser stops at the second type) and "then shuffle and you gain N life" (a single basic type with "and you gain 1 life" reads, probe). Primitive: the reflexive trigger (CR 603.12) after a sacrifice that is not a "may": the engine's `reflexive` follows a `may`; probe `sacrifice it. When you do, draw a card.` is `notRunnable`.
- **Jund Panorama (T).** The same list-of-types noun; nothing else.
- **Fabled Passage (T + P).** "Then if you control four or more lands, untap that land": `conditional` plus `untap` of the land the search put onto the battlefield. `search` does not set the `moved` reference today (the validator accepts `moved` only after exile, destroy or `moveToZone`), so a small primitive.
- **Far Wanderings (T).** "Threshold — If there are seven or more cards in your graveyard, instead search your library for up to three basic land cards, put them onto the battlefield tapped, then shuffle.": a leading "If ..., instead ..." replacing the first sentence (`conditional` with an `else`; the trailing "... instead" of Tear Asunder already reads). Probe: "up to three basic land cards" reads, the instead does not.
- **Ziatora, the Incinerator (P).** The one card with `needs`: `selector:bound`. "you may sacrifice another creature. When you do, ~ deals damage equal to that creature's power to any target and you create three Treasure tokens": the reflexive trigger must name the creature sacrificed (power from last-known information, CR 608.2h). The engine names a sacrificed cost (`sacrificedCost`) and counts "this way", not an object sacrificed by an effect. Same family as the lands: one "reflexive after sacrifice, with the sacrificed object" primitive.
- **Goldspan Dragon (P + T).** (a) "attacks or becomes the target of a spell": `becomesTarget` is "a spell or ability" (the parser reads that, probe); a spell-only field is a small primitive, then `trigger.or`. (b) "Treasures you control have "{T}, Sacrifice this artifact: Add two mana of any one color."": the engine grants a mana ability to a group (`grantAbility`, D-099) and two mana of any one color exists; the lowering refuses a sacrifice cost inside a granted mana ability (probe: "{T}, Pay 1 life: Add {G}." and "{T}: Add two mana of any one color." pass, "{T}, Sacrifice this land: Add {G}." does not). Check that the mana planner pays the granted ability and chooses between the two Treasure abilities.
- **Bootleggers' Stash (T, engine check).** "Lands you control have "{T}: Create a Treasure token."": a non-mana activated ability granted to a group. The engine's `grantAbility` takes an activated ability and any subject (D-151 built it for the card itself) but the lowering reads only `this` and says so (D-152, "granted quoted abilities for a group"). Probes: "Creatures you control have "{T}: You gain 1 life."" and "Enchanted land has ..." fail the same way. The engine side needs a scenario test that every land offers the ability.

### Slice 3: casting and targets (3 cards)

- **Tear Asunder (P).** "Exile target artifact or enchantment. If this spell was kicked, exile target nonland permanent instead." The parser reads it; `validateCard` refuses the targets "chosen only if the spell was kicked" (CR 702.33g, `ast/supported.ts`). Kicker is asked before targets in the engine (CR 601.2b, 601.2c; `rules/cast.ts`), so a `TargetSpec` flag and the target step reading it is the work. Golden: a hold-out card that changes status.
- **Stir Up Trouble (P).** "As an additional cost to cast this spell, sacrifice an artifact or creature or pay {4}": additional costs are all paid; a choice between two costs is new (CR 118.8, 601.2f). The first half reads (probe). A decision at casting; `choosePayOptions` is the nearest existing shape.
- **Bolt Bend (P).** (a) "This spell costs {3} less to cast if you control a creature with power 4 or greater": `costReduction` of the spell itself has no condition (probe: "if you control a Dragon" fails the same); (b) "Change the target of target spell or ability with a single target": a new effect (CR 115.7a: only to another legal target; if it cannot, nothing changes) and a targets decision for a stack object (the "you may choose new targets" of a copy, D-129, is the nearest existing shape).

### Slice 4: triggers, selectors and small statics (7 cards)

- **The Balrog of Moria (P).** "When you cycle this card, create two Treasure tokens": CR 702.29c, it triggers from whatever zone the card ends in (the graveyard; abilities that work in the graveyard exist, D-151). New trigger kind and a `cycled` event from the cycling cost; `docs/ROADMAP.md` lists cycle triggers as not built. The other lines of the card read.
- **Kaervek the Merciless (T + P).** "deals damage equal to that spell's mana value to any target": the amount `manaValueOf` exists, but the validator lets a `triggerSubject` in an amount be a permanent only (`checkSubjectRef`, `ast/validate-parts.ts`) and the subject of a cast trigger is a spell on the stack, so the amount must accept it (the engine reads the mana value of a spell, `rules/mana-value.ts`). The parser stops at "equal to that spell's mana value".
- **Lavalanche (P).** "X damage to target player or planeswalker and each creature that player or that planeswalker's controller controls": `ObjectFilter.controller` has no "the target player" value (its `owner` does). The engine has no planeswalker permanents (no loyalty abilities, `docs/ROADMAP.md`), so "player or planeswalker" lowers to a player target; that is only honest while no supported card can put a planeswalker onto the battlefield.
- **Lobelia Sackville-Baggins (P).** "exile target creature card from an opponent's graveyard that was put there from the battlefield this turn, then create X Treasure tokens, where X is the exiled card's power": the turn log has no "put into a graveyard from the battlefield" entry (`TurnLog` in `state/types.ts`); the exiled card's power is read from the card.
- **Spelunking (P + T).** "Lands you control enter untapped" is a replacement of how permanents enter (CR 614.12; no such replacement exists, only "enters tapped"); "If you put a Cave onto the battlefield this way, you gain 4 life" is `didPrevious` plus `objectMatches` of `moved` (T). Subtle: a land with "enters tapped" or put onto the battlefield tapped (Cabaretti's search) meets this effect; CR 616.1 lets the controller of the affected permanent choose the order, and the engine never asks (D-156). Proposed: the land always enters untapped, the choice that the controller would make; the official rulings (Scryfall, unreachable from the sandbox) should be read first.
- **Kardur, Doomscourge (P).** "until your next turn, creatures your opponents control attack each combat if able and attack a player other than you if able": `restrict` has only `untilEndOfTurn` and `permanent` (`docs/ROADMAP.md`: "until your next turn" not built); a group requirement with a new duration. With two seats "a player other than you" is impossible for the opponent's creatures, so that half changes nothing today; the lowering should still record it so a multiplayer engine (M10) does not run the card wrongly. The second ability reads.
- **Conqueror's Flail (P).** "+1/+1 for each color among permanents you control" (a new amount; `colorCount` and `devotion` are the nearest existing pieces) and "As long as ~ is attached to a creature, your opponents can't cast spells during your turn" (a condition on the attachment and a player-level restriction on casting; `cantCastThis` is only for the card itself).

### Slice 5: mana spent to cast a spell (2 cards)

- **Prossh, Skyraider of Kher (P + T).** "When you cast this spell, create X 0/1 red Kobold creature tokens named Kobolds of Kher Keep, where X is the amount of mana spent to cast it." The self cast trigger exists (`castSpell` with `self`, D-120); the token name is a template; the amount does not exist.
- **Coin of Mastery (P).** "Each creature you control enters with an additional +1/+1 counter on it for each mana from an artifact source spent to cast it." `othersEnterWithCounters` (D-149) exists; the amount needs a record of the mana spent: pool mana already names its source (`ManaObject.source`), so the types of the source are written on the spell at payment (a Treasure is sacrificed to make mana, so its types must be recorded then) and kept on the permanent as `kicks` is. Treasure mana counts: a good fit for the deck.

### Slice 6: keywords (3 cards)

- **Impulsive Pilferer (K).** Encore (CR 702.141a): an activated ability that works from the graveyard, exiles the card as a cost, sorcery timing; for each opponent a token copy that attacks that opponent if able, gains haste, sacrificed at the next end step. Pieces exist: Unearth (graveyard activation, haste, delayed exile), token copies (`copyOf`, Myriad), `attacksEachCombat`, delayed triggers. `docs/ROADMAP.md` and D-117 list Encore as not built.
- **Dragon Broodmother (K + T).** Devour 2 (CR 702.82a) on a token the card creates each upkeep: as it enters, sacrifice any number of creatures, enter with twice that many counters. Reuse `entersWithCounters` and the sacrifice-any-number of D-135; a new decision purpose `devour`. The token with flying and devour is the template half.
- **Rhythm of the Wild (K + P).** "Creature spells you control can't be countered" (the engine's `cantBeCountered` is a spell's own ability, subject `this`: a group version) and "Nontoken creatures you control have riot": riot (CR 702.136a) is the choice of a +1/+1 counter or haste as the permanent enters. A granted keyword has to be seen while the permanent enters (CR 614.12); the proposal is to read the line as a replacement that applies to entering creatures of the group, which has the same effect (an `othersEnter...` replacement with a `chooseOption` of purpose `riot`). The card itself having riot (a keyword for the other cards that print it) comes with the slice.

### Slice 7: expensive single cards (4 cards)

- **Ancient Adamantoise (P, hard).** See `docs/proposals/damage-redirection.md`. Line 1, "Damage isn't removed from this creature during cleanup steps", is CR 514.2 minus this creature (a static flag read by cleanup). Line 2 is a redirection effect (CR 614.9): all damage that would be dealt to you and other permanents you control is dealt to this creature instead. The hook is one place (`dealDamage`, the one function for all damage); what is hard is the rules around it: redirected damage keeps its source (lifelink, deathtouch, infect, wither and the results of CR 120.3 apply to the creature), commander damage and "dealt damage to a player" triggers do not happen, two such creatures need CR 614.5, and a prevention shield on the original recipient needs an order that CR 616.1 gives to the player and D-156 leaves unbuilt. The owner's decision is needed on that order. **Built (D-192 engine, `ENGINE_VERSION` 45; D-193 parser, `PARSER_VERSION` 48, branch `m59-adamantoise`): supported through the grammar; the redirect is one more effect of the order of D-191, `keepsDamage` is read at cleanup. The SYNTHETIC fixture has invented power and toughness (6/8: the request file gives none); no ruling could be read.**
- **Swashbuckler Extraordinaire (P, hard; DONE in slice 7a, 3.7).** "Whenever you attack, you may sacrifice one or more Treasures. When you do, up to that many target creatures gain double strike until end of turn." "Whenever you attack" is `attackBatch` (exists); the rest needs a sacrifice of a chosen number of permanents, a number read by a later instruction and "up to that many targets" fixed when the reflexive trigger goes on the stack: `docs/ROADMAP.md` lists "variable numbers of targets" and "a chosen count read by a later instruction" as not built.
- **Decadent Dragon // Expensive Taste (P, hard; DONE in slice 7a, 3.7).** "Exile the top two cards of target opponent's library face down. You may look at and play those cards for as long as they remain exiled." `exileTop` is the controller's library only; needs a player on it, cards exiled face down (CR 406.3, 406.3a: nobody else may look; the view must hide them, the risky part), a play permission "as long as they remain exiled" (the `PlayUntil` kinds are turn-based) and casting cards another player owns. The Dragon half reads.
- **Moraug, Fury of Akoum (P, hard; DONE in slice 7a, 3.7).** (a) "Each creature you control gets +1/+0 for each time it has attacked this turn": a small amount; `TurnLog.attacked` already lists each declaration. (b) "Landfall — Whenever a land you control enters, if it's your main phase, there's an additional combat phase after this phase. At the beginning of that combat, untap all creatures you control.": CR 500.8 adds a phase directly after the specified phase. The engine adds an extra combat only after the combat that is going on (D-151, `extraCombats` in `rules/flow.ts`); after a postcombat main phase the new combat is followed by the end step, not by another main phase, so a counter is not enough: the turn needs an ordered list of added phases. Also a condition on the main phase (`duringStep` names combat steps only) and a delayed trigger "at the beginning of that combat" for one particular added phase. The parser stops at the intervening if (`condition`).

### Slice 8: subsystems (3 cards, S; the owner approved them and all three are built)

- **Emissary Green: voting (CR 701.38). DONE in slice 8b (3.9).** `docs/design/voting.md`. Reuses `chooseOption` for each player; a tally in the resolution.
- **There and Back Again: the Ring tempts you (CR 701.54). DONE in slice 8c (3.10).** `docs/design/the-ring.md`. A player-level emblem, a designation, four levels of triggers; also the "for as long as you control this Saga" duration and the named legendary token of chapter III (the token half is a template of slice 1's family).
- **Treasure Nabber: control-changing effects (CR 613.1b). DONE in slice 8a (3.8).** `docs/design/control-change.md`. No effect changes control today; the controller is a stored field read in about 320 places. Also the trigger "whenever an opponent taps an artifact for mana" (`tappedForMana` is `by: 'you'` only). A Treasure is sacrificed as part of tapping for mana, so the trigger does nothing to it.

None of the 43 cards chooses a card name, copies a permanent (except Encore's token copy), takes an extra turn, makes the monarch or uses a Clash or dice rule. The rules where this analysis is least certain are marked "to confirm" above and listed in section 6.

## 3. Slices

Each slice follows the earlier ones: engine primitives first (with scenario tests and `validateCard` features), then the parser lines, then the web wording and dialogs, a SYNTHETIC soak deck style for the AI and the docs (D-151 and D-152 are the model: thirty cards, eleven engine areas, one engine and one parser decision). Sizes are my estimates relative to the Dragons slice as a whole (engine and parser together = 1.0), not measurements. Every slice needs the usual bumps (`ENGINE_VERSION`, `PARSER_VERSION`), a golden corpus review and the owner's reruns of `pnpm corpus:decks` and `pnpm coverage:cards`.

| Slice | Cards (completes) | New engine pieces | Parser rules | AI handlers | UI | Risk | Size |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1. Text and tokens | 12: Awakening Zone, Beledros, Nesting Dragon, Goldvein Hydra, Tireless Provisioner, Rancor, Gilt-Leaf's Embrace, Temur Battle Rage, Mending of Dominaria, My Precious, Ganax, Cindervines | none to a few lines: the keyword with no effect for Ganax (`validateCard` feature), a check that a whole graveyard moves to a library | tokens with quoted abilities (also nested), `it has "..."`, "a number of tapped ... equal to its power", "X token or a Y token", the aura grant effect, the also-if sentence, restricted Equip, that permanent's controller, shuffle graveyard | none (a Food-or-Treasure choice is an existing modal) | wording for the Ganax keyword | low: only reads, but quoted abilities in tokens are the first run of those paths | 0.25, almost all parser |
| 2. Lands, reflexive sacrifice, Treasure grants | 9: Cabaretti Courtyard, Maestros Theater, Riveteers Overlook, Jund Panorama, Fabled Passage, Far Wanderings, Ziatora, Goldspan Dragon, Bootleggers' Stash | reflexive after a sacrifice with the sacrificed object (last-known power); `search` sets `moved`; `becomesTarget` for spells only; group-granted activated and sacrifice mana abilities run and are paid | list of basic types, "shuffle and you gain N life", "Then if ... untap that land", leading "If ..., instead", "attacks or becomes the target of a spell", group grants of quoted abilities | none new | wording for the new nodes | medium: the mana planner and the legal actions see granted abilities | 0.35 |
| 3. Casting and targets | 3: Tear Asunder, Stir Up Trouble, Bolt Bend | targets only if kicked; a choice of cost; conditional self cost reduction; `changeTarget` | kicked-only targets (already read), "X or pay {N}" costs, conditional reduction, change-the-target | a handler for the cost choice and for the new target of a stack object | dialogs: choose a cost, choose a new target | medium: touches the casting stages | 0.2 |
| 4. Triggers and small statics | 7: Balrog, Kaervek, Lavalanche, Lobelia, Spelunking, Kardur, Conqueror's Flail | `cycled` trigger; a spell as the trigger subject of an amount; controller-of-target filter; turn-log entry for the graveyard; `entersUntapped` replacement; group "attack if able" with an "until your next turn" duration; amount of colors; player cast restriction; attached condition | one rule or two for each | none (no new decision) | wording; a Flail line in the preview | medium: seven independent pieces, Spelunking needs the owner's rule on ordering | 0.35 |
| 5. Mana spent | 2: Prossh, Coin of Mastery | record of mana spent and of the sources' types on a spell, kept on the permanent; amounts | "the amount of mana spent to cast it", "for each mana from an artifact source spent", named tokens | none | none | medium: payment code | 0.15 |
| 6. Keywords | 3: Impulsive Pilferer, Dragon Broodmother, Rhythm of the Wild | Encore; Devour; Riot as an entering choice; group "can't be countered" | the three keywords (and granted riot), the group uncounterable line | devour (choose creatures to sacrifice: the casual agent declines), riot (counter or haste), Encore (activate from the graveyard) | devour dialog (many cards), riot dialog (two options), the graveyard activation | medium: decisions while a permanent enters | 0.3 |
| 7. Expensive singles | 4: Ancient Adamantoise, Swashbuckler Extraordinaire, Decadent Dragon, Moraug | damage redirection and `keepsDamage`; variable sacrifice count and dynamic targets; face-down exile of another player's cards; an ordered list of added phases | a few rules each | Swashbuckler (how many Treasures), the face-down cards | hidden cards in exile; the targets stepper | high for Adamantoise (the damage function) and Moraug (turn flow), medium for the other two | 0.4 together |
| 8. Subsystems (S) | 3: Emissary Green, There and Back Again, Treasure Nabber | see the three proposals | | vote, ring-bearer | vote dialog, the Ring panel, stolen permanents | the proposals | 0.1 to 0.4 each |

### 3.1 Slice 1 is DONE (2026-11-02)

The twelve cards were run through the real parser and `validateCard` before planning (a second unread piece can hide behind the first one the pipeline reports); the result and the class corrections are in D-175 (engine) and D-176 (parser). Each card was run from the owner's request file with a placeholder 1/1 for the creatures (the file has no power or toughness) and reads completely and passes `validateCard` at parser version 40; the engine plays a SYNTHETIC card with each real wording (`packages/cards/test/convert-grammar-engine-p35.test.ts`).

| Card | Status now | What did it |
| --- | --- | --- |
| Awakening Zone | supported | `token.custom` with a quoted mana ability, `effect.it-has-ability` folded into the token (`ir/fold-token.ts`), "this token" inside quotes is `~` |
| Beledros Witherbloom | supported | `token.custom` with a quoted triggered ability, the sentence that ends with the period inside the quote |
| Nesting Dragon | supported | the same, with a quote inside the quote (a token that makes a token with an activated ability) |
| Goldvein Hydra | supported | `token.number-of` ("a number of tapped Treasure tokens equal to its power"), the count of a token bound by the binding pass |
| Tireless Provisioner | supported | engine `chooseOne` (D-175) and the "or a Treasure token" of `effect.create-token`; class correction: T became P |
| Rancor | supported | engine: `died` for every permanent (CR 700.4, D-175); `return it to its owner's hand` as `thisCard`; class correction: T became P |
| Gilt-Leaf's Embrace | supported | a pump or gain of the enchanted creature (`GAIN_SUBJECTS`), lowered as `attached` |
| Temur Battle Rage | supported | `noun.that-object`, "also", and a "that creature" bound to the target of the line before (`BindScope.lastTarget`) |
| The Mending of Dominaria | supported | `effect.return-chosen-card`, `effect.shuffle-graveyard` (the engine already moved a whole graveyard to a library: no engine change, the T call held) |
| My Precious // Allure of Power | supported | `keyword.equip` with a mana cost and a payment of life; the adventure half already read |
| Ganax, Astral Hunter | supported | keyword `chooseBackground` (K, D-175), read by `keyword.line` |
| Cindervines | supported | `noun.its-controller` as a recipient of damage (`controllerOf`) |

Gaps recorded in `docs/ROADMAP.md` ("The Korvold slice 1 ... known limitations"). The golden snapshot has none of the twelve (the acceptance names are for the owner's `pnpm corpus:extract`); its training and hold-out shares are unchanged at 160 of 192 and 51 of 61. The owner's `pnpm corpus:decks` run on `decks/korvold.txt` is what shows the deck as a whole.

### 3.2 Slice 2 is DONE (2026-11-02)

The nine cards were run through the real parser and `validateCard` before planning, from the owner's request file with a placeholder power and toughness for the two creatures (the file has none), and each line again piece by piece (the pipeline reports only the first unread piece); the result and the class corrections are in D-177 (engine) and D-178 (parser). All nine read completely and pass `validateCard` at parser version 41; the engine plays a SYNTHETIC card with each real wording (`packages/cards/test/convert-grammar-engine-p36.test.ts`) and the engine pieces are pinned with SYNTHETIC fixtures (`packages/engine/test/scenario-xx-fetch-grants.test.ts`).

| Card | Status now | What did it |
| --- | --- | --- |
| Cabaretti Courtyard | supported | `noun.library-card` "a basic Mountain, Forest, or Plains card"; "When you do" after a sacrifice that is not an offer (`lowerDoneReflexive`); class correction: T + P became T (the engine's `reflexive` after a plain `sacrifice` was already valid and ran) |
| Maestros Theater | supported | the same |
| Riveteers Overlook | supported | the same |
| Jund Panorama | supported | the list of basic land types in an ability, nothing else |
| Fabled Passage | supported | engine: a `search` leaves `moved` (CR 400.7j); parser: "untap that land" after a search, the golden entry changed from unsupported to supported |
| Far Wanderings | supported | a leading "instead" and the two lines of a spell read as one text (`joinInsteadLines`), "there are seven or more cards in your graveyard" (`condition.amount-count`); no engine change, the T call held |
| Ziatora, the Incinerator | supported | engine: the object reference `sacrificed`, carried to the reflexive ability; parser: "that creature's power" bound to the sacrificed creature |
| Goldspan Dragon | supported | engine: `becomesTarget` with `spellOnly`; parser: `trigger.or` with "becomes the target of a spell", the granted mana ability that sacrifices its permanent for a group (the planner already handled sacrifice sources); class correction: the grant P became T |
| Bootleggers' Stash | supported | the lowering takes a group for a granted activated ability; the engine check passed with no change (each land offers it) |

Gaps recorded in `docs/ROADMAP.md` ("The Korvold slice 2 ... known limitations"). The golden snapshot has one of the nine (Fabled Passage, training): training supported is 161 of 192 (160 before), hold-out 51 of 61 (unchanged), a gap of 0.2 points. The owner's `pnpm corpus:decks` run on `decks/korvold.txt` is what shows the deck as a whole.

### 3.3 Slice 4 is DONE (2026-11-02)

The seven cards were run through the real parser and `validateCard` before planning, from the owner's request file with a placeholder power and toughness for the creatures (the file has none), and each line again piece by piece; the result and the class corrections are in D-179 (engine) and D-180 (parser). All seven read completely and pass `validateCard` at parser version 42; the engine plays a SYNTHETIC card with each real wording (`packages/cards/test/convert-grammar-engine-p37.test.ts`) and the engine pieces are pinned with SYNTHETIC fixtures (`packages/engine/test/scenario-xx-korvold-triggers.test.ts`).

| Card | Status now | What did it |
| --- | --- | --- |
| The Balrog of Moria | supported | engine: a `cycled` trigger from the zone the card winds up in (CR 702.29c), the cost of Cycling and typecycling marked as a cycling cost; parser: `trigger.cycled` |
| Kaervek the Merciless | supported | validator: `manaValueOf` of the trigger's subject when it is a spell (the interpreter already read it); parser: "that spell's mana value"; class correction: T + P became P (one line) |
| Lavalanche | supported | engine: `ObjectFilter.controlledBy` ("each creature that player controls"); parser: "target player or planeswalker" read as a player (the engine has no planeswalker to target) and `noun.each-permanent-of-player` |
| Lobelia Sackville-Baggins | supported | engine: `TurnLog.graveyarded` and `putFromBattlefieldThisTurn`; parser: the suffix after "an opponent's graveyard" and "the exiled card's power" |
| Spelunking | supported | engine: the replacement `groupEntersUntapped` (the order against another replacement is the controller's best choice, untapped, not asked); parser: `static.group-enters-untapped` and `condition.put-this-way` (`objectMatches` of `moved`, no engine change) |
| Kardur, Doomscourge | supported | engine: `requireAttack` and the `turnStart` end ("until your next turn"), and a second gap found only by playing the card: a creature that was attacking as it died was not read as attacking by "Whenever an attacking creature dies"; parser: `effect.require-attack` |
| Conqueror's Flail | supported | engine: the static amount `colorsAmong`, `opponentsCantCastOnYourTurn` and `objectMatches` of `attached` as the condition of a static ability; parser: `amount.for-each-color`, `static.opponents-cant-cast`, `condition.attached-to` |

Gaps recorded in `docs/ROADMAP.md` ("The Korvold slice 4 ... known limitations"). The golden snapshot has none of the seven (the acceptance names are for the owner's `pnpm corpus:extract`); its training and hold-out shares are unchanged at 161 of 192 and 51 of 61 (one unsupported card's closest rule changed). The owner's `pnpm corpus:decks` run on `decks/korvold.txt` is what shows the deck as a whole.

### 3.4 Slice 3 is DONE (2026-11-02)

The three cards were run through the real parser and `validateCard` before planning, from the owner's request file, and each line again piece by piece; the result and the class corrections are in D-181 and D-182 (`ENGINE_VERSION` 39, `PARSER_VERSION` 43). The slice is stacked on slice 4 (branch `m53-korvold-casting-targets`). The analysis's "two new dialogs" came out as one new purpose of the existing optional question and a flag of the existing targets question: no new dialog, so no Playwright test.

| Card | Status now | What did it |
| --- | --- | --- |
| Tear Asunder | supported | engine: `TargetSpec.ifKicked` and `unlessKicked` (CR 702.33g, 601.2c) and a kicker question asked only when both ways can be cast; parser: the slots of a kicked sentence and of the sentence it replaces (`markKickedTargets`) |
| Stir Up Trouble | supported | engine: `CardFace.additionalCostChoice` and the cost question (purpose `costChoice` of `confirmOptional`); parser: `static.additional-cost` reads "A or B" |
| Bolt Bend | supported | engine: a condition on the spell's own `costReduction`, and `changeTarget` with `ObjectFilter.singleTarget`, the `forChange` question and the `targetChanged` event; parser: `static.self-cost-reduction` with "if you control ..." and `effect.change-target` |

Class corrections: none. All three stay P; none needed an S-class subsystem, so the approval gate did not apply. Gaps recorded in `docs/ROADMAP.md` ("The Korvold slice 3 ... known limitations"). The golden snapshot has Tear Asunder (hold-out), which changes status: hold-out supported is 52 of 61 (51 before), training 161 of 192 (unchanged), a gap of 1.4 points (training 83.9%, hold-out 85.2%); Stir Up Trouble and Bolt Bend are acceptance names (the owner's `pnpm corpus:extract`). The owner's `pnpm corpus:decks` run on `decks/korvold.txt` is what shows the deck as a whole.

### 3.5 Slice 5 is DONE (2026-11-02)

The two cards were run through the real parser and `validateCard` before planning, from the owner's request file, and each line again piece by piece; the result is in D-183 and D-184 (`ENGINE_VERSION` 40, `PARSER_VERSION` 44). The slice is stacked on slice 3 (branch `m54-korvold-mana-spent`). The analysis feared a record of the mana spent "by colour and source through payment" with no model in the engine (an S-class subsystem); it was not: the mana already carried its source, the planner already chose what paid, and a spell already kept facts about its casting, so the record is one field on the mana, one list in the plan and one field on the spell. No new dialog, no new decision for the agents, no Playwright test.

| Card | Status now | What did it |
| --- | --- | --- |
| Prossh, Skyraider of Kher | supported | engine: `Amount` `manaSpent`, read in the effect of the spell's own cast trigger (`castSpell` with `self`) from the spell or its last-known information; the recorded mana (`ManaObject.sourceTypes`, `PaymentPlan.spentTypes`, `StackData.manaSpent`); parser: `trigger.cast-self`, a token "named ...", "where X is the amount of mana spent to cast it" |
| Coin of Mastery | supported | engine: `othersEnterWithCounters.count` may be `manaSpent { fromType: 'artifact' }`, read from the spell the creature came from as it enters; parser: `amount.for-each-mana-spent` in `static.others-enter-with-counters` |

Class corrections: Prossh P + T stays (a primitive and templates: the cast trigger, the token name, the amount), Coin of Mastery P stays; neither is S. Gaps recorded in `docs/ROADMAP.md` ("The Korvold slice 5 ... known limitations"): the amount is read in the self cast trigger and in the enters-with count only, nothing counts mana of a colour, and the card rulings could not be read (Scryfall is blocked), so that commander tax and kicker mana count as mana spent, that a Treasure is an artifact source and that a free cast has spent none rest on the CR text and the cards' wording. Neither card is in the golden snapshot (both are acceptance names for the owner's `pnpm corpus:extract`), but a training card that is, Sowing Mycospawn, is supported now (its two "When you cast this spell" lines read, and a SYNTHETIC card with that wording is played in `convert-grammar-engine-p39.test.ts`): training 162 of 192 (161 before), hold-out 52 of 61, a gap of 0.9 points. The owner's `pnpm corpus:decks` run on `decks/korvold.txt` is what shows the deck as a whole.

Cumulative cards of the 43 completed: 12 after slice 1, 21 after 2, 24 after 3, 31 after 4, 33 after 5, 36 after 6, 39 after 7a (slices 1 to 6 and 7a are built; Ancient Adamantoise, the fourth card of slice 7, waits for the owner's decision on the order of damage prevention), 43 after 8. Each slice can be built and merged on its own. Ancient Adamantoise (the fourth card of slice 7) is built after the owner's decision (D-192, D-193), which, with Treasure Nabber of slice 8a, makes 41 of the 43.

### 3.6 Slice 6 is DONE (2026-11-02)

The three cards were run through the real parser and `validateCard` before planning, from the owner's request file, and the CR text of the three keywords was read in the repository (`pnpm rule 702.141`, `702.82`, `702.136`); the result is in D-185 and D-186 (`ENGINE_VERSION` 41, `PARSER_VERSION` 45). The slice is stacked on slice 5 (branch `m55-korvold-keywords`). The official rulings could not be read (Scryfall is blocked), so nothing rests on one.

| Card | Status now | What did it |
| --- | --- | --- |
| Impulsive Pilferer | supported | engine: the keyword `encore` expands into an activated ability from the graveyard with the new cost `exileThis` and the effect `encore` (a token copy for each opponent from the card's last-known information, `mustAttackPlayer`, haste until end of turn, a delayed sacrifice at the next end step); parser: `keyword.encore` |
| Dragon Broodmother | supported | engine: the keyword `devour` (a `choosePermanent` of purpose `devour` as a card or a token enters; the creatures are sacrificed before it is on the battlefield and it enters with N counters for each); parser: "Devour N" and a token "with flying and devour 2" |
| Rhythm of the Wild | supported | engine: the static `spellsCantBeCountered` (the group version of the spell's own "can't be countered") and the keyword `riot` (a `chooseOption` of purpose `riot` for each instance as a permanent enters, read from the permanents on the battlefield when a static ability gives it to a group); parser: `static.spells-cant-be-countered` and "Riot" among the grantable words |

Class corrections: Impulsive Pilferer K stays but needed two pieces the analysis did not list (the cost that exiles the card itself and a requirement to attack a given player); Dragon Broodmother K + T stays, and the decision as a permanent enters was K, not S (the pipeline already asked such questions); Rhythm of the Wild K + P stays, but the proposal to read its riot line as a replacement was dropped: riot is a keyword that each instance asks separately (CR 702.136b), so a riot creature under the enchantment asks twice. No S-class subsystem, so the approval gate did not apply; no new dialog, so no Playwright test (the riot question reuses the named-option dialog, the devour question the permanent picker). Gaps recorded in `docs/ROADMAP.md` ("The Korvold slice 6 ... known limitations"). The golden snapshot: no card changed status (training 162 of 192, hold-out 52 of 61, a gap of 0.9 points). Two soak facts: the new fixtures joined the random pools of `games-100.test.ts` and made its random games ask `chooseOption`, which that test expects only from the dedicated styles, so the cards have their own deck style `korvoldKeywords` and are kept out of the generic pools (`packages/ai/test/helpers.ts`, as the Dragons slice does); `games-100.test.ts` still fails on the unrelated trample check that is being fixed on its own branch.

### 3.7 Slice 7a is DONE (2026-11-02)

The three cards of slice 7 that need no decision of the owner were run through the real parser and `validateCard` before planning, from the owner's request file, and the CR text was read in the repository (`pnpm rule 406.3`, `406.3a`, `500.8`, `500.10`, `505.1`, `603.12`, `715.3d`); the result is in D-187 and D-188 (`ENGINE_VERSION` 42, `PARSER_VERSION` 46). The slice is stacked on slice 6 (branch `m56-korvold-singles`). The official rulings could not be read (Scryfall is blocked), so nothing rests on one. Ancient Adamantoise was not part of it; it came later with the owner's decision on the order of CR 616.1 (`docs/proposals/damage-redirection.md`, D-191 to D-193).

| Card | Status now | What did it |
| --- | --- | --- |
| Swashbuckler Extraordinaire | supported | engine: `ChooseSelector.atLeastOne` (a sacrifice of one or more; the "you may" is not asked with no Treasure) and `TargetSpec.upToThatMany` (the reflexive ability's targets, at most the permanents sacrificed, fixed as it is created), `attackBatch` with `atLeast` 1; parser: `trigger.you-attack`, `noun.one-or-more-permanents`, "up to that many target creatures" and `effect.gain-keyword-targets` |
| Moraug, Fury of Akoum | supported | engine: `StaticPtAmount` `timesAttacked`, `Condition` `yourMainPhase`, `TurnState.addedPhases` and `addedAfter` (the phases an effect adds, a new one first, CR 500.8) with `extraCombat.atBeginning` (the untap of that combat's own beginning); parser: `static.pt-times-attacked`, `condition.your-main-phase`, `effect.extra-combat-after` and the delayed sentence "At the beginning of that combat, ..." folded into it |
| Decadent Dragon // Expensive Taste | supported | engine: `exileTop` with `from` and `faceDown`, `GameObject.exiledFaceDown` and `lookers` (the view hides the cards from everyone else), `mayPlay` with `lookAt` and `whileExiled`, casting and playing a card another player owns (`castZone`), an Adventure its caster did not own (`adventureBy`); parser: `effect.exile-top-face-down` and `effect.may-look-and-play`; the Dragon half read already |

Class corrections: all three stay P and none is S. Moraug's "ordered list of added phases" is a short list because an added phase goes directly after the phase that is going on, so the newest is always first; the hidden information of Expensive Taste is the one the engine already had for Hideaway and Foretell (a card that only some players may look at). Gaps recorded in `docs/ROADMAP.md` ("The Korvold slice 7a ... known limitations").

### 3.8 Slice 8a is DONE (2026-11-02)

The control-change subsystem of `docs/design/control-change.md` (approved with the Korvold slices) and its card, built stacked on slice 7a (branch `m57-korvold-control-change`): D-189 (engine, `ENGINE_VERSION` 43) and D-190 (parser, `PARSER_VERSION` 47). As the proposal recommended, the refactor came first: the controller of a permanent is read through `controllerOf` (about 110 reads), with the precon fingerprint of `tools/perf/precon-digest.ts` identical before and after; then layer 2 and the card. The official rulings could not be read (Scryfall is blocked), so nothing rests on one; the CR text decides every point (611.2b's own example is the "for as long as" case).

| Card | Status now | What did it |
| --- | --- | --- |
| Treasure Nabber | supported | engine: layer 2 (`ContinuousChange` `control`, `controllerOf`, `controlledSince` for summoning sickness, `GameObject.controlChangedAt`), `gainControl` with four durations, the end of "for as long as you control this" with the state-based actions, CR 506.4 removal from combat, the event `controlChanged`, the trigger `tapsForMana` with the event `tappedForMana`; parser: `trigger.taps-for-mana` and `effect.gain-control` |

Class correction: the card is T and P once the subsystem exists; the subsystem was the S part. The trigger is a new kind, not an extension of `tappedForMana` (that one is the triggered mana ability of CR 605.1b). A Treasure tapped for mana is sacrificed as part of the ability, so the trigger finds nothing to take (CR 608.2b), as this analysis said; the card does something only for artifacts that stay (Sol Ring, Mind Stone). Treasure Nabber's power and toughness are not in the owner's request file (the SYNTHETIC fixture's 3/2 is invented). Gaps recorded in `docs/ROADMAP.md` ("Layers").

### 3.9 Slice 8b is DONE (2026-11-02)

The voting subsystem of `docs/design/voting.md` (approved with the Korvold slices) and its card, built stacked on the Ancient Adamantoise branch (`m60-korvold-voting` on `m59-adamantoise`): D-194 (engine, `ENGINE_VERSION` 46) and D-195 (parser, `PARSER_VERSION` 49). As the proposal recommended: one effect (`vote`), one amount (`votesFor`), the existing `chooseOption` decision for each voter, the tally in the resolution; no new dialog kind (the named-option dialog) and so no browser test. The official rulings could not be read (Scryfall is blocked); the CR text (701.38a to 701.38d) decides every point.

| Card | Status now | What did it |
| --- | --- | --- |
| Emissary Green | supported | engine: `vote`, `votesFor`, `Instruction` `vote`, `ResolutionContext.votes`, `ChooseOptionDecision` purpose `vote` with `vote: { controller, cast }`; parser: `effect.vote`, the atom "the number of A votes" of `amount.equal-to`, `token.number-of` after "You create", `effect.add-counters-number-of` |

Class correction: S became P, as the proposal itself noted: the machinery (a decision asked of a player in the middle of a resolution, an amount read from the resolution) existed. The card's power and toughness are not in the owner's request file; the SYNTHETIC fixture's 3/4 is invented. Gaps recorded in `docs/ROADMAP.md` ("The voting slice"). With Treasure Nabber and Ancient Adamantoise, 42 of the 43; There and Back Again (the Ring) is the one card left.

### 3.10 Slice 8c is DONE (2026-11-02): the Ring and There and Back Again

The card was run through the real parser before building (a second unread piece hid behind the first one): chapter I stopped at "can't block for as long as you control ~. The Ring tempts you." and chapter III at the named legendary token; chapter II read. The engine side is D-196 (`ENGINE_VERSION` 47) and the grammar D-197 (`PARSER_VERSION` 50). The owner approved all the Korvold slices and the proposal was presented to them, so the card was built, not swapped out as the proposal recommended.

| Card | Status now | What did it |
| --- | --- | --- |
| There and Back Again | supported | engine: `ringTempts` with the `ringBearer` choice, `SeatState.ring`, `GameObject.ringBearer`, the three inherent abilities of the emblem, the trigger `ringTempted` and the condition `controlsRingBearer`, `restrict` with `forAsLongAsYouControlThis`, `sacrifice.byController` and `delayedSacrifice`; parser: `effect.ring-tempts`, `trigger.ring-tempts`, `condition.ring-bearer`, `effect.restrict-while-controlling`, `token.named-legendary` and the keyword list "A, B, and \"...\"" of a token |

All 43 cards of the analysis now read (with Treasure Nabber, Ancient Adamantoise and Emissary Green); nothing of the Saga is invented in the SYNTHETIC fixture (a Saga has no power or toughness and Smaug's values are in its text). The rulings could not be read (Scryfall is blocked), so the CR text decides every point; limits are in `docs/ROADMAP.md` ("The Ring slice").

### Recommended order

1. **Slice 1**: the most cards for the least engine work, and the quoted-ability token wording is a template other token makers share. Safe to start now.
2. **Slice 2**: the fetch lands are cheap, high-value cards (five fetch lands and Far Wanderings in this list; this kind of land is common in other Commander decks), and the reflexive-sacrifice primitive is shared with Ziatora.
3. **Slice 4** (seven cards, no new decision), then **slice 3** (three cards, two new dialogs); they are independent, so slice 3 can go first if the owner wants the removal spells (Tear Asunder, Stir Up Trouble) sooner.
4. **Slice 5**, then **slice 6** (both built).
5. **Slice 7a** (three singles, built), **slice 8a** (Treasure Nabber, built), then Ancient Adamantoise and Emissary Green (**slice 8b**, built) and There and Back Again (the Ring, **slice 8c**, built).

Which single cards could be left for last or swapped out, in order of cost against value: There and Back Again (the Ring plus two other pieces), Treasure Nabber (control change refactor, and the card does nothing to Treasures), Moraug (turn flow), Ancient Adamantoise (damage function, rules decisions), Emissary Green (voting), Decadent Dragon (hidden information) and Swashbuckler Extraordinaire (variable counts). Kardur and Conqueror's Flail are medium: three small pieces for one card. If the owner swaps out the first seven, 36 of the 43 are completed by slices 1 to 6 without any approval beyond the slices themselves.

## 4. The golden corpus

Not changed. The request file has no power, toughness, loyalty, colors, color identity or EDHREC rank, and a golden record needs them (`GoldenFace`); the only mechanism is `pnpm corpus:extract` over Scryfall's bulk file, which the sandbox cannot reach, and filling the fields by hand would invent data. Instead `docs/proposals/korvold-acceptance-names.txt` is a names file for the owner: `pnpm corpus:extract --file <bulk> --names docs/proposals/korvold-acceptance-names.txt --acceptance`, then `UPDATE_GOLDEN=1 pnpm exec vitest run packages/cards/test/golden.test.ts` and a review of the diff of `golden.expected.json`, in a separate commit. It has the 41 unsupported cards that are not in the corpus yet (front-face names for the adventure cards); Fabled Passage and Tear Asunder are left out because they are already in it as training and hold-out cards, and flagging them as acceptance would move them out of the split (D-066). Acceptance cards sit outside the training and hold-out split; for reference the committed split is 160 of 192 supported in training and 51 of 61 in hold-out (golden test summary at parser 39), and adding acceptance cards does not change either figure.

## 5. Approvals needed

- S-class: `docs/design/the-ring.md` is built (slice 8c, the owner approved it), and so are `docs/design/control-change.md` (slice 8a) and `docs/design/voting.md` (slice 8b).
- P-class with a rule decision: `docs/proposals/damage-redirection.md` (the order of a redirection and a prevention shield).
- Slices 1 to 7: the owner's approval to start each; slice 1 and 2 can start first.
- Small decisions: Ganax's "Choose a Background" as a keyword with no effect in play; Spelunking's order against "enters tapped"; Kardur's "attack a player other than you" with two seats; Lavalanche's "planeswalker" with no planeswalkers in the engine.

## 6. What I am unsure about

- Section 2's T versus P calls come from reading the AST, `validateCard` and one-line probes, not from running the engine on each card. The likeliest to move from T to P: The Mending of Dominaria (a whole graveyard to a library), Bootleggers' Stash and Goldspan's grant (a granted ability for a group may reveal engine gaps when the lowering stops refusing it), and Tireless Provisioner (the inline choice).
- A line can have a second unread piece behind the first one the parser stops at; the pipeline reports only the first. The counts of cards per slice assume the second piece reads.
- Rules points to read in the official rulings before building: Spelunking against tapped entering, Ancient Adamantoise's redirect against prevention, Moraug's added phase after the second main phase, Treasure Nabber's trigger and a Treasure's sacrifice cost, Devour and Riot given by another permanent. The CR text is in the repository; Scryfall's rulings are not reachable from the sandbox.
- Sizes are estimates.

## 7. What I need from the owner

- `decks/korvold.txt` (the full decklist, copied from the source site) and the bulk file's run of `pnpm corpus:decks` on it, to see the rest of the 100 cards (supported at the old run, so not in this file) and the real blockers.
- Which of the cards of section 3's last list to swap out.
- The extraction of the names file of section 4, if the acceptance cards are wanted.
- The Scryfall rulings of section 6, if a slice that needs them is approved.
