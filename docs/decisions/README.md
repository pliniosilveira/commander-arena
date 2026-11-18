# Decisions

This file is the whole decision record. It holds only choices that bind future work and are written nowhere else. Everything else has a home already: conventions in `AGENTS.md`, the product in `docs/SPEC.md`, the design in `docs/ARCHITECTURE.md`, limits and deviations from the CR in `docs/ROADMAP.md` and `docs/RULES_COVERAGE.md`, mechanics in `docs/MECHANICS.md`, routines in their skill.

## Adding a decision

Most pull requests add none. Before adding one:

1. **Is it a decision?** Only an architecture or stack choice, a policy, or a deliberate deviation from the CR or the SPEC. How a card or a rule is built goes in the pull request, a comment that cites the CR rule and `docs/MECHANICS.md`.
2. **Does it have a home?** If one of the documents above covers the subject, write it there, with one sentence of "why", and add nothing here.
3. **Otherwise add one bullet below:** a bold title, what was decided and why, and "rejected: X" only when someone is likely to propose X again. At most 60 words. No new file, no number, no template; the history is the pull request.

`tools/docs/decisions.test.ts` fails on any other file in this folder and on a bullet over the limit.

## The decisions

- **No grammar DSL and no parsing dependency.** The Oracle text parser is built from the repository's own combinator kit; a parser generator or parsing library needs the owner's approval first.
- **Workflow actions are pinned to commit hashes,** with the version tag as a comment, because the repository is public and a moved tag would run unreviewed code with the repository's token.

## The old log

`docs/DECISIONS.md` (entries `D-001` to `D-637`) was removed, and so were the topic files that condensed it, once each entry was found in the documents above. A `D-nnn` in a code comment is history: `git log --diff-filter=D -n 1 --format=%H -- docs/DECISIONS.md`, then `git show <that commit>^:docs/DECISIONS.md`.
