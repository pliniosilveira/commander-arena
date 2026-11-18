# Decisions

A decision is recorded here only when it binds future work: an architecture or stack choice, a policy, a convention every contributor must follow, or a deliberate deviation from the Comprehensive Rules (CR) or the SPEC. How one card or one rule is implemented is not a decision: it goes in the pull request description and in a comment that cites the CR rule, and the mechanic goes in `docs/MECHANICS.md`.

Where the decisions are:

| File | Holds |
| --- | --- |
| `engine.md` | The rules engine: architecture, state, combat, hidden information, known deviations from the CR. |
| `cards.md` | Card data, the parser, support status, the golden corpus and the deck support routine. |
| `ai.md` | The AI opponent. |
| `web.md` | The web app: host, auto-pass, layout, wording. |
| `repo.md` | The repository: stack, checks, CI, public-repository rules, documentation. |
| `YYYY-MM-DD-topic.md` | A decision taken after the cleanup that created this folder, one file each. |

## Adding a decision

Create `docs/decisions/<date>-<topic>.md` (for example `2026-11-18-precon-snapshot-comment.md`). One file per decision: two pull requests never touch the same file, and there is no number to collide on. Use this template and keep it short:

```markdown
# <title>

- Context: <what forced a choice>
- Decision: <what you chose>
- Alternatives: <what you rejected and why>
- Consequences: <what this makes easier or harder>
```

Refer to a decision by its file name or by the pull request that introduced it. Do not number it.

## The old log

`docs/DECISIONS.md` held 623 entries numbered `D-001` to `D-637`, most of them about how one card or one rule was built. It was removed in a cleanup. The files here keep the entries that still bind, each under its old number so that a `D-123` in a code comment can be found with a search. Any other old entry is history: read the whole old file with `git log --diff-filter=D -n 1 --format=%H -- docs/DECISIONS.md`, then `git show <that commit>^:docs/DECISIONS.md`.
