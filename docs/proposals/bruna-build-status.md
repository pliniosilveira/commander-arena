# Bruna deck: build status (branch `support-bruna`, issue 5)

The running checklist of the deck program for `decks/bruna.txt`. One branch, one pull request, committed after each group. The measuring test is the golden corpus (`packages/cards/test/fixtures/corpus/golden.expected.json`, the 27 acceptance cards of the issue). Decisions are D-252 and following. The card data comes from the issue's author; it is not checked against Scryfall.

| Card | Group | Gap | Status | Note |
| --- | --- | --- | --- | --- |
| Valkyrie Harbinger | 1 (D-252) | P | done | "if you gained N or more life this turn" |
| Angelic Accord | 1 | P | done | |
| Griffin Aerie | 1 | P | done | |
| The Book of Exalted Deeds | 1 | P | open | the trigger reads now; the second ability ("you can't lose the game", grant, sorcery speed) is still unread |
| Bruna, the Fading Light | | S | blocked | meld, `docs/proposals/meld.md` |
| Gisela, the Broken Blade | | S | blocked | meld |
| Breathkeeper Seraph | | S | blocked | soulbond (pairing) is new machinery; to be written as a proposal |
| Ajani, Strength of the Pride | | | open | |
| Angel of Destiny | | | open | |
| Angel of Serenity | | | open | |
| Arch of Orazca | | K | open | Ascend, the city's blessing |
| Arden Angel | | | open | |
| Commander's Plate | | | open | |
| Cosmos Elixir | | | open | |
| Dawnbreak Reclaimer | | | open | |
| Dismantling Wave | | | open | |
| Entreat the Angels | | | open | Miracle (D-117 design, not built) |
| Everflowing Chalice | | | open | |
| Heirloom Blade | | | open | |
| Karoo | | | open | |
| Keeper of the Accord | | | open | |
| Myriad Landscape | | | open | |
| Nykthos Paragon | | | open | |
| Nykthos, Shrine to Nyx | | | open | |
| Search for Glory | | | open | |
| Urza's Incubator | | | open | |
| Well of Lost Dreams | | | open | |

Golden after group 1: Valkyrie Harbinger, Angelic Accord and Griffin Aerie are supported; the other 24 are unsupported. Versions: `PARSER_VERSION` 78, `ENGINE_VERSION` 74.
