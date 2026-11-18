// `node tools/corpus/top-blockers-cli.ts --file <oracle_cards> --issues <issues.json> [--top 10]`
//
// Crosses two lists: the unsupported cards among the 1,000 most popular Commander cards (EDHREC rank
// of the bulk file) and the unsupported cards named by the open "deck support" issues that carry the
// label `deck-support:ready`. Prints a Markdown report: the full unsupported top 1,000, and the cards
// that are in both lists ranked by how many ready issues name them (ties: the more popular first).
// `issues.json` is the JSON array the GitHub issues API returns (`number`, `title`, `body`).

import { readFile } from 'node:fs/promises';
import { analyzeFile } from './analyze.ts';
import { checkIssue } from './check-issue.ts';
import { reasonCategory, topByRank, UNPARSED } from './coverage.ts';

interface IssueRow {
  readonly number: number;
  readonly title: string;
  readonly body: string | null;
}

function arg(argv: readonly string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  return i === -1 ? undefined : argv[i + 1];
}

export async function main(argv: readonly string[], out: (text: string) => void): Promise<number> {
  const file = arg(argv, '--file');
  const issuesFile = arg(argv, '--issues');
  const top = Number(arg(argv, '--top') ?? '10');
  if (file === undefined || issuesFile === undefined) {
    out('usage: top-blockers-cli.ts --file <oracle_cards> --issues <issues.json> [--top 10]');
    return 2;
  }
  const result = await analyzeFile(file);
  const ranked = topByRank(result.cards, 1000);
  const why = new Map<string, string>();
  for (const card of result.unsupported) {
    const categories = new Set<string>();
    if (card.support.unparsed.length > 0) categories.add(UNPARSED);
    for (const reason of card.support.reasons) categories.add(reasonCategory(reason));
    const first = card.support.unparsed[0];
    const detail =
      first === undefined ? '' : ` — "${first.text.replace(/\s+/g, ' ').slice(0, 120)}"`;
    why.set(card.stored.name, `${[...categories].join(', ')}${detail}`);
  }
  const blocked = ranked.filter((card) => !card.supported);

  const issues = JSON.parse(await readFile(issuesFile, 'utf8')) as IssueRow[];
  const demand = new Map<string, number[]>();
  for (const issue of issues) {
    const check = checkIssue(issue.body ?? '');
    for (const name of new Set(check.unsupported)) {
      demand.set(name, [...(demand.get(name) ?? []), issue.number]);
    }
  }

  out(`# Unsupported cards of the top 1,000 vs. ready deck-support issues`);
  out('');
  out(
    `Bulk file ${result.source}, parser ${result.parserVersion}: ${blocked.length} of ${ranked.length} ` +
      `top-1000 cards unsupported. ${issues.length} ready issues read, ${demand.size} distinct unsupported cards named.`,
  );
  out('');
  const both = blocked
    .filter((card) => demand.has(card.name))
    .map((card) => ({ ...card, issues: demand.get(card.name) ?? [] }))
    .sort((a, b) => b.issues.length - a.issues.length || (a.rank ?? 0) - (b.rank ?? 0));
  out(`## Both lists: ${both.length} cards; the first ${top}`);
  out('');
  out('| # | Card | EDHREC rank | Ready issues | Blocker |');
  out('| --- | --- | --- | --- | --- |');
  both.slice(0, top).forEach((card, i) => {
    out(
      `| ${i + 1} | ${card.name} | ${card.rank} | ${card.issues.length} (${card.issues
        .slice(0, 6)
        .map((n) => `#${n}`)
        .join(' ')}${card.issues.length > 6 ? ' ...' : ''}) | ${why.get(card.name) ?? ''} |`,
    );
  });
  out('');
  out(`## All cards in both lists (${both.length})`);
  for (const card of both) out(`- ${card.name} (rank ${card.rank}, ${card.issues.length} issues)`);
  out('');
  out(`## All unsupported cards of the top 1,000 (${blocked.length}), by rank`);
  for (const card of blocked) {
    out(
      `- ${card.rank} ${card.name} [${demand.get(card.name)?.length ?? 0} issues] ${why.get(card.name) ?? ''}`,
    );
  }
  return 0;
}
