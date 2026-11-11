# Security policy

Commander Arena is a static website: the rules engine and the AI run in your browser, there is no server of ours, no account and no stored personal data. The decks you save stay in your browser. The app calls Scryfall's public API to look up cards you import.

## Reporting a vulnerability

Please report a security problem privately, not in a public issue: use GitHub's **Report a vulnerability** button on the repository's Security tab (private vulnerability reporting). Say what you found, how to reproduce it and what it could do.

This is a small project maintained by one person in spare time: expect a reply within a few days, not hours. There is no bounty.

## What counts

- Script injection or other unsafe handling of imported decklists, card text or issue data in the web app or the tools.
- A weakness in the build, the GitHub workflows or the dependencies that could run untrusted code or leak a secret.

Rules bugs, a wrong card behaviour or a crash in a game are not security problems: open a normal issue.
