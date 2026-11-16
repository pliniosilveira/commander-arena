import { test } from 'vitest';
import { read } from './parser-p5-helpers';

const LINES: Array<[string, any]> = [
  ['Whenever ~ or another creature you control enters, scry 1.', 'creature'],
  ['Whenever you scry or surveil, draw a card.', 'creature'],
];
test('probe', () => {
  for (const [t, ty] of LINES) {
    const p = read(t, ty);
    console.log('LINE', t, '\n  =>', JSON.stringify(p.abilities ?? null).slice(0, 300), JSON.stringify(p.spell ?? null).slice(0, 500), '\n  UNPARSED', JSON.stringify(p.unparsed).slice(0, 900));
  }
});
