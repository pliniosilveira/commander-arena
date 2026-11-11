# docs/rules

The Comprehensive Rules (CR) of Magic: The Gathering, as a local plain text file, plus the tools and records around it. The SPEC (section 5, A17, A24) says to look rules up here instead of relying on memory.

**Current state: the CR effective September 25, 2026 is in this folder and verified.** The cloud session cannot download it (`magic.wizards.com` and `media.wizards.com` are blocked by the network policy), so the owner ran `pnpm rules:fetch` locally and committed the result. See `RULES_VERSION.md` for the hash, the bulletin applied and the citation check, and `bulletins/` for bulletin texts.

## Files

| File | What it is | Committed? |
| --- | --- | --- |
| `comprehensive-rules.txt` | The CR plain text, exactly as downloaded. The canonical name; `pnpm rule` reads it. | **No** (D-246): ignored by git; fetch it with `pnpm rules:fetch`. It was committed on 2026-10-20 and removed on 2026-11-11; the history still holds it. |
| `bulletins/*.md` | Update Bulletin texts, one file per bulletin, with source and date. | **No** (D-246): ignored by git, like the CR. The planeswalker type table was generated with them; its test skips when they are absent. |
| `rules-source.json` | Metadata about the downloaded file: source URL, original file name, sha256, byte size, fetch time, effective date. Written by `pnpm rules:fetch`. Contains no CR text. | Yes, once it exists. It is the proof of which file was used. |
| `RULES_VERSION.md` | The verification record (SPEC A17): effective date, bulletins checked, rule numbers re-checked. Written by hand. | Yes. |
| `README.md` | This file. | Yes. |
| `*.tmp` | Temporary names used while writing a download. They are renamed or deleted before the tool exits; never commit one. | No. |

The tool code is in `tools/rules/`. Its test fixture, `tools/rules/fixtures/synthetic-cr.txt`, is SYNTHETIC filler written to imitate the CR layout. It is not Wizards text and must never be copied into this folder or used as a rules source.

## The license question (settled by removal, D-246)

The CR is copyrighted by Wizards of the Coast. It is free to read and download on their site, but nothing in this repository shows that Wizards allows the text, or the Update Bulletin texts, to be redistributed in a public git repository, so **they are not committed** (D-246, 2026-11-11):

- `docs/rules/comprehensive-rules.txt` and `docs/rules/bulletins/` are in `.gitignore`.
- Everyone who needs the text runs `pnpm rules:fetch` on their own machine (the cloud sandbox cannot: `magic.wizards.com` is blocked).
- A copy kept elsewhere is used with `COMMANDER_ARENA_CR_FILE=<path>` (tools and tests) or `pnpm rule --file <path>` (one lookup).
- **Cloud sessions:** the owner keeps a private repository, `pliniosilveira/commander-arena-rules`, with the CR text (checksum in its README, the same file as `rules-source.json`) and the bulletin. Attach it to the session, clone it, and set `COMMANDER_ARENA_CR_FILE` to its `comprehensive-rules.txt`; the bulletin goes in `docs/rules/bulletins/` (git ignores it). That repository must stay private and its files must not be copied into this one.
- The checks that compare a table with the rules text skip when the file is absent and run when it is there: `tools/creature-types/*.test.ts`, `tools/rules/cr-real.test.ts`, and the CR blocks of `packages/cards/test/parser-p1`, `parser-p15` and `parser-p3-statics`. CI never has the file. The tables they check (creature types, planeswalker types) are lists of type names and stay committed.
- The git history before this change still contains the files.

## `pnpm rule`: look up a rule

```sh
pnpm rule 702.19b            # a rule or sub-rule: its text, its examples, and its sub-rules if any
pnpm rule 702.19             # the rule and all its lettered sub-rules, with examples
pnpm rule 702                # the outline of subsection 702: one line per rule
pnpm rule 7                  # the outline of section 7: one line per subsection
pnpm rule 100.1a 704.5       # several numbers, printed in turn
pnpm rule --search trample   # ranked matches in titles, rule text, examples and the glossary
pnpm rule --search first strike --limit 10
pnpm rule --glossary trample # a glossary entry (exact name first, then related entries)
pnpm rule --check            # parser diagnostics for the file
pnpm rule --file other.txt 702   # read another file (for example a newer download) instead
```

The numbers above are only examples of the syntax. Whether a given number exists, and what it says, depends on the file.

What you get:

- A citation line in the project's format (SPEC A15, D-015), for example `CR 702.19b (Trample)`, and the path of headings above the rule. The title in the citation is the rule's own title, or that of the nearest ancestor that has one. Use it in code comments.
- A number is accepted loosely: `702.19B`, `702.19.`, `rule 702.19` and `CR 702.19` all work.
- Output is wrapped at 100 columns. Sub-rules are indented under their rule; examples are printed as `Example: ...` under the rule they belong to.
- Search ranks title and glossary-term matches first (exact, then prefix, then whole word, then substring), then rule text, then examples and glossary definitions. Straight and curly quotes are treated alike.
- `--check` prints the counts the parser found (sections, subsections, rules, sub-rules, examples, glossary entries), the effective date, and every line the parser could not place, with line numbers.

Exit codes:

| Code | Meaning |
| --- | --- |
| 0 | Success. |
| 1 | Number not found, search or glossary had no match, or `--check` found no numbered rules at all. |
| 2 | The CR file is missing or unreadable. The message says exactly how to get it (`pnpm rules:fetch`, or save the plain text file by hand as `docs/rules/comprehensive-rules.txt`) and that `RULES_VERSION.md` must then be updated. |
| 64 | Usage error (unknown option, text where a rule number was expected, no arguments). |

## `pnpm rules:fetch`: download the CR

```sh
pnpm rules:fetch --dry-run        # find the link, print every candidate, download nothing
pnpm rules:fetch                  # download, parse, write comprehensive-rules.txt and rules-source.json
pnpm rules:fetch --url <url>      # download this URL instead of discovering one
pnpm rules:fetch --force          # replace an existing comprehensive-rules.txt
```

What it does:

1. Requests `https://magic.wizards.com/en/rules` and collects every link to a `.txt`, `.pdf`, `.doc` or `.docx` file. It prints all of them with a score and the reasons. No dated URL is hardcoded.
2. Picks the plain text link that looks like the Comprehensive Rules (file name containing "Comp" and "Rules", or link text saying Comprehensive Rules). If it cannot choose with confidence, or two links tie, it prints them and exits with code 4; you then pass the right one with `--url`.
3. Downloads it with the User-Agent `CommanderArena-tools/0.0.0 (+https://github.com/pliniosilveira/commander-arena)` and an `Accept` header.
4. Refuses content that is empty, larger than 25 MiB, or HTML (an error page saved as text is not the rules).
5. Writes through temporary names in this folder and renames them when both files are complete, so a failed or interrupted download never leaves a partial file. An existing file is only replaced with `--force`.
6. Records `rules-source.json` and prints what it wrote, including the sha256 and the effective date it parsed from the text.

`rules-source.json` fields: `schema`, `sourceUrl` (the final URL after redirects), `requestedUrl`, `discovery` (`rules-page` or `explicit-url`), `originalFileName`, `sha256` (of the exact bytes saved), `byteSize`, `fetchedAt` (ISO time), `encoding`, `effectiveDate` (YYYY-MM-DD or null), `effectiveDateText` (as written in the file, or null), and `parse` (counts the parser found).

Exit codes:

| Code | Meaning |
| --- | --- |
| 0 | Done (or dry run finished). |
| 1 | `comprehensive-rules.txt` already exists and `--force` was not given. Nothing was downloaded. |
| 3 | Network failure or an HTTP error status. The message names the host that failed. |
| 4 | No usable plain text link on the rules page, or several equally likely ones. Use `--url`. |
| 5 | The download was refused (empty, too large, or HTML). Nothing was written. |
| 6 | The files could not be written. No partial file is left; if only `rules-source.json` failed, the message says so and asks for `--force`. |
| 7 | The file was installed but the parser found no numbered rules. The real layout differs from the assumptions below. Inspect the file and fix the parser. |
| 64 | Usage error. |

If the host is unreachable:

- Node's `fetch` ignores `HTTPS_PROXY` unless `NODE_USE_ENV_PROXY=1` is set. On a machine that reaches the internet through a proxy, run `NODE_USE_ENV_PROXY=1 pnpm rules:fetch`.
- Cloud sessions and some corporate networks block hosts by policy. An HTTP 403 or a failed CONNECT tunnel usually means that. Do not work around it.
- Fallback: open `https://magic.wizards.com/en/rules` in a browser, save the plain text Comprehensive Rules as `docs/rules/comprehensive-rules.txt`, and fill in `RULES_VERSION.md` by hand, including the sha256 (`sha256sum docs/rules/comprehensive-rules.txt`).

After any download, finish the verification in `RULES_VERSION.md` (the checklist is inside).

## Parser diagnostics

`pnpm rule --check` lists everything the parser did not understand. Kinds:

| Kind | Meaning |
| --- | --- |
| `unparsed-line` | A line that matches no known shape and has no rule directly above it to attach to. |
| `continuation-line` | A line with no recognizable shape, directly under a rule or example with no blank line between. It was appended to that rule or example, which is a guess. |
| `orphan-example` | An `Example:` line with no rule above it. |
| `duplicate-number` | A number defined twice. The first definition is kept. |
| `missing-parent` | A rule such as `100.1a` whose `100.1` does not exist. It is attached to the nearest ancestor that does. |
| `glossary-term-without-definition` | A glossary block with only a term line. If this shows up in bulk, the glossary layout assumption is wrong. |
| `contents-mismatch` | The Contents list and the body headings disagree. |
| `missing-effective-date`, `no-rules-found`, `no-glossary-found` | Whole-file checks. |
| `suspected-mojibake`, `replacement-character` | The text was decoded with the wrong encoding. |

On a correct parse of a real file, expect no diagnostics, or a short list you can explain. A long list means the format assumptions below are wrong somewhere; fix the parser (`tools/rules/cr.ts`) and add a case to the tests.

## Format assumptions (verified against the September 25, 2026 file)

The parser was written from public knowledge of the file and first tested only against the SYNTHETIC fixture. On 2026-10-20 it was run on the real file: all assumptions held except two quirks, now handled and tested in `tools/rules/cr-real.test.ts`: U+2028 soft breaks inside an entry (converted to newlines) and rule 606.5, whose number has no trailing period (the period is optional). `RULES_VERSION.md` has the details.

Encoding and lines:

1. The file is plain text in UTF-8 (possibly with a BOM) or Windows-1252, with CRLF or LF line endings. Decoding: a BOM decides; otherwise strict UTF-8, then Windows-1252 (decoded by hand, because Node's `TextDecoder` treats it as Latin-1).
2. Curly quotes are used in the text and are kept as they are.

Header:

3. The first non-blank line is the title.
4. A line `These rules are effective as of <Month D, YYYY>.` appears before the body.
5. An introduction follows, then a line containing only `Contents`, then a list of headings, ending with the lines `Glossary` and `Credits`. The body starts at the first heading that repeats a Contents entry, or after the `Credits` line of the Contents list.

Body:

6. A section heading is one digit, a period, a space and a title (`1. Game Concepts`). A subsection heading is three digits, a period, a space and a title (`100. General`).
7. A rule is `NNN.N.` with a period after the number and then the text (`100.1. text`); the period is optional because 606.5 lacks it. A sub-rule is the rule number plus one or two lowercase letters, with no period, then the text (`100.1a text`). A period after the letters is tolerated.
8. Each rule is on one physical line, although a line may contain U+2028 soft breaks. Paragraphs are separated by blank lines. A line of unknown shape directly under a rule, with no blank line between, is treated as a continuation of it and reported.
9. `Example:` lines belong to the nearest rule or sub-rule above them, whether or not a blank line separates them.
10. A rule whose text is short (80 characters or fewer), is not a sentence (does not end in `.`, `:`, `;`, `!` or `?`) and has sub-rules is a heading-like rule such as `702.19. Trample`. Its text is used as its title, for search ranking and for citations. This is a heuristic.
11. Section numbers are one digit and subsection numbers are three digits, so a rule's parent can be derived from its number.

Glossary and credits:

12. A line containing only `Glossary` starts the glossary, only after at least one rule has been seen. Entries are blocks separated by blank lines. The first line of a block is the term, the remaining lines are the definition (numbered meanings on their own lines). A term line may list several comma-separated names; each is searchable. If the real file puts a blank line between a term and its definition, every entry will be reported as `glossary-term-without-definition`.
13. A line containing only `Credits` ends the glossary. Everything after it is free text and is not parsed.

Download page (used only by `pnpm rules:fetch`):

14. The HTML of `https://magic.wizards.com/en/rules` contains the link to the plain text file (it is not built by JavaScript). The file name contains "Comp" and "Rules", ends in `.txt`, and is probably hosted on `media.wizards.com`. The site does not refuse the tool's User-Agent. None of this was seen; if discovery fails, use `--url`.

## What the tests prove, and what they do not

`tools/rules/*.test.ts` run in `pnpm test` with no network and no real CR. They prove that the parser, lookup, search ranking, CLI behavior, discovery heuristics and the atomic download logic behave as documented on synthetic input, and that odd input never throws. `tools/rules/cr-real.test.ts` additionally parses the committed real file and pins its hash, its counts and the two quirks above, so a parser change that drops a real rule fails the suite.
