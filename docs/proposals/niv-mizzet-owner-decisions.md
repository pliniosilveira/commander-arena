# Niv-Mizzet deck (issue 25): three cards that wait for the owner

Status: PROPOSED, nothing built. These three cards of `decks/niv-mizzet.txt` need a new kind of machinery or change how an existing decision works, so the deck support routine does not build them without the owner's decision (`.claude/skills/deck-support/SKILL.md`). The other 20 cards are built in groups (`docs/proposals/niv-mizzet-build-status.md`). The findings below come from a read-only survey of the code; the card text is real (Scryfall data of the issue) and the CR rules were read with `pnpm rule`. Rulings could not be fetched.

## 1. Reality Shift: manifest (gap class S)

"Exile target creature. Its controller manifests the top card of their library." Manifest (CR 701.40) puts a card onto the battlefield face down as a 2/2 creature; a manifested creature card can be turned face up for its mana cost (CR 701.40b).

- **What the engine has:** only face-down exile (Foretell, Hideaway). No face-down permanent: no layer 1b in `derive`, no 2/2 override, no turn-face-up action, no reveal on leaving.
- **What exists on paper:** `docs/proposals/face-down.md` (approved at LOW priority, Morph, Megamorph, Disguise) designs exactly this machinery (steps 1, 3, 4, 5, 6: state and layer 1b, `turnFaceUp`, hidden information in `getView` and events, the AI, the soak) and lists manifest as "not in this proposal".
- **What manifest would add on top:** an effect `manifest` (the top card of a library, "its controller" through last-known information), the rule that a non-creature card cannot be turned up, the parser verb, the web card back and a "Turn face up" button.
- **Size and risk:** large and high risk (hidden information in views, events and logs; `derive`). Only Reality Shift in this deck needs it.
- **Recommendation:** do not build for one card. If the owner later wants Morph or Disguise, build the face-down slice and add manifest then. Reality Shift stays unsupported until then.
- **DECIDED by the owner on 2026-11-12 (in chat): build it.** "Manifest is needed. I'll use other cards with this ability." So manifest is built generally (the face-down permanent, the manifest effect, turning a manifested creature card face up for its mana cost), not for one card. A face-down manifested permanent is shown with the image of Scryfall's Manifest token (a 2/2 creature, from Fate Reforged, shown in the owner's message), fetched by the game at run time like every card image; nothing of that image is kept in the repository. The recommendation above is superseded.

## 2. Fact or Fiction: piles (gap class P, possibly S)

"Reveal the top five cards of your library. An opponent separates those cards into two piles. Put one pile into your hand and the other into your graveyard." (CR 700.3: either pile may be empty; the cards stay in the library while sorted.)

- **What exists:** an opponent-makes-the-choice precedent (`splitCostExiled`, decision `chooseCards` with purpose `split`), a revealed-cards event, a multi-step instruction pattern (`lookSplit`).
- **What would be new:** an instruction `revealAndSeparate`, and two decisions that are new purposes of existing decision kinds, not a new kind: the opponent picks the cards of pile 1 (`chooseCards`, the rest is pile 2), then the controller picks a pile (a choice that shows both piles). Casual and Heuristic handlers for both (split by card worth, take the better pile), web wording and log lines. The first opponent in turn order is the one asked (the same limit as Coin of Fate, D-233).
- **Size:** medium to large, no hidden-information risk (the cards are revealed).
- **Class:** P if the two decisions are accepted as new purposes of `chooseCards`; S only if the owner wants a dedicated "piles" decision kind.
- **Recommendation:** build it as P after groups 1 to 3, if the owner agrees that a new purpose on an existing decision is enough.

## 3. Fiery Confluence: repeatable modes (gap class P, large)

"Choose three. You may choose the same mode more than once." (CR 700.2d: the same player or object may be chosen as the target for each instance.)

- **What exists:** the modal machinery (`ModeChoice` with `min`, `max`, `maxIf`, `notRepeatedThisTurn`; `legalModeSets` enumerates sets of DISTINCT modes). The bullets of the card already parse. D-114 and the ROADMAP list repeatable modes as not built.
- **What would change:** `ModeChoice.repeatable`; mode sets become multisets of a fixed size; every chosen instance of a targeted mode needs its own target slot (per-instance ids), which touches casting, activation, trigger stacking, copying a modal spell, invariants, the view, the web picker (counters instead of checkboxes) and the stack panel; the AI sums mode scores and already copes.
- **Size and risk:** large, cross-cutting. Only the Confluence cycle uses it. A simplification (one slot for all instances) would be wrong when there are fewer targets than instances, so it is not offered.
- **Recommendation:** skip unless the owner wants the Confluence cards; the card stays unsupported.

## What the owner is asked

For each of the three: build, build later (after the rest of the deck), or leave unsupported.
