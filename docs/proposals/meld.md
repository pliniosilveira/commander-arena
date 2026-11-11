# Proposal: meld (S-class, waits for the owner's approval)

Written by the deck-support routine for issue 5 (the Bruna deck). Nothing of it is built. The rule text below was read with `pnpm rule` from the CR copy of the owner's private rules repository; the card text is the issue author's (not checked against Scryfall).

## Why it is a subsystem

Cards: Bruna, the Fading Light and Gisela, the Broken Blade (the deck's commander and a card of it); their melded back face, Brisela, Voice of Nightmares, is not in the deck's list.

The text of the melded face was supplied by the owner in chat (not checked against Scryfall, not in the golden corpus):

- Brisela, Voice of Nightmares: Legendary Creature, Eldrazi Angel, 9/10. Flying, first strike, vigilance, lifelink. "Your opponents can't cast spells with mana value 3 or less."

The last line needs a casting restriction on opponents by mana value, which may exist already (to be checked when the proposal is worked); the four keywords exist. By CR 202.3c its mana value is the combined mana cost of the two front faces ({5}{W}{W} and {2}{W}{W}, so 11).

- CR 701.42a (Meld): meld puts two cards of a meld pair onto the battlefield with their back faces up and combined; the result is one object represented by two cards.
- CR 701.42b, 701.42c: only the two cards of one pair can be melded; a token or a non-meld card can't; what can't be melded stays where it is.
- CR 712.4, 712.4a, 712.4b, 712.8b, 712.14c: a meld card has a front face and half of an oversized back face; the back faces count only for the melded permanent; on the stack only the front face counts; the two cards enter as a single permanent.
- CR 202.3c: the mana value of the melded permanent is the combined mana cost of the two front faces.

## What the engine would need

1. The data of the melded face comes from Scryfall like any other card (owner's instruction, in chat): Brisela, Voice of Nightmares has its own Scryfall card, with its own Oracle text and its own art, and the game downloads that image like any card image. Nothing is invented or hard-coded. The stored card already keeps `relatedParts` (the name and the component of each entry of Scryfall's `all_parts`, `packages/cards/src/scryfall/schema.ts`), so a meld card can name its counterpart and the melded result from its own data; my understanding is that the entry of the melded result has the component `meld_result` and the other half `meld_part`, which is UNVERIFIED here (the cloud sandbox cannot reach Scryfall; the owner's bulk file or a card of the issue would show it). The work is to fetch and cache that result card with the pair (the import screen and the card cache today fetch the names of the decklist only), to give the layout `meld` a place in `CardLayout` (it is listed as unsupported in `packages/cards/src/convert/layout.ts`) and to make a deck's cards carry the third card (the melded result) although it is not in the decklist.
2. One permanent that two cards represent, only while it is on the battlefield (CR 712.4a, 712.8g). Outside the battlefield there are two ordinary cards, each in its own zone and with its own front face (CR 712.4b: the back faces matter only for the melded permanent); on the battlefield there is one object with the characteristics of the combined back face and the sum of the two front mana values (CR 202.3c). When it leaves, one permanent leaves and two cards arrive (CR 712.21): "whenever a creature dies" triggers once, "whenever a card is put into a graveyard from anywhere" twice (CR 712.21, 712.21e); for a graveyard or a library the owner orders the two cards (712.21a); for exile the owner picks their timestamp order (712.21b); an effect that finds the new object finds both cards (712.21c). A commander that is melded stays the owner's commander (CR 903.3b), and if the owner puts the permanent into the command zone, only the commander card goes there and the other card goes to the zone it would have gone to (CR 903.9c). Copying it copies the combined face but its mana value is 0 (CR 707.8, 712.8g). It can't be transformed or turned face down (CR 712.4c, 712.16).

   What it costs in the engine is only the battlefield side: a battlefield `GameObject` has exactly one `card` today, so it needs a second card (the counterpart) while melded, and the readers of that field (derive for the face to use, the view, copy effects, commander tax and commander damage, the zone-change code that must now create two objects with two events) need a rule for it. The model of the cards themselves in every other zone does not change.
3. The effect itself: "exile them, then meld them": a new effect node and the check of CR 701.42b and 701.42c (both owned and controlled, still in the right zones).
4. The UI and the AI: a card with two images, the log line, and the AI's use of the trigger.

## Cost and risk

An estimate: a large slice, comparable to the face-down proposal (`docs/proposals/face-down.md`): the state shape changes, so `ENGINE_VERSION` moves and every derive digest of the precons is checked again. The risk is in the places that read the card of an object. Cards unlocked that are known from the repository: the two meld halves of this deck; whether other cards of the golden corpus use it is not measured here (no bulk file in the cloud sandbox).

## Not built

Until it is approved, Bruna and Gisela stay unsupported (their other lines are built on their own where independent), and the Bruna deck cannot reach "FULLY SUPPORTED" without it.
