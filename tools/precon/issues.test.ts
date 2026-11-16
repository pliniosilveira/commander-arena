// The issues the workflow "Precon issues" opens, judged against a SYNTHETIC bulk file (tools/corpus/synthetic.ts): invented cards, no real precon.

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { tempDir, writeForms } from '../corpus/fixture-files.ts';
import { syntheticCards } from '../corpus/synthetic.ts';
import { buildIssues } from './issues.ts';

const SUPPORTED = 'Commander\n1x SYNTHETIC Vanilla 1\n\nMainboard\n2x SYNTHETIC Vanilla 2\n';
const BLOCKED =
  'Commander\n1x SYNTHETIC Vanilla 1\n\nMainboard\n1x SYNTHETIC Glorper 1\n1x SYNTHETIC Does Not Exist\n';

describe('the issues of scanned decks', () => {
  test('a deck with a card the engine cannot run is a deck support issue, one the engine runs is a precon issue', async () => {
    const dir = await tempDir();
    const forms = await writeForms(syntheticCards(), dir);
    await writeFile(path.join(dir, '1.txt'), SUPPORTED);
    await writeFile(path.join(dir, '2.txt'), BLOCKED);
    await writeFile(
      path.join(dir, 'index.json'),
      JSON.stringify([
        { id: 1, name: 'Good Deck', file: '1.txt', cards: 3 },
        { id: 2, name: 'Blocked Deck', file: '2.txt', cards: 3 },
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
  const GOOD = [{ id: 1, name: 'Good Deck', file: '1.txt', cards: 3 }];

  async function setup(snapshotList: string | null, decks = GOOD, theirs = SUPPORTED) {
    const dir = await tempDir();
    const forms = await writeForms(syntheticCards(), dir);
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
    const both = [...GOOD, { id: 2, name: 'Blocked Deck', file: '2.txt', cards: 3 }];
    const { dir, forms, snapshots } = await setup(SUPPORTED, both);
    const { issues, upToDate } = await buildIssues(dir, forms.gz, snapshots);
    expect(issues.map((i) => i.title)).toEqual(['deck support Blocked Deck']);
    expect(upToDate).toEqual([{ deck: 'Good Deck', precon: 'The Good Precon' }]);
  });

  test('with another list gets an update issue that says what differs, under a title that names the list', async () => {
    // Ten distinct cards each; the app has a Vanilla 5 that Archidekt dropped, Archidekt has a Flier 3 the app lacks, and two Vanilla 2 where the app has one.
    const common = [1, 2, 3, 4].map((n) => `SYNTHETIC Vanilla ${n}`);
    const fliers = [1, 2, 3, 4].map((n) => `SYNTHETIC Flier ${n}`);
    const list = (cards: string[], twice: string) =>
      `Commander\n1x ${cards[0]}\n\nMainboard\n${cards
        .slice(1)
        .map((c) => `${c === twice ? 2 : 1}x ${c}`)
        .join('\n')}\n`;
    const ours = list(
      [
        ...common,
        ...fliers.slice(0, 2),
        'SYNTHETIC Vanilla 5',
        'SYNTHETIC Mana Rock',
        'SYNTHETIC Forest',
      ],
      '',
    );
    const theirs = list(
      [
        ...common,
        ...fliers.slice(0, 2),
        'SYNTHETIC Flier 3',
        'SYNTHETIC Mana Rock',
        'SYNTHETIC Forest',
      ],
      'SYNTHETIC Vanilla 2',
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
