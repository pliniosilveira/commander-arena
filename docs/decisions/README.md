# Decisions

The choices that bind future work, as short bullets in five topic files. Read the file for the area you change, not the folder.

| File | Holds |
| --- | --- |
| `engine.md` | The rules engine: architecture, state, combat, hidden information, known deviations from the CR. |
| `cards.md` | Card data, the parser, support status, the golden corpus and the deck support routine. |
| `ai.md` | The AI opponent. |
| `web.md` | The web app: host, auto-pass, layout, wording. |
| `repo.md` | The repository: stack, checks, CI, public-repository rules, documentation. |

## Adding a decision

Most pull requests add none. Before adding one, check:

1. **Is it a decision?** Only an architecture or stack choice, a policy, or a deliberate deviation from the CR or the SPEC. How a card or a rule is built goes in the pull request, a comment that cites the CR rule and `docs/MECHANICS.md`.
2. **Is it already written where it is applied?** A convention stated in `AGENTS.md`, the playbook or a skill needs no bullet here; put one sentence of "why" next to the rule itself.
3. **Then add one bullet** to the topic file, in the section it belongs to: a bold title, what was decided and why, and "rejected: X" only when someone is likely to propose X again. At most 60 words. No new file, no number, no Context/Alternatives/Consequences template; the history is the pull request.

`tools/docs/decisions.test.ts` fails on any other file in this folder and on a bullet over the limit.

## The old log

`docs/DECISIONS.md` (entries `D-001` to `D-637`) was condensed into these files; the kept entries carry their old numbers so a `D-123` in a code comment can be searched for. The rest is history: `git log --diff-filter=D -n 1 --format=%H -- docs/DECISIONS.md`, then `git show <that commit>^:docs/DECISIONS.md`.
