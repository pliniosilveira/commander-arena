// SYNTHETIC corpus (synthetic.ts): counts, percentages, ranking, the sole-blocker section and
// determinism, over all three input forms.

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { analyzeFile } from './analyze.ts';
import { buildBacklog, cardWeight, UNRANKED_WEIGHT } from './backlog.ts';
import { coverageStats, reasonBreakdown, topByRank } from './coverage.ts';
import { tempDir, writeForms } from './fixture-files.ts';
import { renderBacklog, renderTemplatesJson } from './render-backlog.ts';
import { renderCoverage } from './render-coverage.ts';
import { card, rankedFiller, SHAPE_B, syntheticCards } from './synthetic.ts';

const A = 'Whenever SYNTHETIC glorp N, frobnicate target gizmo.';
const B = 'SYNTHETIC wibble: zork each plinth.';
const C = 'At the beginning of your upkeep, quux a snark.';

describe('analyzeFile over the synthetic corpus', () => {
  test('gives the same result for gzipped JSONL, JSONL and a JSON array', async () => {
    const forms = await writeForms(syntheticCards());
    const results = [];
    for (const file of [forms.gz, forms.jsonl, forms.json]) {
      const result = await analyzeFile(file);
      results.push({ ...result, source: '' });
    }
    expect(results[1]).toEqual(results[0]);
    expect(results[2]).toEqual(results[0]);
    const [result] = results;
    // 26 cards in the file; 3 are not Commander-legal (not_legal, banned, token).
    expect(result?.read).toBe(26);
    expect(result?.notLegal).toBe(3);
    expect(result?.cards).toHaveLength(23);
    expect(result?.malformed).toBe(0);
  });

  test('keeps the restricted card and drops the banned one; --all keeps everything', async () => {
    const forms = await writeForms(syntheticCards());
    const names = (await analyzeFile(forms.jsonl)).cards.map((c) => c.name);
    expect(names).toContain('SYNTHETIC Restricted Vanilla');
    expect(names).not.toContain('SYNTHETIC Banned Vanilla');
    const all = await analyzeFile(forms.jsonl, { all: true });
    expect(all.cards).toHaveLength(26);
    expect(all.notLegal).toBe(0);
  });

  test('counts supported cards and percentages overall and for the top lists', async () => {
    const forms = await writeForms(syntheticCards());
    const result = await analyzeFile(forms.gz);
    // Supported: 5 vanilla, 3 fliers, the mana rock, the unranked vanilla, the restricted one.
    expect(result.unsupported).toHaveLength(12);
    const stats = coverageStats(result.cards);
    expect(stats.all).toEqual({ supported: 11, total: 23 });
    // Two cards (the unranked vanilla and the unranked glorper) have no rank.
    expect(stats.unranked).toBe(2);
    expect(stats.ranked).toBe(21);
    expect(stats.top500).toEqual({ supported: 10, total: 21 });
    expect(stats.top1000).toEqual({ supported: 10, total: 21 });
  });

  test('the top lists cut at 500 and 1,000 by rank, lowest rank first', async () => {
    // 1,100 ranked filler cards from rank 2000 on: the first 600 supported, the rest not.
    const cards = [...syntheticCards(), ...rankedFiller(1100, 600)];
    const forms = await writeForms(cards);
    const result = await analyzeFile(forms.jsonl);
    const top = topByRank(result.cards, 1000);
    expect(top).toHaveLength(1000);
    expect(top.map((c) => c.rank)).toEqual(
      [...top.map((c) => c.rank)].sort((a, b) => (a ?? 0) - (b ?? 0)),
    );
    const stats = coverageStats(result.cards);
    // The 21 ranked synthetic cards come first (ranks 2 to 1500), then filler from rank 2000.
    expect(stats.top500.total).toBe(500);
    expect(stats.top500.supported).toBe(10 + (500 - 21));
    expect(stats.top1000.total).toBe(1000);
    // Filler cards 0..978 are in the top 1,000; those below 600 are supported.
    expect(stats.top1000.supported).toBe(10 + 600);
  });

  test('breaks unsupported cards down by reason', async () => {
    const forms = await writeForms(syntheticCards());
    const rows = reasonBreakdown((await analyzeFile(forms.jsonl)).unsupported);
    const row = (category: string) => rows.find((r) => r.category === category);
    expect(row('unparsed abilities')).toEqual({
      category: 'unparsed abilities',
      cards: 12,
      only: 10,
    });
    // Only the flip card (the engine models transform since D-087, so the double-faced card's one
    // reason is its unparsed shape).
    expect(row('layout')?.cards).toBe(1);
    expect(row('* power or toughness')).toEqual({
      category: '* power or toughness',
      cards: 1,
      only: 0,
    });
  });
});

describe('backlog ranking', () => {
  async function backlogOf(cards: readonly object[]) {
    const forms = await writeForms(cards);
    const result = await analyzeFile(forms.jsonl);
    return { result, backlog: buildBacklog(result.unsupported, result.cards) };
  }

  test('ranks shapes by summed popularity and counts the cards each blocks', async () => {
    const { backlog } = await backlogOf(syntheticCards());
    expect(backlog.rows.map((r) => r.template)).toEqual([A, B, C]);
    expect(backlog.rows.map((r) => r.cards)).toEqual([6, 4, 3]);
    // A: ranks 2, 7, 10, 20, 40 and one unranked card.
    const expectedA = 1 / 2 + 1 / 7 + 1 / 10 + 1 / 20 + 1 / 40 + UNRANKED_WEIGHT;
    expect(backlog.rows[0]?.weight).toBeCloseTo(expectedA, 6);
    // B: ranks 5, 7, 90 and 600.
    expect(backlog.rows[1]?.weight).toBeCloseTo(1 / 5 + 1 / 7 + 1 / 90 + 1 / 600, 6);
    // The numbers in shape A were normalised: one shape, six cards, six abilities.
    expect(backlog.rows[0]?.abilities).toBe(6);
  });

  test('lists the first names most popular first, with an example text', async () => {
    const { backlog } = await backlogOf(syntheticCards());
    expect(backlog.rows[0]?.topCards.slice(0, 3)).toEqual([
      'SYNTHETIC Star Glorper',
      'SYNTHETIC Double Shape',
      'SYNTHETIC Glorper 1',
    ]);
    expect(backlog.rows[0]?.example).toMatch(/^Whenever SYNTHETIC glorp \d, frobnicate/);
  });

  test('caps the card names at ten', async () => {
    const many = Array.from({ length: 15 }, (_, i) =>
      card(`Many ${i}`, { rank: 3000 + i, oracle_text: SHAPE_B }),
    );
    const { backlog } = await backlogOf(many);
    expect(backlog.rows[0]?.cards).toBe(15);
    expect(backlog.rows[0]?.topCards).toHaveLength(10);
  });

  test('the sole-blocker section holds only cards that one shape would unlock', async () => {
    const { backlog } = await backlogOf(syntheticCards());
    // Shape A: 4 of its 6 cards (the star-power card and the A+B card would stay blocked).
    // Shape B: 2 of 4 (the flip layout card and the A+B card would stay blocked).
    // Shape C: 3 of 3 (the transform layout is supported, so the double-faced card counts too).
    const solo = new Map(backlog.solo.map((r) => [r.template, r]));
    expect(solo.get(A)?.soloCards).toBe(4);
    expect(solo.get(B)?.soloCards).toBe(2);
    expect(solo.get(C)?.soloCards).toBe(3);
    // A different order from the main ranking: B unlocks more popularity alone than A does.
    expect(backlog.solo.map((r) => r.template).slice(0, 2)).toEqual([B, A]);
    expect(solo.get(B)?.soloTopCards).toEqual(['SYNTHETIC Wibbler 1', 'SYNTHETIC Wibbler 2']);
    expect(solo.get(A)?.soloWeight).toBeCloseTo(1 / 10 + 1 / 20 + 1 / 40 + UNRANKED_WEIGHT, 6);
  });

  test('weights: 1 / rank, with a small floor for cards without a rank', () => {
    expect(cardWeight(1)).toBe(1);
    expect(cardWeight(250)).toBe(0.004);
    expect(cardWeight(null)).toBe(UNRANKED_WEIGHT);
    expect(UNRANKED_WEIGHT).toBeLessThan(cardWeight(30_000));
  });
});

describe('reports', () => {
  async function render(file: string, all = false) {
    const result = await analyzeFile(file, { all });
    const backlog = buildBacklog(result.unsupported, result.cards);
    return {
      result,
      coverage: renderCoverage(
        result,
        coverageStats(result.cards),
        reasonBreakdown(result.unsupported),
        [],
        backlog,
      ),
      backlogMd: renderBacklog(result, backlog),
      json: renderTemplatesJson(result, backlog, 1000),
    };
  }

  test('are identical on two runs, and independent of the input form and the order of the file', async () => {
    const cards = syntheticCards();
    const forms = await writeForms(cards);
    const first = await render(forms.gz);
    const second = await render(forms.gz);
    expect(second).toEqual(first);
    expect(await render(forms.json)).toMatchObject({ coverage: expect.any(String) });
    const reversed = await writeForms([...cards].reverse());
    const other = await render(reversed.gz);
    expect(other.backlogMd).toBe(first.backlogMd);
    expect(other.json).toBe(first.json);
  });

  test('carry the header line and no timestamps', async () => {
    const forms = await writeForms(syntheticCards());
    const { coverage, backlogMd, json } = await render(forms.gz);
    expect(coverage).toContain('Generated from oracle.jsonl.gz, 23 cards, parser version ');
    expect(backlogMd).toContain('Generated from oracle.jsonl.gz, 23 cards, parser version ');
    expect(`${coverage}${backlogMd}${json}`).not.toMatch(/20\d\d-\d\d-\d\d|T\d\d:\d\d/);
  });

  test('coverage.md states the numbers and the rank exclusion', async () => {
    const forms = await writeForms(syntheticCards());
    const { coverage } = await render(forms.jsonl);
    expect(coverage).toContain('| All | 11 | 23 | 47.83% |');
    expect(coverage).toContain('| Top 500 by EDHREC rank | 10 | 21 | 47.62% |');
    expect(coverage).toContain('2 of 23 cards have no rank and are excluded');
    expect(coverage).toContain('| unparsed abilities | 12 | 10 |');
  });

  test('backlog.md has the ranked list and the sole-blocker section', async () => {
    const forms = await writeForms(syntheticCards());
    const { backlogMd } = await render(forms.jsonl);
    expect(backlogMd).toContain(
      '## Templates that block cards that have only this one unparsed shape',
    );
    expect(backlogMd).toContain('## Ranked work order');
    expect(backlogMd.indexOf(`\`${B}\``)).toBeLessThan(backlogMd.indexOf('## Ranked work order'));
  });

  test('templates.json is machine readable and capped', async () => {
    const forms = await writeForms(syntheticCards());
    const { result } = await render(forms.jsonl);
    const backlog = buildBacklog(result.unsupported, result.cards);
    const parsed = JSON.parse(renderTemplatesJson(result, backlog, 2));
    expect(parsed.totalTemplates).toBe(3);
    expect(parsed.templates).toHaveLength(2);
    expect(parsed.templates[0]).toMatchObject({ template: A, cards: 6, soloCards: 4 });
    expect(typeof parsed.templates[0].weight).toBe('number');
    expect(parsed.templates[0].example).toMatch(/glorp/);
  });

  test('a malformed line is skipped and counted, and the report says so', async () => {
    const dir = await tempDir();
    const file = path.join(dir, 'oracle.jsonl');
    const good = (await readFile((await writeForms(syntheticCards())).jsonl, 'utf8')).split('\n');
    good.splice(5, 0, '{"truncated": ');
    good.splice(9, 0, '{"name":"no ids"}');
    await writeFile(file, good.join('\n'));
    const { result, coverage } = await render(file);
    expect(result.malformed).toBe(1);
    expect(result.rejected).toBe(1);
    expect(result.cards).toHaveLength(23);
    expect(coverage).toContain('Malformed lines skipped: 1');
    expect(coverage).toContain('line 6: not valid JSON');
  });
});
