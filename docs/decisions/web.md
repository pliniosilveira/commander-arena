# Web app decisions

Entries keep their old numbers (see `README.md`).

- **D-044 A framework-free host behind a Comlink Worker.** `GameHost` owns the only `GameState`, applies the human's action, then lets the AI answer until the human is asked something; the page receives snapshots (the human's `GameView`, the steps applied) and never state.
- **D-018, D-045, D-199 Auto-pass is a pure policy** (`shouldStop(view, settings)`): the game passes when nothing relevant can be done, stops at Arena-style default stops, and always stops to show an opponent's spell before it resolves (the card, its X and what it did stay on screen). Auto-passes are recorded as ordinary pass actions. A relevant action is one the engine lists as affordable and instant-speed; the player's own spell resolves without a click.
- **D-143 Pass Turn** is a yield until the end of the player's turn, with its own button and key; **D-141:** the pass button names the next step and Concede lives in Settings.
- **D-050 Undo** takes back small human actions (land, cast, activate, targets, payment) inside one priority window, only while nothing hidden, random or forward-moving happened.
- **D-049 A static site** deployed with Cloudflare (free tier, Git integration, no secrets in the repository).
- **D-165, D-166 No player-facing save, load, replay export or support-request inbox.** The seed stays (`?seed=`).
- **D-215 Deck picks** are a precon id or `saved:<deck id>`; the opponent's deck may be any saved deck.
- **D-019, D-153, D-241 Layout.** A fixed preview panel shows the object as it currently is (not a cursor tooltip); dense boards group identical tokens with a count badge; a turn is named by its round ("Your turn 5"); the active player's area is marked by its border alone.
- **D-547 Cards are framed in their colours,** a land in the colours of its mana, and card art is never darkened (D-240).
- **D-243, D-609 Designations as small cards:** the monarch, the Ring and emblems sit in a strip beside the battlefield, floating over it so rows keep their width.
- **D-228 Combat animations** are ordered by a pure model (`combat-effects.ts`) with a speed setting and a wait in the autopilot.
