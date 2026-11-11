# Proposal: voting (Vote, CR 701.38), with Emissary Green as the first card

IMPLEMENTED in the Korvold slice 8b (D-194 engine, D-195 parser, `ENGINE_VERSION` 46, `PARSER_VERSION` 49), as the recommendation below says: one effect `vote`, one amount `votesFor`, the existing `chooseOption` decision with a new purpose `vote`, the tally in the resolution. Kept as the design record; where it and the code differ, the code and the decisions win. Differences, all in D-194: the vote is an instruction that keeps the votes cast (`Instruction` `vote`) and writes the tally to `ResolutionContext.votes` when the last vote is in; the decision carries `vote: { controller, cast }`, the votes so far, so the dialog and the agents can read them; a vote is logged with the existing `optionChosen` event (purpose `vote`); the AI open question was answered with a fixed rule for the casual agent and a simulation on a sample for the heuristic agent (the owner can change it); the third risk, the replay of the action log, is covered by the soak (`vote-games.test.ts`).

Status before it was built: WAITING for the owner's approval. Gap class: S, because the playbook names voting as a subsystem (it asks players other than the controller for a choice in the middle of a resolution). It could also be argued to be P: the machinery it needs already exists, see "Engine design". Source: the Korvold card list of 2026-10-29 (`docs/proposals/korvold-deck-analysis.md`); one card of the 45 needs it. No bulk-file count of other cards with Vote is available in this repository, so the value beyond Emissary Green is unmeasured (the owner's `pnpm coverage:cards` run would show it).

## What the card needs

Emissary Green: "Whenever Emissary Green attacks, starting with you, each player votes for profit or security. You create a number of Treasure tokens equal to twice the number of profit votes. Put a number of +1/+1 counters on each creature you control equal to the number of security votes." The parser reads the trigger and stops at "starting with you, each player votes" (`unrecognised`, `ability.triggered`, slot `effect`).

## Rules (read with `pnpm rule`)

- CR 701.38a: each player, starting with a specified player and proceeding in turn order, chooses one of the listed choices. 701.38b: the choices may be words with no rules meaning, each connected to a different effect (profit, security). 701.38c: "voting" means an actual vote only. 701.38d: several votes by one player all happen at the same time that player would have voted (not needed here; no card in the list gives extra votes).
- Votes are public: each later voter knows the earlier votes (the choices are made in order, not secretly). The log must say who voted for what.

## Engine design

1. One effect `vote { options: string[]; startingWith: 'you' }` that runs inside a resolution: it asks each player in turn order from the starting player one `chooseOption` decision (the decision kind already exists for "choose a color or a creature type", D-100, and for named options, D-151) with a new purpose `vote`, stores the tally in the resolution context (`votes: Record<string, number>`), then goes on with the rest of the sequence.
2. A new amount `votesFor { option }` (and `votesAgainst` is not needed). The Treasure count is `multiple { factor: 2, of: votesFor profit }`; the counters are `addCounters` over `each` creature you control with `votesFor security`.
3. The decision goes to the voter's seat (the engine's decisions already name the seat that must answer, as the sacrifice and discard of "each player" do, D-157), so the opponent AI answers its own vote.
4. Two seats today; the loop is written over `state.seats` in turn order so the multiplayer work (M10) does not redo it.

## Parser

`effect.vote` ("starting with you, each player votes for A or B."), `amount.votes` ("the number of A votes", "twice the number of A votes"). The lowering declares the new features so `validateCard` refuses a card the engine could not run.

## AI and UI

- AI: `CasualAgent` and the heuristic agent need a handler for `chooseOption` with purpose `vote` (the compiler enforces the switch). A generic rule: for the controller's own vote pick the option that the card text rewards most by a simple evaluation; for the opponent's vote pick the option that gives the controller less. For Emissary Green that is a judgment call (twice the Treasures against counters on every creature); the first version can pick by the board evaluator on the two outcomes, or simply the second option. Open question for the owner.
- Web: a dialog "Vote: profit or security" with the option names and the votes already cast; log lines "X voted for profit".

## Risks

Small. The new part is a loop of decisions inside one resolution; the risk is the resume after each answer (the same shape as `each player sacrifices`, D-157) and the replay of the action log. A soak deck style with Emissary Green plays it.

## Alternatives

- Lower the vote to a `chooseOption` of the controller only: rejected, the other player's vote changes the result and the card would be played wrongly (honesty rule: a card is supported or not).
- Leave the card out of the deck (it is one card).

## What the owner has to approve

Build the effect and the amount for one card, or swap Emissary Green out. Recommendation: do it last, after the cheaper slices, or swap it.
