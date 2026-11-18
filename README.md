# Commander Arena

A free, unofficial Magic: The Gathering Commander game that runs in your browser. You play one-on-one against a computer opponent. There is nothing to install and no account to create.

**[Play now: commander-arena.plinio89s.workers.dev](https://commander-arena.plinio89s.workers.dev)**

That address always runs the latest version of the game.

[![Card coverage: the share of Commander cards the game fully supports (open the report)](https://pliniosilveira.github.io/commander-arena/coverage.svg)](https://pliniosilveira.github.io/commander-arena/)

The picture shows how many Commander cards the game can play today. It is updated every Monday. If it does not load, the report is at <https://pliniosilveira.github.io/commander-arena/>.

## Status

Playable and still growing. You can play a full two-player Commander game against a computer opponent in the browser, from **Quick start** with one of the ready-made decks. Their card data ships with the game, so they start without a connection (card pictures load from Scryfall). You can also import your own Commander list from Moxfield, Archidekt, Arena or MTGO: the cards are looked up on Scryfall, checked against the Commander rules, and a report says which cards the game can play and why it cannot play the others. Only decks that follow the Commander rules and use cards the game fully supports can be played.

What exists today:

- **The rules.** The stack, the turn structure and combat, triggered, activated and static abilities, replacement and prevention effects, tokens, copies, the common keywords, commander tax and commander damage, and split, Adventure, double-faced, meld and Saga cards.
- **The opponent.** It plans its attacks and blocks by looking ahead, plans its mana and holds instants for a good moment.
- **The table.** The board, your hand, a large card preview, the stack with arrows to what each spell targets, a game log, and a question on screen for every decision the rules ask of you. Cards and tokens show their real pictures, and every card is framed in its colours (a land in the colours of its mana).
- **Nine ready-made decks**, listed below, which you can also edit.

What does not exist yet: games with more than two players, play against other people online, an opponent that plans several turns ahead, and animation beyond combat damage and deaths. `docs/ROADMAP.md` has the full list.

## How to start a game

1. Open the game with the link above.
2. Under **Quick start**, pick a deck for you and one for the opponent.
3. Press **Start game**.

The ready-made decks work without any setup:

| Deck | What it does |
| --- | --- |
| Giada Angels | A flying Angel deck led by Giada, Font of Hope. |
| Sai Artifacts | An artifact deck led by Sai, Master Thopterist. |
| Ghalta Dinosaurs | A big-creature Dinosaur deck led by Ghalta, Primal Hunger. |
| Lathliss Dragons | A Dragon deck led by Lathliss, Dragon Queen. |
| Ghoulcaller Gisa Zombies | A Zombie deck led by Ghoulcaller Gisa. |
| Witherbloom Pestilence | Sacrifice creatures and overwhelm your opponent with Pests. Led by Dina, Essence Brewer. |
| Token Triumph - Starter Commander Decks | A Commander precon led by Emmara, Soul of the Accord. |
| Lorehold Spirit - Secrets of Strixhaven | A Commander precon led by Quintorius, History Chaser. |
| Grave Danger - Starter Commander Decks | A Commander precon led by Gisa and Geralf. |

## Playing with your own deck

Press **Import a deck** and paste a Commander list copied from Moxfield, Archidekt, Arena or MTGO. The game looks the cards up, checks the list against the Commander rules, and tells you which cards it can play.

A deck can be played only when the game supports every card in it. The game never guesses at a card it does not fully understand, so a card is either supported or not. If some of your cards are not supported yet, the report says why, and the button **Ask for support on GitHub** opens a request with everything already filled in. You only press Submit. Requests are worked through in the order they arrive.

Your imported decks are saved in your browser and appear on the **Your decks** page, where you can also edit the ready-made decks.

## Controls

- **Click or drag** a card to play it.
- **Hover** over a card to see it larger. **Right-click** keeps it on screen.
- **Space** passes or confirms. The button always says where it takes you.
- **P** passes the rest of your turn. **Esc** cancels.
- **Ctrl+Z** takes back a small action, such as tapping a land for mana.
- **F** turns Full Control on or off. With it on, the game stops at every step so you can respond.

The game passes for you when there is nothing to decide, and it always stops to show you an opponent's spell before it happens. **Settings** has the theme, text size, animation speed, where the game stops, and Concede.

## What to expect

- It is Commander for two players: you against the computer. Games with more players, and games against other people online, are not available.
- The opponent never looks at your hand or at the order of any deck.
- Most common cards work, but not all of them. The picture at the top of this page shows the current share.
- Importing a deck and loading card pictures need an internet connection. The ready-made decks start without one, with plain card frames in place of pictures.
- The game is still growing. If something looks wrong, please [open an issue](https://github.com/pliniosilveira/commander-arena/issues).

## For developers

The game is open source. You need Node 22 and pnpm.

```sh
git clone https://github.com/pliniosilveira/commander-arena.git
cd commander-arena
pnpm install
pnpm dev
```

`CONTRIBUTING.md` explains how to contribute, `AGENTS.md` lists every command and the rules of the codebase, and the `docs/` folder holds the specification, the decision log, the roadmap and the current status.

## Credits

- Card data and images: [Scryfall](https://scryfall.com).
- Magic: The Gathering, its card names, text and images are property of Wizards of the Coast.

## Fan Content Policy

Commander Arena is unofficial Fan Content permitted under the Fan Content Policy. Not approved/endorsed by Wizards. Portions of the materials used are property of Wizards of the Coast. © Wizards of the Coast LLC.

## License

The code is released under the MIT License (see `LICENSE`). The license covers the code only. Magic: The Gathering card names, text and images are property of Wizards of the Coast and are not covered by it.
