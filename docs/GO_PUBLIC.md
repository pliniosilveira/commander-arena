# Going public

A runbook for making Commander Arena public, from the owner's decision of 2026-11-11 (D-246, D-247, D-248). Nothing here has been run: it is written so that going public is a short, checked sequence when the owner decides, and so that the repository is built from `main` **at that moment** (a copy made earlier would be stale).

## The plan in one paragraph

Publish from a **new repository with a single commit** built from the current tree of `main`, and keep this repository private as the archive. A new repository is the only way to leave out the history, which still holds Wizards' Comprehensive Rules text (removed from the tree by D-246), the owner's work e-mail on every commit and links to private Claude sessions in the commit messages. A purge in place would not do it fully: as GitHub documents, old commits stay reachable through pull request references until GitHub support removes them.

## What is lost, and what moves

- Lost in the public repository: the history (one commit), `git blame`, and the issues and pull requests (#1 to #149 and on). Documents that cite an issue or pull request number (`docs/STATUS.md`, `docs/DECISIONS.md`) keep the numbers as text; they point at the private archive.
- Moves: day-to-day work (branches, pull requests, issues), the Cloudflare project, the GitHub Pages workflow, the repository scope of cloud sessions. The private archive keeps its history and can stay as it is.

## Before: decide

| Decision | Suggestion |
| --- | --- |
| Name and owner of the new repository | for example `pliniosilveira/commander-arena`, after renaming this one to `commander-arena-archive` (a rename keeps its URLs redirecting, so rename it first), or another name |
| Author of the single commit | `Plinio Silveira <2287889+pliniosilveira@users.noreply.github.com>`: GitHub's no-reply form, not the work address |
| The state to publish | `main` once the pending pull requests are merged |

## Steps

1. **Preflight on `main`** and fix whatever it finds:

   ```sh
   node tools/public/preflight.ts            # the tracked files: Wizards' text, secrets, e-mail addresses, session links, the employer
   ```

   It reads the tree only. Today it reports nothing. To also look for an employer's name, pass it in the environment (`PREFLIGHT_EMPLOYER=<name> node tools/public/preflight.ts`): the name is not written in the tool, which would publish it.

2. **Export the tree** of `main`. `git archive` takes only tracked files, so whatever git ignores (including a local copy of the CR) stays out:

   ```sh
   rm -rf ../commander-arena-public && mkdir ../commander-arena-public
   git archive main | tar -x -C ../commander-arena-public
   cd ../commander-arena-public
   git init -b main && git add -A
   git -c user.name="Plinio Silveira" -c user.email="2287889+pliniosilveira@users.noreply.github.com" \
     commit -m "Commander Arena: an unofficial Magic: The Gathering Commander game"
   node tools/public/preflight.ts            # again, on the export (it needs the git checkout made just above)
   ```

3. **Point the tree at the new repository** (a pull request in the new repository, or before the single commit): `ISSUES_NEW_URL` in `apps/web/src/import/deck-issue.ts` and the address in `apps/web/e2e/import.e2e.ts`, the clone line in `README.md`, and the User-Agent strings in `tools/rules/fetch-cr.ts`, `tools/rules/fetch-cr.test.ts`, `tools/corpus/download.ts` and `docs/rules/README.md`. (`git grep pliniosilveira -- . ':!docs/DECISIONS.md' ':!docs/STATUS.md'` lists them.)

4. **Create the new repository as private and push** (`git remote add origin ... && git push -u origin main`). Keep it private until step 7.

5. **Repository settings** (Settings of the new repository):
   - Code security: turn on secret scanning with push protection, Dependabot alerts and security updates.
   - Branches: protect `main` (pull request required; status checks `typecheck, lint, build` and `unit tests` once they run).
   - Actions: allow GitHub-hosted runners, read-only `GITHUB_TOKEN` by default, and "Require approval for first-time contributors" for fork pull requests. As GitHub documents, Actions on standard runners are free for public repositories; confirm in the billing settings.
   - Pin the Actions of `.github/workflows/` to commit hashes (`docs/ROADMAP.md`, D-034): more important in a public repository.
   - Add `SECURITY.md`, `CONTRIBUTING.md` and issue templates (the "deck support" issue of D-244 is one of them).
   - Pages (`pages.yml`) and Cloudflare: connect the Cloudflare project (named `commander-arena`, `wrangler.jsonc`) to the new repository.

6. **Check in the private new repository:** the CI workflows run (when Actions has credits, or after step 7), the app builds, and `pnpm rules:fetch` plus the CR-dependent tests pass on the owner's machine.

7. **Make it public** (Settings, Danger Zone, Change visibility). This is the step that cannot be undone: anyone can then copy what is in it.

8. **After:** attach the new repository to cloud sessions; keep `commander-arena-rules` private (D-247) and attach it too when a session needs the CR; update `docs/STATUS.md` in the new repository.

## When the repository is public

- **Issues come from strangers.** `pnpm corpus:from-issue` decodes a data block from an issue description (D-245): only read blocks from issues the owner wrote, and treat any other issue as untrusted text.
- Pull requests from forks run the workflows with a read-only token and no secrets (they use `pull_request`, never `pull_request_target`; none uses secrets).
- The Wizards texts stay out (D-246); the Scryfall card data in the precon snapshots and the golden corpus stays (owner's decision, small risk accepted). The Fan Content Policy notice and the Scryfall credit are in the README.

## The alternative: purge this repository in place

A history-rewriting tool (`git filter-repo`) can remove the two Wizards files from every commit and rewrite the author e-mail in the same pass, then force-push. It keeps the repository's name, issues and pull requests, but rewrites every commit hash (every clone and open branch breaks), and the old commits stay reachable through the pull request references until GitHub support removes them. It is the smaller job and the leakier result; the owner chose the new repository.
