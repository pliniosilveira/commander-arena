# Galadriel group 3: provisional decisions

Provisional decisions of group 3 of the Galadriel deck program (issue 43), numbered D-1620 onward so that they do not collide with the numbers other groups take. The lead folds them into `docs/DECISIONS.md` with the next unused numbers in merge order (the template of `docs/DECISIONS.md`). Rulings quoted from Scryfall are not verified: no Scryfall host is reachable from a cloud session, and the rules were read from the Comprehensive Rules copy of the owner's private repository (`pnpm rule`).

The seven cards of the group are Defend the Rider, Eyes Everywhere, Jace Mirror Mage, Koma Cosmos Serpent, Mystic Speculation, Netherese Puzzle-Ward and Repulsive Mutation. The tests use SYNTHETIC cards of `packages/engine/src/cards/fixtures/synthetic-galadriel-g3.ts` and the real texts of the golden corpus, which lower to the same AST.

## D-1620: Exchange control is two layer 2 effects (2026-11-16)
- Context: Eyes Everywhere says "Exchange control of this enchantment and target nonland permanent". The engine had `gainControl` only (D-189).
- Decision: a new effect `exchangeControl { first, second }` (CR 701.12a, 701.12b) makes two permanent layer 2 continuous effects (CR 613.7): the first permanent goes to the second one's controller and the second to the first one's, both read as the effect resolves. When one of the two is gone, is not a permanent or both have the same controller, nothing happens (CR 701.12b); a `controlChanged` event is emitted for each permanent that changes hands, in pairs. Who controls a permanent is still read with `controllerOf` (D-189).
- Alternatives: two `gainControl` effects in a sequence (the second would read the controller after the first changed it, which exchanges nothing); an exchange that moves only the permanent that still exists (not what CR 701.12b says).
- Consequences: the effect is validated like `gainControl` (both selectors must name a permanent); it has no duration of its own, so it lasts as long as the game (CR 701.12a).

## D-1621: Buyback is a cast option with its own question (2026-11-16)
- Context: Mystic Speculation has buyback {2}. The engine had kicker, replicate, gift and X as options of a cast, each as a decision in the cast flow.
- Decision: keyword `buyback { cost }` (CR 702.27a). The cast flow asks "pay the buyback cost" (`confirmOptional`, purpose `buyback`) after kicker, replicate and before gift, cost choice and X (the order of `toKicker`, `toReplicate`, `toBuyback`, `toGift`, `toCostChoice`, `toX`), only when the whole cost with the buyback cost can be paid (CR 601.2b, 601.2f). `StackData.boughtBack` and `spellCast.boughtBack` record it. As the spell resolves, its card is put into its owner's hand instead of the graveyard (done in `finish` of `stack.ts`); a spell that is countered, or fizzles, goes to the graveyard as usual (CR 702.27a: "as it resolves"). A copy of a spell is not a card and is not returned.
- Alternatives: adding the cost silently when it can be paid (the player must choose); returning the card with a replacement effect (the card moves once, at the end of the resolution, which is what the rule says).
- Consequences: the web asks "Pay the buyback cost {2}?" and says ", with buyback" in the log; the casual agent accepts buyback when it can pay; every spell with buyback is a new place a cast can be cancelled (CR 733) and rewound.

## D-1622: A drawn card can be revealed, and "that card" names it (2026-11-16)
- Context: Jace's 0 ability says "Draw a card and reveal it. Remove a number of loyalty counters equal to that card's mana value from Jace".
- Decision: the draw instruction takes `reveal: true` (CR 701.20a). The card drawn is shown with a `cardsRevealed` event (zone hand) and is what `{ kind: 'moved' }` names for the rest of the resolution (`lastMoved`, CR 400.7j); a draw that drew no card reveals nothing and leaves `moved` empty, so the amount is 0.
- Alternatives: a separate `reveal` instruction after the draw (it would have to find the card in the hand by guessing which one was drawn).
- Consequences: the loss of loyalty is `removeCounters` with a count of `manaValueOf` the moved card (D-1626); the number is capped by the counters the permanent has (CR 122.1, 701.20a does not apply: there is no cost).

## D-1623: Dice: the result as an amount and the highest result as a trigger (2026-11-16)
- Context: Netherese Puzzle-Ward rolls a die at upkeep, scries "that many" cards and draws on the die's highest result. The engine rolled dice (`rollDie`) but exposed no result to the rest of the sequence and no trigger.
- Decision: amount `dieResult` reads the natural result of the last die rolled earlier in the same sequence (`ctx.dieSides` tracks the roll, as with the other amounts that read the resolution; CR 706.2 for the result, 706.1a for "highest" being the most the die can show). Trigger `rollsHighest { who }` ("Whenever you roll a die's highest natural result") fires once for each die whose natural result is its number of sides, for the player or players `who` names (CR 603.2, 706.2). A die that no effect modifies is its own natural result; results modified by an effect are not built (no card of the program has one).
- Alternatives: a trigger on any roll with an intervening "if" (the intervening-if of CR 603.4 is rechecked on resolution, which is not what the card says); storing the result in a counter or a variable of the state (more state for the same information).
- Consequences: `trigger-text` says "Whenever you roll a die's highest natural result", `amount-text` says "the result"; a scry of `dieResult` cards of a library with fewer cards looks at as many as there are (the soak checks it).

## D-1624: "Activated abilities can't be activated" is a restriction made by an effect (2026-11-16)
- Context: Koma's first mode taps a permanent and says "Its activated abilities can't be activated this turn" (CR 602.5).
- Decision: restriction `cantActivateAbilities`, made by the `restrict` effect only, until end of turn; the grammar reads no static form of it (no card of the program has one), and the AST doc of `Restriction` says so (the validator does not forbid the static form, so the lead may want to add that check if a static form is ever parsed). A permanent with it is offered no activated ability, no loyalty ability and no mana ability by `getLegalActions` and `applyAction` refuses them (CR 602.5, 605.1a); the check is in `activate-legality.ts` and `mana-abilities.ts`. Triggered abilities and static abilities are not affected (CR 602.5 names activated abilities).
- Alternatives: removing the abilities of the permanent with a layer 6 effect (it would also remove its triggered abilities); denying only the mana abilities.
- Consequences: `invariants.ts` has a check that no activation of such a permanent is offered; the view lists the restriction (`restrictions`), and the web says "can't have its activated abilities activated".

## D-1625: "Counter unless its controller pays mana equal to ..." reads the amount as it resolves (2026-11-16)
- Context: Repulsive Mutation counters a spell "unless its controller pays mana equal to the greatest power among creatures you control", after the counters it put.
- Decision: `counterUnlessPays.genericAmount` (an amount) replaces the cost with that much generic mana, read as the effect resolves (CR 118.12a, 608.2c: after the counters were put, so the creature that got them counts). When the amount is 0 the spell is not countered and nobody is asked (paying {0} is paying nothing). The question carries the number in its cost, so the player is asked "pay {3}?".
- Alternatives: reading it when the spell is cast (CR 608.2c reads the game as the instruction is carried out); a variable-cost question (a new decision for one card).
- Consequences: the existing `counterUnlessPays` with a cost of symbols is unchanged (Ward, Mana Leak style); `ability-label` says "unless its controller pays mana equal to ...".

## D-1626: Removing counters is an effect of its own (2026-11-16)
- Context: Jace removes "a number of loyalty counters equal to ..." from itself as part of an effect, not as a cost.
- Decision: effect `removeCounters { objects, counter, count }` (CR 122.1; the count is the number of counters actually removed, at most the number there are). It emits `counterRemoved` once with the number removed. The loyalty of a planeswalker that reaches 0 is dealt with by the state-based action as usual (CR 704.5i).
- Alternatives: reusing the loyalty cost of an ability (the amount is not a cost and is not known when it is activated).
- Consequences: validated like `addCounters` (the counter kind must be a known one; the amount must not name a target that does not exist).

## D-1627: A copy can be not legendary and start with a given loyalty (2026-11-16)
- Context: Jace's kicker makes a token copy "except it's not legendary and its starting loyalty is 1" (the text is that of the golden fixture, from the app import of issue 43).
- Decision: the copy exceptions `notLegendary` and `startingLoyalty` (CR 707.9b, 306.5b). The first removes the legendary supertype from the copiable values; the second replaces the loyalty printed on the copied card, which is what the permanent enters with (CR 306.5b), so the token enters with that many loyalty counters. The legend rule does not apply to the copy (CR 704.5j).
- Alternatives: a layer 4 effect on the token (it is a copiable value, so it belongs to the copy: CR 707.9b).
- Consequences: both exceptions can be used by any copy effect; `copy-exceptions.ts` and `validate-parts.ts` know them.

## D-1628: "Crews Vehicles as though its power were N greater" is a static ability that the crew cost reads (2026-11-16)
- Context: Defend the Rider makes a Pilot token with "This token saddles Mounts and crews Vehicles as though its power were 2 greater." (the web says "This creature ...")
- Decision: static ability `crewSaddleBonus { amount }`. `crewPowerOf` (the power the engine derives now, plus the bonus of each such ability the creature has now) is what a crew cost counts for a creature tapped for it (CR 702.122a); its power as a creature is not changed. Saddle (CR 702.171) is not built, so the saddle half of the sentence does nothing yet; the text is accepted because no Mount is in the game of a supported card that could ask for it, and a Saddle cost, when built, reads `crewPowerOf`.
- Alternatives: a layer 7 power bonus (it would show on the creature and in combat, which is wrong).
- Consequences: the limitation is in `docs/ROADMAP.md`. If a supported card with Saddle appears, the keyword is its own work.

## D-1629: The parser reads these texts by new rules registered before the older ones with the same beginning (2026-11-16)
- Context: the registry takes the first matching rule of a family in order, and several new sentences begin like older ones ("Counter target spell unless ...", "Draw a card", "Put ... counters on ...", "Exchange ...", "Roll a ...").
- Decision: the rules of group 3 are in `rules/<family>/galadriel-g3.ts` files and are registered before the family's older rules whose first words they share, each with `leading` hints, examples and rejects as the registry tests need; their ids are listed, in registration order, in `packages/cards/test/convert-parser.test.ts`. The segmenter joins the sentences that make one instruction ("Roll a d4. Scry X, where X is the result."; "Draw a card and reveal it. Remove ... that card's mana value ...") so the second one is read in the context of the first.
- Alternatives: widening the older rules (they would stop being a clear grammar and would match more than their tests prove).
- Consequences: `PARSER_VERSION` and the golden snapshot change; the lead regenerates them.

## D-1630: What this group does not verify (2026-11-16)
- Context: no Scryfall host is reachable from a cloud session (D-294 is the lawful way), and the owner's CR copy is the only rules source.
- Decision: the rulings of the seven cards are not verified. The behavior above follows the Oracle text of the golden fixtures and the CR rules cited in the code. The lead, or the owner through the `Scryfall lookup` workflow, should check `cards/<id>/rulings` of the seven cards, in particular for Eyes Everywhere (exchange when the nonland permanent has the same controller), Jace (loyalty cost of the 0 ability when the card has an {X} in its mana cost, which counts as 0 in the hand: CR 202.3e) and Netherese Puzzle-Ward (a die that is rolled more than once in a turn).
- Alternatives: writing rulings from memory (forbidden: never invent data).
- Consequences: none for the code; the list is the work order for the check.
