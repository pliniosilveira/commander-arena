# Going public

The runbook for making Commander Arena public, from the owner's decision of 2026-11-11 (D-246, D-247, D-248). **It was run on 2026-11-11** (D-249): each step below says what was done. It stays as the record of how the repository was published and as the procedure to follow again if it ever has to be (a new export from `main` at that moment, never an older copy).

## The plan in one paragraph

Publish from a **new repository with a single commit** built from the tree of `main`, and keep the old repository private as the archive. A new repository is the only way to leave out the history, which still holds Wizards' Comprehensive Rules text (removed from the tree by D-246), the owner's work e-mail on every commit and links to private Claude sessions in the commit messages. A purge in place would not do it fully: as GitHub documents, old commits stay reachable through pull request references until GitHub support removes them.

## What is lost, and what moved

- Lost in the public repository: the history (one commit), `git blame`, and the issues and pull requests of the archive (#1 to #150). Documents that cite an issue or pull request number (`docs/STATUS.md`, `docs/DECISIONS.md`) keep the numbers as text; they point at the private archive, `commander-arena-archive`. The open issues were copied (new numbers, each saying which archive issue it was).
- Moved: day-to-day work (branches, pull requests, issues), the Cloudflare project, the repository scope of cloud sessions. The archive keeps its history and stays as it is.

## What was decided

| Decision | Chosen |
| --- | --- |
| Name and owner of the new repository | `pliniosilveira/commander-arena`, after renaming the old repository to `commander-arena-archive` (a rename keeps its URLs redirecting, so it was renamed first; the owner did it in the web page, the cloud sessions cannot change repository settings) |
| Author of the single commit | `Plinio Silveira` with the owner's personal address, not the work address |
| The state published | the tree of `main` at that moment, after the pending pull requests were merged |

## Steps

1. **Preflight on `main`.** Done, nothing found.

   ```sh
   node tools/public/preflight.ts            # the tracked files: Wizards' text, secrets, e-mail addresses, session links, the employer
   ```

   It reads the tree only. To also look for an employer's name, pass it in the environment (`PREFLIGHT_EMPLOYER=<name> node tools/public/preflight.ts`): the name is not written in the tool, which would publish it.

2. **Export the tree** of `main`. Done. `git archive` takes only tracked files, so whatever git ignores (including a local copy of the CR) stays out:

   ```sh
   rm -rf ../commander-arena-public && mkdir ../commander-arena-public
   git archive main | tar -x -C ../commander-arena-public
   cd ../commander-arena-public
   git init -b main && git add -A
   git -c user.name="<owner's name>" -c user.email="<the address chosen>" \
     commit -m "Commander Arena: an unofficial Magic: The Gathering Commander game"
   node tools/public/preflight.ts            # again, on the export (it needs the git checkout made just above)
   ```

3. **Point the tree at the new repository.** Not needed: the addresses in the tree already named `pliniosilveira/commander-arena` (`ISSUES_NEW_URL` in `apps/web/src/import/deck-issue.ts`, the clone line of `README.md`, the User-Agent strings of the tools), because the new repository took the old name.

4. **Create the new repository as private and push.** Done; it stayed private until step 7.

5. **Repository settings.** Done:
   - Code security: secret scanning with push protection, Dependabot alerts and security updates, private vulnerability reporting.
   - Ruleset `protect-main`: no deletion, no force push, a pull request required (0 approvals, the owner is the only maintainer) and the status check `check`.
   - Actions: read-only `GITHUB_TOKEN` by default and approval required for the first-time contributors' pull requests. Actions on standard runners are free for public repositories.
   - The Actions of `.github/workflows/` pinned to commit hashes (D-034, D-249).
   - `SECURITY.md` and `CONTRIBUTING.md` added (D-249). **Issue templates were not added**: once a template exists GitHub may show its template chooser instead of the filled-in form that the import screen's "Ask for support on GitHub" button opens (D-244), so they wait until that is tested.
   - Cloudflare: the project `commander-arena` (`wrangler.jsonc`) was disconnected from the archive and connected to the new repository (build command `pnpm install --frozen-lockfile && pnpm --filter @commander-arena/web build`, deploy `npx wrangler deploy`, preview `npx wrangler versions upload`).

6. **Check in the private new repository.** Done: the workflows were not billable while the repository was private (they failed in seconds), so the real check came after step 7 (below).

7. **Make it public** (Settings, Danger Zone, Change visibility). Done by the owner on 2026-11-11. This is the step that cannot be undone: anyone can then copy what is in it.

8. **After.** Done: the new repository was attached to the cloud sessions; `commander-arena-rules` stays private (D-247) and is attached when a session needs the CR; `docs/STATUS.md` records it. The first CI run of the public repository found four tests that had been red on `main` since the repository was private; they were fixed (`docs/STATUS.md`), and the `Full` workflow now runs every night when `main` has a new commit (D-250).

## Now that the repository is public

- **Issues come from anyone.** The description of an issue is untrusted input. The deck support routine (D-251) reads it only as data: the workflow `deck-support-triage.yml` checks it with `pnpm corpus:check-issue` and labels a complete request (only people with write access can add the label), the agent compares the description's sha256 with the one the workflow recorded, and `pnpm corpus:from-issue --no-replace` never replaces a card the corpus already holds. The owner merges every pull request.
- Pull requests from forks run the workflows with a read-only token and no secrets (they use `pull_request`, never `pull_request_target`; none uses secrets).
- The Wizards texts stay out (D-246); the Scryfall card data in the precon snapshots and the golden corpus stays (owner's decision, small risk accepted). The Fan Content Policy notice and the Scryfall credit are in the README.

## The alternative that was not chosen: purge the old repository in place

A history-rewriting tool (`git filter-repo`) can remove the two Wizards files from every commit and rewrite the author e-mail in the same pass, then force-push. It keeps the repository's name, issues and pull requests, but rewrites every commit hash (every clone and open branch breaks), and the old commits stay reachable through the pull request references until GitHub support removes them. It is the smaller job and the leakier result; the owner chose the new repository.
