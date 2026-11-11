# Proposal: face-down permanents, with Morph, Megamorph and Disguise as the first cards

Status: APPROVED by the owner on 2026-10-26 (in chat), at LOW priority: the owner does not expect to use a deck with face-down cards, so this is built after the slices that block more of the owner's cards. Gap class: S (subsystem): face-down objects are a new kind of hidden information on the battlefield and the stack, and a new layer (CR 613.2b). Source: `reports/coverage.md` and `reports/backlog.md` (owner's run of 2026-10-22, parser version 26), where `Morph {M}` is the heaviest unread shape by cards blocked.

## What the cards need

| Shape | Cards blocked | Today |
| --- | --- | --- |
| `Morph {M}` | 139 | unread |
| `Disguise {M}` | 41 | unread |
| `Megamorph {M}` | 31 | unread |
| "When ~ is turned face up, ..." | not ranked separately | no trigger kind |

The counts are from the reports; a card can be blocked by more than one shape, so they do not add up to a card total.

## Rules (read with `pnpm rule`)

- CR 702.37 (Morph, Megamorph), 702.168 (Disguise): cast the card face down as a 2/2 creature by paying {3} instead of its mana cost (an alternative cost, CR 118.9), from any zone it could be cast from; turn it face up any time you have priority by paying its morph or disguise cost (a special action, CR 116.2b, no stack). Megamorph adds a +1/+1 counter as it is turned face up. Disguise gives the face-down creature ward {2}.
- CR 708.2 to 708.4: a face-down spell or permanent has only the listed characteristics: 2/2 creature, no text (disguise: ward {2}), no name, no subtypes, no mana cost; these are its copiable values (layer 1b, CR 613.2b). It is turned face down before it goes on the stack, so its enters abilities do not apply.
- CR 708.5: its controller may look at it at any time; no other player may.
- CR 708.8: turned face up, it gets its real characteristics; effects already applied still apply; enters abilities do not trigger.
- CR 708.9: a face-down permanent or spell that leaves for another zone is revealed to all players; all are revealed at the end of the game.
- CR 903.9 and the command zone: a commander cast face down from the command zone pays the commander tax on {3}; leaving the battlefield it is revealed and the usual command-zone choice applies.

## Engine work, in order

1. **State and layer 1b.** `GameObject.faceDown?: { by: 'morph' | 'megamorph' | 'disguise' }`. `derive` applies layer 1b first: a face-down object's printed characteristics are replaced by the 2/2 nameless, textless, colorless creature (plus ward {2} for disguise); later layers (pumps, counters, control) apply as usual. Every reader of characteristics goes through `derive` already; the work is checking the few that read the printed card directly (names in events, the commander check, the mana value of a spell).
2. **Casting face down.** New named alternatives `{ kind: 'morph' | 'disguise' }` in the D-121 list, cost {3}, offered from every zone the card can be cast from; the stack object carries `faceDown`, so targets, mana value 0 and "creature spell" checks see the face-down characteristics (CR 708.4).
3. **Turning face up.** A new action `turnFaceUp { object }`, legal whenever the controller has priority and can pay the cost (mana only at first; a non-mana morph cost such as revealing a card is refused by `validateCard` with a reason). No stack, no priority pass. Megamorph adds its counter as part of the same action (CR 708.11). A new trigger kind `turnedFaceUp` for "When ~ is turned face up".
4. **Hidden information.** The core risk. `getView` shows a face-down object to its controller with the real card (CR 708.5) and to the opponent as "a face-down creature" with a stable label ("Face-down creature 1"). Events, the log, last-known information on the stack, target descriptions and the trigger-order list must not name it for the opponent: events carry object ids only, and the web resolves names through the viewer's view. Leaving the battlefield or the stack reveals it (a `revealed` event, CR 708.9), and so does the end of the game. A test audits every event and view field for a face-down object's name, oracle id and text, the way `hidden-info.test.ts` audits the library.
5. **AI.** Cast face down when the real card is not affordable or a 2/2 body is worth {3}; turn face up when affordable and useful (before blockers, or for a turned-face-up trigger); never peek at the opponent's face-down cards (the AI sees only its view).
6. **Version and soak.** One `ENGINE_VERSION` bump; a 20-game soak (D-126) with a SYNTHETIC deck style, checking that no event or view for the opponent ever names a face-down card.

Parser (a later stage): `Morph {M}`, `Megamorph {M}`, `Disguise {M}` keyword lines and "When ~ is turned face up, ..." triggers. Web (a later step): a card back for face-down objects, "Turn face up {cost}" on your own, the real card in your preview panel only, the reveal in the log.

## Not in this proposal

Manifest, cloak and manifest dread (CR 701.40, 701.58: face-down from other sources), morph costs that are not mana, copying a face-down permanent (CR 708.10; the engine's copy effects exist, so a test will pin that a copy of a face-down creature is a 2/2 face-down copy, but no card in scope needs more), and face-down exile beyond Foretell, which the "cast later" slice handles on its own.

## Alternatives

- Represent a face-down permanent as a separate token-like object linked to the card: rejected, CR 708.2 says it is the same object with different characteristics, and two objects would break last-known information, counters and attachments across turning face up.
- Hide face-down objects only in the web: rejected, the AI and replays use the same view, and hidden information must be enforced in `getView` (the engine is the only source of truth).

## Approval asked

Build steps 1 to 6 as one engine slice with its parser stage and web step, under the D-126 routine.
