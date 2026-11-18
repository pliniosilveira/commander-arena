// The First Flight deck (Kangee): the effect "attacking creatures with flying get +1/+1 until end of turn" and "blocking creatures with flying get +0/+2 until end of turn"
// of Kangee's Lieutenant and Kangee, Sky Warden (the triggers are the printed text; the cards are not in the golden corpus). The first line of each block is the printed
// line; the others are SYNTHETIC siblings and the near misses the grammar must not read. The engine runs what is lowered in
// convert-grammar-engine-first-flight-attack-pump.test.ts.
import { describe, expect, test } from 'vitest';
import { read, readAll } from './parser-p5-helpers';

const each = (filter: Record<string, unknown>) => ({
  kind: 'each',
  filter: { zone: 'battlefield', types: ['creature'], ...filter },
});

const pump = (
  trigger: unknown,
  filter: Record<string, unknown>,
  power: number,
  toughness: number,
) => ({
  kind: 'triggered',
  trigger,
  effect: {
    kind: 'modifyPt',
    objects: each(filter),
    power,
    toughness,
    duration: 'untilEndOfTurn',
  },
});

const ATTACKS = { kind: 'attacks', what: { kind: 'this' } };
const BLOCKS = { kind: 'blocks', what: { kind: 'this' } };

describe('"attacking creatures with flying get +N/+N until end of turn" (CR 508.1k, 611.2c, 613.4c)', () => {
  test("the printed line of Kangee's Lieutenant", () => {
    const parsed = readAll(
      'Whenever this creature attacks, attacking creatures with flying get +1/+1 until end of turn.',
    );
    expect(parsed.unparsed).toEqual([]);
    expect(parsed.abilities).toEqual([
      pump(ATTACKS, { keywords: ['flying'], attacking: true }, 1, 1),
    ]);
  });

  test('the printed attack line of Kangee: +2/+0', () => {
    expect(
      readAll('Whenever ~ attacks, attacking creatures with flying get +2/+0 until end of turn.')
        .abilities,
    ).toEqual([pump(ATTACKS, { keywords: ['flying'], attacking: true }, 2, 0)]);
  });

  test('another keyword (SYNTHETIC)', () => {
    expect(
      readAll('Whenever ~ attacks, attacking creatures with trample get +1/+1 until end of turn.')
        .abilities,
    ).toEqual([pump(ATTACKS, { keywords: ['trample'], attacking: true }, 1, 1)]);
  });

  test('without the keyword: every attacking creature (SYNTHETIC)', () => {
    expect(
      readAll('Whenever ~ attacks, attacking creatures get +1/+0 until end of turn.').abilities,
    ).toEqual([pump(ATTACKS, { attacking: true }, 1, 0)]);
  });

  test.each([
    'Whenever ~ attacks, attacking creatures with flying get +1/+1.',
    'Whenever ~ attacks, attacking creatures with flying gets +1/+1 until end of turn.',
    'Whenever ~ attacks, attacking creatures with flying or reach get +1/+1 until end of turn.',
    'Whenever ~ attacks, attacking creatures with flying get +1/+1 until your next turn.',
    'Whenever ~ attacks, attacking creatures with flying gets 1/1 until end of turn.',
  ])('near miss: %s', (text) => {
    const parsed = read(text, 'creature');
    expect(parsed.abilities, text).toEqual([]);
    expect(parsed.unparsed, text).toHaveLength(1);
  });
});

describe('"blocking creatures with flying get +0/+2 until end of turn" (CR 509.1g, 611.2c, 613.4c)', () => {
  test('the printed block line of Kangee', () => {
    const parsed = readAll(
      'Whenever ~ blocks, blocking creatures with flying get +0/+2 until end of turn.',
    );
    expect(parsed.unparsed).toEqual([]);
    expect(parsed.abilities).toEqual([
      pump(BLOCKS, { keywords: ['flying'], blocking: true }, 0, 2),
    ]);
  });

  test('blocking creatures of any kind (SYNTHETIC)', () => {
    expect(
      readAll('Whenever ~ blocks, blocking creatures get +1/+1 until end of turn.').abilities,
    ).toEqual([pump(BLOCKS, { blocking: true }, 1, 1)]);
  });

  test.each([
    'Whenever ~ blocks, blocking creatures with flying get +0/+2.',
    'Whenever ~ blocks, blocking creatures with flying gets +0/+2 until end of turn.',
    'Whenever ~ blocks, blocking creature with flying get +0/+2 until end of turn.',
  ])('near miss: %s', (text) => {
    const parsed = read(text, 'creature');
    expect(parsed.abilities, text).toEqual([]);
    expect(parsed.unparsed, text).toHaveLength(1);
  });
});
