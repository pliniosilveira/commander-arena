// The mana estimate of the HeuristicAgent reads "{T}: Add" from the text; a "Max speed — {T}: Add ..." line counts only at speed 4 (CR 702.178a, issue 144).
import type { ObjectView } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { unitsOf } from '../src/heuristic-mana';

// A minimal view of an untapped artifact: only the fields the estimate reads.
const engine = {
  tapped: false,
  summoningSick: false,
  types: ['artifact'],
  subtypes: [],
  oracleText: 'Max speed — {T}: Add {R}.',
} as unknown as ObjectView;

describe('the mana a "Max speed" ability counts for', () => {
  test('nothing below max speed, one red unit at max speed', () => {
    expect(unitsOf(engine)).toEqual([]);
    expect(unitsOf(engine, false)).toEqual([]);
    expect(unitsOf(engine, true)).toEqual([['R']]);
  });

  test('an ungated mana ability on the same card counts at every speed', () => {
    const both = {
      ...engine,
      oracleText: '{T}: Add {C}.\nMax speed — {T}: Add {R}.',
    } as ObjectView;
    expect(unitsOf(both)).toEqual([['C']]);
  });
});
