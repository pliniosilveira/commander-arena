# Hashaton deck: build status (issue 31)

Issue 31 "Deck Support - Hashaton" (author `leandrogaluzzi`), 20 unsupported cards, decklist `decks/hashaton.txt`, branch `support-hashaton` (from `support-niv-mizzet`; its pull request opens after the Niv-Mizzet one, PR 33, is merged). The goal is every card (D-317): a costly card is built later, never left out.

Status values: waiting, in progress, done. The surveys found no S-class gap: every card extends existing machinery, so no owner decision is needed (none of the cards is left out for its cost, D-317). Groups 1, 2, 4, 7 and 8 are being built first; 3, 5, 6, 9 and 10 follow. The Rona activation is an ordinary activated ability ({5}{B/P}: Transform), not a mana ability.

| Card | Group | Class | Status | What it needs |
| --- | --- | --- | --- | --- |
| Archfiend of Despair | 2 | P (+T) | in progress | "Your opponents can't gain life"; "each opponent loses life equal to the life that player lost this turn" at each end step |
| Archfiend of Ifnir | 1 | T (+ tiny P) | in progress | "Whenever you cycle or discard another card, put a -1/-1 counter on each creature your opponents control" |
| Archon of Cruelty | 1 | T | in progress | "target opponent sacrifices a creature or planeswalker of their choice, discards a card, and loses 3 life. You draw a card and gain 3 life" |
| Bard, King of Dale | 3 | P x2 (+T x2) | waiting | two replacements: draw two instead (except the first draw of the draw step); twice as many tokens |
| Champion of Wits | 5 | K + P | waiting | Eternalize |
| Darksteel Angel | 3 | P + T (many sites) | waiting | "Creatures you control can't have -1/-1 counters put on them" |
| Enter the Avatar State | 4 | T | in progress | becomes an Avatar in addition to its other types and gains four keywords |
| Faithful Mending | 1 | T | in progress | "gain 2 life, draw two cards, then discard two cards" (plus flashback if printed) |
| Gleaming Overseer | 4 | P + T | in progress | amass Zombies; "Zombie tokens you control have hexproof and menace" |
| Hashaton, Scarab's Fist | 5 | P x3 (+T) | waiting | discard a creature card: may pay, create a tapped copy token that is a 4/4 black Zombie |
| Niv-Mizzet, Ghost Counsel | 2 | P + T | in progress | "Whenever you gain life, you may pay that much life. If you do, draw that many cards" |
| Ob Nixilis, the Ascended | 2 | T | in progress | at each end step, if you gained life this turn, create a 4/4 Angel token |
| Psychic Frog | 1 | P (+T) | in progress | combat damage to a player or planeswalker: draw a card |
| Renewed Solidarity | 5 | T (+ small P) | waiting | choose a type as it enters; at your end step copy each token of that type that entered this turn |
| Restless Dreams | 10 | P x2 (casting) | waiting | additional cost: discard X cards; return X target creature cards from the graveyard |
| Rona, Herald of Invasion // Rona, Tolarian Obliterator | 9 | P + T | waiting | transform on a mana ability; damage trigger exiling a random card from the damager's controller's hand and playing it |
| Serra's Emissary | 6 | P + T (large) | waiting | choose a card type as it enters; protection from the chosen card type for you and your creatures |
| Sphinx of the Second Sun | 7 | P (turn structure) | done | an additional beginning phase after the postcombat main phase |
| Victimize | 8 | T + small P | in progress | choose two target creature cards, sacrifice a creature, return the cards tapped |
| Vohar, Vodalian Desecrator | 8 | P | in progress | loot with a conditional drain; sacrifice: cast an instant or sorcery from the graveyard this turn with exile instead |

Owner decisions asked: none. Note for the owner: Sphinx of the Second Sun adds an untap step and an upkeep to a turn already underway (an extra beginning phase, CR 500.8); it reuses the extra-combat machinery.
