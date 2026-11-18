# AI decisions

Entries keep their old numbers (see `README.md`).

- **D-010, D-161 The AI plays on a determinized sample.** `determinize(state, viewer, rng)` runs on the host side and returns a copy in which what the viewer cannot know is drawn again from the AI's own PRNG; the AI never reads hidden information. It may know the opponent's decklist (not the order or the hand).
- **D-011, D-162 Measured against baselines.** `GreedyAgent` and the paired-seed match harness (`playMatch`, `pnpm ai:arena`, seats swapped) measure strength. **D-289:** the soak decks only assert a floor against random; the strength claim is a test on paired arena games (the heuristic agent wins at least 90% of 20 against random).
- **D-163, D-164, D-168 One level.** The web opponent is the `HeuristicAgent` (block and attack planning by look-ahead, mana planning, instants held for a good moment); there is no Easy level. `CasualAgent` (D-051) is the beginner agent.
- **D-028 The watchdog.** A Worker-side time budget replaces a late answer with a logged fallback. **D-172:** the AI gets 5,000 ms a decision and the host replaces an answer after budget plus 2,500 ms.
- **D-170 A lone blocker goes on the attacker it kills,** in the block plan and in the opponent model.
- **D-237 The AI never casts a creature that X sizes to a size that kills it.**
