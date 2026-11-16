// The issues the workflow "Precon issues" opens, judged against a SYNTHETIC bulk file (tools/corpus/synthetic.ts): invented cards, no real precon.

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { tempDir, writeForms } from '../corpus/fixture-files.ts';
import { card, syntheticCards } from '../corpus/synthetic.ts';
import { buildIssues, isOutsideTheDeck } from './issues.ts';

/** The synthetic cards, a basic land to fill a deck to 100, and ten SYNTHETIC planes (the planar deck of a box). */
function bulkCards() {
  const cards = syntheticCards();
  cards.push(
    card('Forest', {
      type_line: 'Basic Land — Forest',
      mana_cost: undefined as never,
      oracle_text: '{T}: Add {G}.',
      power: undefined as never,
      toughness: undefined as never,
      cmc: 0,
      colors: [],
      color_identity: ['G'],
    }),
  );
  for (let i = 1; i <= 10; i++) {
    cards.push(
      card(`Plane ${i}`, {
        type_line: 'Plane — Synthia',
        mana_cost: undefined as never,
        oracle_text: '',
        power: undefined as never,
        toughness: undefined as never,
        cmc: 0,
        colors: [],
      }),
    );
  }
  return cards;
}

/** A decklist of exactly 100 cards: the commander, the given main deck lines and Forests for the rest. */
function deckOf(main: readonly [number, string][], extra = ''): string {
  const used = 1 + main.reduce((sum, [n]) => sum + n, 0);
  const lines = main.map(([n, name]) => `${n}x ${name}`).join('\n');
  return `Commander\n1x SYNTHETIC Vanilla 1\n\nMainboard\n${lines}\n${100 - used}x SYNTHETIC Forest\n${extra}`;
}

const SUPPORTED = deckOf([[2, 'SYNTHETIC Vanilla 2']]);
const BLOCKED = deckOf([
  [1, 'SYNTHETIC Glorper 1'],
  [1, 'SYNTHETIC Does Not Exist'],
]);

describe('the issues of scanned decks', () => {
  test('a deck with a card the engine cannot run is a deck support issue, one the engine runs is a precon issue', async () => {
    const dir = await tempDir();
    const forms = await writeForms(bulkCards(), dir);
    await writeFile(path.join(dir, '1.txt'), SUPPORTED);
    await writeFile(path.join(dir, '2.txt'), BLOCKED);
    await writeFile(
      path.join(dir, 'index.json'),
      JSON.stringify([
        { id: 1, name: 'Good Deck', file: '1.txt', cards: 100 },
        { id: 2, name: 'Blocked Deck', file: '2.txt', cards: 100 },
      ]),
    );
    const {
      issues: [good, blocked],
    } = await buildIssues(dir, forms.gz);
    expect(good?.title).toBe('precon Good Deck');
    expect(good?.needsSupport).toBe(false);
    expect(blocked?.title).toBe('deck support Blocked Deck');
    expect(blocked?.body).toContain('Unsupported cards (1): SYNTHETIC Glorper 1');
    expect(blocked?.body).toContain('### SYNTHETIC Glorper 1');
    expect(blocked?.body).toContain('Names not found: SYNTHETIC Does Not Exist');
    expect(blocked?.body).toContain('1x SYNTHETIC Glorper 1');
  });
});

describe('a deck the app already offers', () => {
  const GOOD = [{ id: 1, name: 'Good Deck', file: '1.txt', cards: 100 }];

  async function setup(snapshotList: string | null, decks = GOOD, theirs = SUPPORTED) {
    const dir = await tempDir();
    const forms = await writeForms(bulkCards(), dir);
    await writeFile(path.join(dir, '1.txt'), theirs);
    await writeFile(path.join(dir, '2.txt'), BLOCKED);
    await writeFile(path.join(dir, 'index.json'), JSON.stringify(decks));
    const snapshots = path.join(dir, 'snapshots');
    await mkdir(snapshots);
    if (snapshotList !== null) {
      await writeFile(
        path.join(snapshots, 'good.json'),
        JSON.stringify({ id: 'good', name: 'The Good Precon', decklist: snapshotList }),
      );
    }
    return { dir, forms, snapshots };
  }

  test('with the same list gets no issue, and the others still do', async () => {
    const both = [...GOOD, { id: 2, name: 'Blocked Deck', file: '2.txt', cards: 100 }];
    const { dir, forms, snapshots } = await setup(SUPPORTED, both);
    const { issues, upToDate } = await buildIssues(dir, forms.gz, snapshots);
    expect(issues.map((i) => i.title)).toEqual(['deck support Blocked Deck']);
    expect(upToDate).toEqual([{ deck: 'Good Deck', precon: 'The Good Precon' }]);
  });

  test('with another list gets an update issue that says what differs, under a title that names the list', async () => {
    // Ten distinct cards each; the app has a Vanilla 5 that Archidekt dropped, Archidekt has a Flier 3 the app lacks, and two Vanilla 2 where the app has one.
    const common = [1, 2, 3, 4].map((n) => `SYNTHETIC Vanilla ${n}`);
    const fliers = [1, 2, 3, 4].map((n) => `SYNTHETIC Flier ${n}`);
    const list = (cards: string[], twice: string, forests: number) =>
      `Commander\n1x ${cards[0]}\n\nMainboard\n${cards
        .slice(1)
        .map((c) => `${c === twice ? 2 : 1}x ${c}`)
        .join('\n')}\n${forests}x SYNTHETIC Forest\n`;
    const ours = list(
      [...common, ...fliers.slice(0, 2), 'SYNTHETIC Vanilla 5', 'SYNTHETIC Mana Rock'],
      '',
      92,
    );
    const theirs = list(
      [...common, ...fliers.slice(0, 2), 'SYNTHETIC Flier 3', 'SYNTHETIC Mana Rock'],
      'SYNTHETIC Vanilla 2',
      91,
    );
    const { dir, forms, snapshots } = await setup(ours, GOOD, theirs);
    const { issues, upToDate } = await buildIssues(dir, forms.gz, snapshots);
    expect(upToDate).toEqual([]);
    const [update] = issues;
    expect(update?.title).toMatch(/^update precon The Good Precon \(list [0-9a-f]{6}\)$/);
    expect(update?.needsSupport).toBe(false);
    expect(update?.marker).toMatch(/^precon-issues:deck=1:update:[0-9a-f]{6}$/);
    expect(update?.body).toContain('## Update the precon "The Good Precon"');
    expect(update?.body).toContain('Cards to add:\n- 1x SYNTHETIC Flier 3');
    expect(update?.body).toContain('Cards to remove:\n- 1x SYNTHETIC Vanilla 5');
    expect(update?.body).toContain('SYNTHETIC Vanilla 2: 1 -> 2');
    expect(update?.body).toContain('--id good');
    expect(update?.body).toContain(`<!-- ${update?.marker} -->`);
  });

  test('a deck the app lacks has an add marker, and the marker of a list changes with the list', async () => {
    const { dir, forms, snapshots } = await setup(null);
    const { issues } = await buildIssues(dir, forms.gz, snapshots);
    expect(issues[0]?.marker).toBe('precon-issues:deck=1:add');
    expect(issues[0]?.body).toContain('<!-- precon-issues:deck=1:add -->');
  });
});

describe('the planar deck of a box', () => {
  const planes = Array.from({ length: 10 }, (_, i) => `1x SYNTHETIC Plane ${i + 1}`).join('\n');

  async function run(text: string) {
    const dir = await tempDir();
    const forms = await writeForms(bulkCards(), dir);
    await writeFile(path.join(dir, '1.txt'), text);
    await writeFile(
      path.join(dir, 'index.json'),
      JSON.stringify([{ id: 1, name: 'Box Deck', file: '1.txt', cards: 110 }]),
    );
    return buildIssues(dir, forms.gz);
  }

  test('is set apart: the deck is supported as its 100 cards, and the planes are listed as left out', async () => {
    const { issues, skipped } = await run(`${BLOCKED}${planes}\n`);
    expect(skipped).toEqual([]);
    const [issue] = issues;
    expect(issue?.title).toBe('deck support Box Deck');
    expect(issue?.body).not.toContain('1x SYNTHETIC Plane 1\n1x');
    expect(issue?.body.split('---')[0]).not.toContain('Plane');
    expect(issue?.body).toContain('## Left out for now: 10 cards that are not part of the 100');
    expect(issue?.body).toContain('- SYNTHETIC Plane 7');
    expect(issue?.body).toContain('Unsupported cards (1): SYNTHETIC Glorper 1');
  });

  test('a deck that is not 100 cards without the planes is skipped, and says so', async () => {
    const { issues, skipped } = await run(`${BLOCKED}5x SYNTHETIC Vanilla 3\n`);
    expect(issues).toEqual([]);
    expect(skipped).toEqual([
      '"Box Deck" has 105 cards without the planar cards, a precon has 100',
    ]);
  });

  test('the types that are not played in a Commander deck', () => {
    for (const line of [
      'Plane — Dominaria',
      'Phenomenon',
      'Ongoing Scheme',
      'Vanguard',
      'Conspiracy',
    ]) {
      expect(isOutsideTheDeck(line)).toBe(true);
    }
    for (const line of [
      'Legendary Planeswalker — Jace',
      'Creature — Elf Plane',
      'Basic Land — Forest',
      '',
    ]) {
      expect(isOutsideTheDeck(line)).toBe(false);
    }
  });
});
