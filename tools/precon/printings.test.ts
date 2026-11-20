// The refresh of the printings of the precons of the app. Every deck, card and set here is SYNTHETIC: nothing was fetched.

import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { printingCount, refreshPrintings } from './printings.ts';

const PLAIN = 'Commander\n1x SYNTHETIC Zed\n\nMainboard\n1x SYNTHETIC Alpha\n3x SYNTHETIC Forest';
const PRINTED =
  'Commander\n1x SYNTHETIC Zed (zzz) 6\n\nMainboard\n1x SYNTHETIC Alpha (zzz) 12\n3x SYNTHETIC Forest (zzz) 301';

async function setup(snapshot: string, theirs: string) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'printings-'));
  await writeFile(path.join(dir, '1.txt'), theirs);
  await writeFile(
    path.join(dir, 'index.json'),
    JSON.stringify([{ id: 1, name: 'Zed Deck', file: '1.txt', cards: 5 }]),
  );
  const snapshots = path.join(dir, 'snapshots');
  await mkdir(snapshots);
  const file = path.join(snapshots, 'zed.json');
  await writeFile(
    file,
    JSON.stringify({ id: 'zed', name: 'Zed', cards: [{ name: 'kept' }], decklist: snapshot }),
  );
  return { dir, snapshots, file };
}

describe('the printings of a precon', () => {
  test('are counted from the card lines that name a set', () => {
    expect(printingCount(PRINTED)).toEqual({ named: 3, total: 3 });
    expect(printingCount(PLAIN)).toEqual({ named: 0, total: 3 });
  });

  test('replace the decklist of a snapshot with the same cards, and nothing else in it', async () => {
    const { dir, snapshots, file } = await setup(PLAIN, PRINTED);
    const [outcome] = await refreshPrintings(dir, snapshots);
    expect(outcome?.status).toBe('updated');
    const written = JSON.parse(await readFile(file, 'utf8'));
    expect(written.decklist).toBe(PRINTED);
    expect(written.cards).toEqual([{ name: 'kept' }]);
    expect(await readFile(file, 'utf8')).toMatch(/\n$/);
  });

  test('a second run changes nothing', async () => {
    const { dir, snapshots } = await setup(PRINTED, PRINTED);
    const [outcome] = await refreshPrintings(dir, snapshots);
    expect(outcome?.status).toBe('unchanged');
  });

  test('are not taken from a list that names none', async () => {
    const { dir, snapshots, file } = await setup(PLAIN, PLAIN);
    const [outcome] = await refreshPrintings(dir, snapshots);
    expect(outcome?.status).toBe('unchanged');
    expect(JSON.parse(await readFile(file, 'utf8')).decklist).toBe(PLAIN);
  });

  test('are not taken from a deck with another list, which is reported', async () => {
    const other = PRINTED.replace('3x SYNTHETIC Forest (zzz) 301', '2x SYNTHETIC Forest (zzz) 301');
    const { dir, snapshots, file } = await setup(PLAIN, other);
    const [outcome] = await refreshPrintings(dir, snapshots);
    expect(outcome?.status).toBe('different');
    expect(JSON.parse(await readFile(file, 'utf8')).decklist).toBe(PLAIN);
  });

  test('a snapshot with no deck on Archidekt is reported as missing', async () => {
    const { dir, snapshots } = await setup(
      'Commander\n1x SYNTHETIC Other\n\nMainboard\n1x SYNTHETIC Different',
      PRINTED,
    );
    const [outcome] = await refreshPrintings(dir, snapshots);
    expect(outcome?.status).toBe('missing');
  });
});
