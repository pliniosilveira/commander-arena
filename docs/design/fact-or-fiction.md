# Design: separating cards into two piles (class P, approved by the owner on 2026-11-12)

Written for issue 25 (the Niv-Mizzet deck): Fact or Fiction ("Reveal the top five cards of your library. An opponent separates those cards into two piles. Put one pile into your hand and the other into your graveyard.", real text in `packages/cards/test/fixtures/corpus/golden.jsonl`). The owner approved it as a P-class build: the two questions are new purposes of the existing decision kinds `chooseCards` and `chooseOption`; a dedicated piles decision kind would be S-class and is not approved. Decision numbers below are provisional (D-303 to D-307, the integrator renumbers them). The rule text was read with `pnpm rule` from the CR copy of the owner's private rules repository.

## Rules

- CR 700.3 (General): some effects group objects temporarily into piles. 700.3a: each affected object is put into exactly one pile unless the effect says otherwise. 700.3b: each object in a pile is still an individual object, the pile is not an object. 700.3c: objects grouped into piles do not leave the zone they are in; the rule's own example is Fact or Fiction: while an opponent separates the revealed cards they are still in their owner's library and leave it only when put into the hand or the graveyard. 700.3d: a pile can contain zero or more objects, so either pile may be empty.
- CR 701.20 (Reveal): 701.20a shows the cards to all players for as long as the effect needs them; 701.20b revealing does not move the card.
- The CR does not say who the player is when an effect says "an opponent" in a game of more than two players: no rule gives that choice to the controller (800.4g only picks another opponent when the one who was to choose has left the game). So the repository's precedent applies (Coin of Fate, D-233, `docs/ROADMAP.md`): the first opponent in turn order who is still in the game. It is a recorded limit, not a rule.

## The instruction

`revealAndSeparate { count, separator: 'opponent' | 'you', chosenTo, otherTo }` (AST, `ast/types.ts`; `rules/pile-separate.ts`). General in three ways: the number of cards (an `Amount`), who makes the piles (the first opponent for Fact or Fiction, the controller for a "separate them into two piles. An opponent chooses one of those piles" text, where the other player chooses), and where the chosen pile and the other one go (`hand` or `graveyard`, different from each other). The player who does not separate chooses.

As it resolves:

1. The controller reveals the top `count` cards of their library (fewer when it holds fewer; none ends the effect): one `cardsRevealed` event, public (CR 701.20a). The cards stay in the library (CR 700.3c).
2. The separator chooses which of the cards form pile 1; the rest are pile 2 (CR 700.3a, 700.3d: either may be empty). A `chooseCards` decision, purpose `separate`, `zone: 'library'`, `min` 0, `max` the number of cards, `reveal` true. With fewer than two cards nothing is asked: every split of one card is the same choice for the other player (all in pile 1), so the effect decides it. A `pilesSeparated` event tells both piles by name.
3. The chooser decides which pile goes where: a `chooseOption` decision, purpose `pile`, options `pile1` and `pile2`, and `piles` on the decision carry both piles. Always asked once the piles exist (even with an empty pile: the choice is real). A `pileChosen` event.
4. The chosen pile moves to `chosenTo` and the other to `otherTo`, as ordinary zone changes (each card is its own move, so a commander is asked about the command zone by the existing path, CR 903.9a/b, and every card triggers what it would). Order, documented because nothing in the CR fixes it for a hand: the chosen pile first, then the other, each in library order from the top; so in a graveyard the card that was higher in the library goes in first and ends deeper (the order of `millCards`).

The effect has no memory beyond its instruction, so nothing else changes in the state shape: the instruction lives on the resolution queue (`state/types.ts`, `Instruction` `pileSeparate`) with the cards and, once made, pile 1.

## Decisions and views

- `ChooseCardsDecision.purpose` gains `separate`; `ChooseOptionDecision.purpose` gains `pile` with a `piles` field (`first`, `second`, `chosenTo`, `otherTo`, `separator`, `receiver`). No new decision kind, no new `Action` kind: the answers are the existing `chooseCards` and `chooseOption` actions, and `applyAction` checks them like any other (`api.ts`, `rules/stack.ts`).
- The cards are in a library, which is no part of a view, so `getView` lists them for the deciding player in `pendingCards` (the way a search or a lookTake does) and, for a `pile` decision, the cards of both piles. For the other seat `waitingOn` names the purpose and no card. The cards are public through the events.
- `legalActionsForDecision` lists the subsets (up to 500 as for every `chooseCards`) and the two options.

## AI

The agents answer both questions with the existing evaluator helpers, deterministically (`casual-piles.ts`): as the separator, sort the cards by worth (mana value, a land worth more in the early game, as `chooseSplitPile` does), then deal them best first to the pile with the lower total so far, so the two piles have similar worth, and ties go by the engine's order; as the chooser, take the pile of greater total worth for `chosenTo` (ties pick pile 1). The Heuristic agent delegates to these (it has no search over piles).

## Web

The separation is the dock picker (`CardPickerPanel`): "Separate the revealed cards into two piles", the cards as toggles (the clicked ones are pile 1) and a preview of both piles. The pile choice is a modal, `PilesDialog`: "Pick a pile to put into your hand" with the two piles shown side by side, a button under each. Wording in `cards-picker.ts` and a new words module; log lines for `pilesSeparated` and `pileChosen` in `game/describe.ts` (the revealed cards are public: `cardsRevealed` already names them).

## Parser

One class T rule, `effect.reveal-separate-piles`, reads the three sentences as one clause: "Reveal the top N cards of your library. An opponent separates those cards into two piles. Put one pile into your hand and the other into your graveyard." `splitSentences` keeps the three together (`segment.ts`); the lowering produces `revealAndSeparate` with `separator: 'opponent'`. The "separate them. An opponent chooses one of those piles" wording is not read: its real text is not in the repository (not invented here), so it waits for a card of an issue that carries it. The engine already runs it (a `separator: 'you'` test with a SYNTHETIC card proves it).

## Limits

- "An opponent" is the first opponent in turn order still in the game (see above).
- Piles hold cards of one library; a pile of targets in graveyards (Boneyard Parley's text) is another effect and is not built.
- The order of the cards moved to a graveyard together is the library order, top card first (as `millCards` does). CR 404.3 lets the owner arrange cards put into the same graveyard at the same time; the engine does not offer that choice for any effect yet, so this one does not either.

## Tests

Scenario tests (`packages/engine/test/scenario-xx-piles.test.ts`): five cards and all in a pile; the empty pile; fewer than five cards; the opponent's choice is respected; the controller picks each pile; a commander in a pile; two opponents (the first separates); events seen by both seats; deterministic replay; the view lists the cards. Grammar tests in `packages/cards/test/`. An AI soak with SYNTHETIC cards (`packages/ai/test/piles-games.test.ts`). Mutation checks of the engine rule on a scratch copy.
