import { describe, expect, test } from 'vitest';
import { parseOptions } from './args.ts';

const GOOD = [
  '--file',
  'bulk.jsonl.gz',
  '--deck',
  'decks/x.txt',
  '--id',
  'synthetic-deck',
  '--name',
  'SYNTHETIC Deck',
  '--blurb',
  'A SYNTHETIC deck.',
];

describe('parseOptions', () => {
  test('reads every option', () => {
    expect(parseOptions([...GOOD, '--out', 'somewhere'])).toEqual({
      file: 'bulk.jsonl.gz',
      deck: 'decks/x.txt',
      id: 'synthetic-deck',
      name: 'SYNTHETIC Deck',
      blurb: 'A SYNTHETIC deck.',
      out: 'somewhere',
      help: false,
    });
  });

  test('--help needs nothing else', () => {
    expect(parseOptions(['--help'])).toMatchObject({ help: true });
    expect(parseOptions(['-h'])).toMatchObject({ help: true });
  });

  test.each(['file', 'deck', 'id', 'name', 'blurb'])('--%s is required', (key) => {
    const argv = [...GOOD];
    const at = argv.indexOf(`--${key}`);
    argv.splice(at, 2);
    expect(parseOptions(argv)).toBe(`--${key} is required`);
  });

  test('an id is lower-case words joined by single dashes', () => {
    for (const id of ['Zombies', 'a b', 'x-', 'a--b', 'a_b']) {
      const argv = [...GOOD];
      argv[argv.indexOf('--id') + 1] = id;
      expect(parseOptions(argv), id).toMatch(/--id may only hold/);
    }
  });

  test('unknown options and stray arguments are errors', () => {
    expect(parseOptions([...GOOD, '--nope'])).toMatch(/nope/);
    expect(parseOptions([...GOOD, 'extra'])).toBe('unexpected argument extra');
    expect(parseOptions([...GOOD, '--out'])).toMatch(/--out/);
  });
});
