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

1. A layout `meld` in the card model: a card has a front face and names its counterpart; the pair's back face (Brisela) is one definition shared by both cards, which the store must be able to hold although neither card of the deck lists it as a card of its own.
2. A new kind of permanent: one object that stands for two cards. Zone changes of it move both cards (CR 712.21 and the rules near it: not looked up yet), and `GameObject.card` is a single card today, so every place that reads the card of an object (derive, the view, copy effects, commander tax and commander damage) needs a rule for two.
3. The effect itself: "exile them, then meld them": a new effect node and the check of CR 701.42b and 701.42c (both owned and controlled, still in the right zones).
4. The UI and the AI: a card with two images, the log line, and the AI's use of the trigger.

## Cost and risk

An estimate: a large slice, comparable to the face-down proposal (`docs/proposals/face-down.md`): the state shape changes, so `ENGINE_VERSION` moves and every derive digest of the precons is checked again. The risk is in the places that read the card of an object. Cards unlocked that are known from the repository: the two meld halves of this deck; whether other cards of the golden corpus use it is not measured here (no bulk file in the cloud sandbox).

## Not built

Until it is approved, Bruna and Gisela stay unsupported (their other lines are built on their own where independent), and the Bruna deck cannot reach "FULLY SUPPORTED" without it.
